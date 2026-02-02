import express, {RequestHandler, Request, Response} from 'express'
import {Server} from 'socket.io'
import http from 'http'
import {Client, LocalAuth, Message, MessageMedia, MessageTypes, Contact, Chat} from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'
import path from 'path'
import moment from 'moment'
import multer from 'multer'
import log4js from 'log4js'

interface SendMessageBody {
    chatId: string
    message: string
}

interface MessageData {
    id: string
    sender: string
    senderName: string
    message: string | null
    timestamp: string
    isRead: boolean
    chatId: string
    mediaUrl?: string | null
    fileName?: string | null
    type: string
    fromMe: boolean
    status?: 'sent' | 'delivered' | 'read'
    replyTo?: MessageData | null
}

interface ContactStatus {
    userId: string
    isOnline: boolean
    lastSeen: number | null
    lastSeenFormatted?: string
    isTyping?: boolean
    timestamp?: number
}

interface TypingStatus {
    chatId: string
    isTyping: boolean
    userId: string
    userName?: string
    timestamp: number
}

log4js.configure({
    appenders: { cheese: { type: 'file', filename: 'cheese.log' } },
    categories: { default: { appenders: ['cheese'], level: 'debug' } }
})

const logger = log4js.getLogger('cheese')

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

const upload = multer({
    limits: {
        fileSize: 16 * 1024 * 1024
    }
})

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
})

let qrCode: string | null = null
let connectedNumber: string | null = null
let userName: string | null = null
let chatList: any[] = []
const typingUsers = new Map<string, NodeJS.Timeout>()
const contactStatuses = new Map<string, ContactStatus>()

// Fungsi untuk mengurutkan chat list - YANG DIPERBAIKI
const sortChatList = (chats: any[]): any[] => {
    if (!chats || chats.length === 0) return [];
    
    // Pastikan timestamp valid
    const validChats = chats.filter(chat => chat && chat.timestamp);
    
    // Sort descending (terbaru di atas)
    return [...validChats].sort((a, b) => {
        // Pastikan timestamp adalah number
        const timeA = Number(a.timestamp) || 0;
        const timeB = Number(b.timestamp) || 0;
        return timeB - timeA; // DESC: terbaru pertama
    });
}

// Update chat list dan emit ke semua client
const updateAndEmitChatList = () => {
    chatList = sortChatList(chatList);
    io.emit('updateChatList', chatList);
}

// Fungsi untuk update contact status
const updateContactStatus = async (contactId: string): Promise<ContactStatus | null> => {
    try {
        const contact = await client.getContactById(contactId);
        const contactAny = contact as any;
        const lastSeen = contactAny.lastSeen ? contactAny.lastSeen * 1000 : null;
        
        const status: ContactStatus = {
            userId: contactId,
            isOnline: contactAny.isOnline || false,
            lastSeen: lastSeen,
            lastSeenFormatted: lastSeen ? 
                moment(lastSeen).fromNow() : 
                'Tidak tersedia',
            timestamp: Date.now()
        };
        
        contactStatuses.set(contactId, status);
        return status;
    } catch (error) {
        logger.error(`Error updating status for ${contactId}:`, error);
        return null;
    }
}

// Fungsi untuk request presence
const requestPresence = async (contactId: string): Promise<boolean> => {
    try {
        await client.sendPresenceAvailable();
        await client.getContactById(contactId);
        
        const status = await updateContactStatus(contactId);
        if (status) {
            io.emit('presenceUpdate', status);
        }
        
        logger.info(`Requested presence for: ${contactId}`);
        return true;
    } catch (error) {
        logger.error(`Error requesting presence for ${contactId}:`, error);
        return false;
    }
}

client.on('qr', (qr) => {
    qrCode = qr;
    qrcode.generate(qr, { small: true });
    io.emit('qr', qr);
    logger.info('QR code received and emitted');
});

client.on('ready', async () => {
    const info = client.info;
    connectedNumber = info.wid.user;
    userName = info.pushname;

    // Set diri sendiri sebagai online
    contactStatuses.set(info.wid._serialized, {
        userId: info.wid._serialized,
        isOnline: true,
        lastSeen: Date.now(),
        lastSeenFormatted: 'Online',
        timestamp: Date.now()
    });

    const chats = await client.getChats();
    
    // Reset chatList
    chatList = [];
    
    for (const chat of chats) {
        try {
            const messages = await chat.fetchMessages({ limit: 1 });
            const lastMsg = messages[0] || {};
            
            // Pastikan timestamp valid
            const timestamp = lastMsg.timestamp ? lastMsg.timestamp * 1000 : Date.now();
            
            const chatItem = {
                id: chat.id._serialized,
                name: chat.name,
                lastMessage: lastMsg.body || '',
                timestamp: timestamp,
                unreadCount: chat.unreadCount || 0,
                type: lastMsg.hasMedia ?
                    (lastMsg.type === 'image' ? 'image' : 'document')
                    : 'text',
                isGroup: chat.isGroup || false,
                // Update status untuk kontak individual
                ...(!chat.isGroup && {
                    contactId: chat.id._serialized
                })
            };
            
            chatList.push(chatItem);
            
            // Update status untuk kontak individual
            if (!chat.isGroup) {
                try {
                    await updateContactStatus(chat.id._serialized);
                } catch (error) {
                    logger.error(`Error updating status for ${chat.id._serialized}:`, error);
                }
            }
        } catch (error) {
            logger.error(`Error processing chat ${chat.id._serialized}:`, error);
        }
    }

    // Urutkan chat list
    updateAndEmitChatList();

    io.emit('ready', {
        phoneNumber: connectedNumber,
        userName: userName,
        chats: chatList
    });
    
    // Kirim semua status awal ke client
    const allStatuses = Array.from(contactStatuses.values());
    io.emit('initialStatuses', allStatuses);
    
    logger.info('Client is ready');
});

// Handler untuk typing status dari WhatsApp
client.on('chatstate', async (chatState: any) => {
    try {
        if (!chatState || !chatState.id) return;
        
        const chatId = chatState.id._serialized;
        const state = chatState.state;
        const isTyping = state === 'composing';
        
        // Dapatkan info kontak
        let contactName = 'Someone';
        try {
            const contact = await client.getContactById(chatId);
            contactName = contact.name || contact.pushname || contact.id.user || 'Someone';
        } catch (error) {
            logger.error('Error getting contact info for typing:', error);
        }
        
        const typingStatus: TypingStatus = {
            chatId,
            isTyping,
            userId: chatId,
            userName: contactName,
            timestamp: Date.now()
        };
        
        io.emit('typingStatus', typingStatus);
        
        logger.info(`Typing status: ${chatId} - ${isTyping ? 'typing' : 'stopped'}`);
    } catch (error) {
        logger.error('Error handling chatstate:', error);
    }
});

// Handler untuk presence updates
client.on('presence_update', async (presence: any) => {
    try {
        const contactId = presence.id._serialized;
        
        const status = await updateContactStatus(contactId);
        if (status) {
            io.emit('presenceUpdate', status);
            logger.info(`Presence updated for ${contactId}: ${status.isOnline ? 'Online' : 'Offline'}`);
        }
    } catch (error) {
        logger.error('Error handling presence update:', error);
    }
});

client.on('message', async (message: Message) => {
    const timestamp = new Date(message.timestamp * 1000);

    let mediaUrl = null;
    let fileName = null;
    if (message.hasMedia) {
        try {
            const media = await message.downloadMedia();
            mediaUrl = `data:${media.mimetype};base64,${media.data}`;
            fileName = media.filename || 'Download Document';
        } catch (error) {
            logger.error('Error downloading media:', error);
        }
    }

    let senderName = message.from.split('@')[0];
    try {
        const contact = await message.getContact();
        senderName = contact.pushname || contact.name || senderName;
    } catch (error) {
        logger.error('Error getting contact info:', error);
    }

    const replyTo = message.hasQuotedMsg ? await getQuotedMessageData(message) : null;

    const messageData: MessageData = {
        id: message.id._serialized,
        sender: message.from,
        senderName: senderName,
        message: message.body,
        timestamp: timestamp.toISOString(),
        isRead: false,
        chatId: message.from,
        mediaUrl,
        fileName,
        type: message.type,
        fromMe: message.fromMe,
        status: message.fromMe ? 'sent' : undefined,
        replyTo
    };

    // Update atau tambahkan chat di chatList
    const chatIndex = chatList.findIndex(chat => chat.id === message.from);
    
    if (chatIndex !== -1) {
        // Update chat yang sudah ada
        chatList[chatIndex].lastMessage = message.body || (fileName ? `📎 ${fileName}` : '📷 Image');
        chatList[chatIndex].timestamp = timestamp.getTime();
        chatList[chatIndex].type = message.hasMedia ?
            (message.type === 'image' ? 'image' : 'document')
            : 'text';
        
        if (!message.fromMe) {
            chatList[chatIndex].unreadCount = (chatList[chatIndex].unreadCount || 0) + 1;
        }
    } else {
        // Tambah chat baru
        const chatItem = {
            id: message.from,
            name: senderName,
            lastMessage: message.body || (fileName ? `📎 ${fileName}` : '📷 Image'),
            timestamp: timestamp.getTime(),
            unreadCount: message.fromMe ? 0 : 1,
            type: message.hasMedia ?
                (message.type === 'image' ? 'image' : 'document')
                : 'text',
            isGroup: false
        };
        
        chatList.push(chatItem);
    }

    // Urutkan ulang chat list
    updateAndEmitChatList();

    io.emit('message', messageData);
    logger.info('New message received and processed');
});

client.on('message_ack', (message: Message, ack: number) => {
    let status: 'sent' | 'delivered' | 'read';
    switch(ack) {
        case 1:
            status = 'sent';
            break;
        case 2:
            status = 'delivered';
            break;
        case 3:
            status = 'read';
            break;
        default:
            status = 'sent';
    }

    io.emit('messageStatus', {
        messageId: message.id._serialized,
        status
    });
    logger.info(`Message ${message.id._serialized} status updated to ${status}`);
});

const sendMessageHandler: RequestHandler = async (req, res) => {
    try {
        const { chatId, message } = req.body as SendMessageBody;
        const media = req.file;
        const replyTo = req.body.replyTo ? JSON.parse(req.body.replyTo) : null;

        let sentMessage;
        let mediaUrl = null;
        let fileName = null;

        const options: any = {};
        if (replyTo) {
            options.quotedMessageId = replyTo.id;
        }

        if (media) {
            const messageMedia = new MessageMedia(
                media.mimetype,
                media.buffer.toString('base64'),
                media.originalname
            );
            options.caption = message;

            sentMessage = await client.sendMessage(chatId, messageMedia, options);
            mediaUrl = `data:${media.mimetype};base64,${media.buffer.toString('base64')}`;
            fileName = media.originalname;
        } else {
            sentMessage = await client.sendMessage(chatId, message, options);
        }

        const messageData: MessageData = {
            id: sentMessage.id._serialized,
            sender: sentMessage.from,
            senderName: userName || sentMessage.from.split('@')[0],
            message: message || (media ? fileName : ''),
            timestamp: new Date().toISOString(),
            isRead: false,
            chatId: chatId,
            mediaUrl,
            fileName,
            type: media ? (media.mimetype.startsWith('image') ? 'image' : 'document') : 'text',
            fromMe: true,
            status: 'sent',
            replyTo: replyTo ? {
                ...replyTo,
                mediaUrl: replyTo.mediaUrl || null,
                fileName: replyTo.fileName || null,
                type: replyTo.type || 'text'
            } : null
        };

        io.emit('message', messageData);
        res.json({ success: true });
        logger.info(`Message sent to ${chatId}`);
    } catch (error) {
        logger.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
};

const getQuotedMessageData = async (message: Message): Promise<MessageData> => {
    const quotedMsg = await message.getQuotedMessage();
    const timestamp = new Date(quotedMsg.timestamp * 1000);

    let mediaUrl = null;
    let fileName = null;
    let type = quotedMsg.type;

    if (quotedMsg.hasMedia) {
        try {
            const media = await quotedMsg.downloadMedia();
            mediaUrl = `data:${media.mimetype};base64,${media.data}`;
            fileName = media.filename || 'Download Document';
            type = media.mimetype.startsWith('image') ? MessageTypes.IMAGE : MessageTypes.DOCUMENT;
        } catch (error) {
            logger.error('Error downloading quoted message media:', error);
            type = quotedMsg.type;
        }
    }

    let senderName = quotedMsg.from.split('@')[0];
    try {
        const contact = await quotedMsg.getContact();
        senderName = contact.pushname || contact.name || senderName;
    } catch (error) {
        logger.error('Error getting quoted message contact info:', error);
    }

    return {
        id: quotedMsg.id._serialized,
        sender: quotedMsg.from,
        senderName: senderName,
        message: quotedMsg.body || (fileName ? `Media: ${fileName}` : ''),
        timestamp: timestamp.toISOString(),
        isRead: false,
        chatId: quotedMsg.from,
        mediaUrl,
        fileName,
        type,
        fromMe: quotedMsg.fromMe,
        status: quotedMsg.fromMe ? 'sent' : undefined
    };
};

const getChatHistoryHandler: RequestHandler = async (req, res, next) => {
    try {
        const { chatId } = req.params;
        logger.info(`Fetching chat history for chatId: ${chatId}`);

        if (!chatId) {
            logger.error('No chatId provided');
            res.status(400).json({ error: 'ChatId is required' });
            return;
        }

        let chat;
        try {
            chat = await client.getChatById(chatId);
        } catch (error) {
            logger.error(`Error getting chat for ID ${chatId}:`, error);
            res.status(404).json({ error: `Chat not found: ${chatId}` });
            return;
        }

        let messages;
        try {
            messages = await chat.fetchMessages({ limit: 50 });
            logger.info(`Retrieved ${messages.length} messages for chat ${chatId}`);
        } catch (error) {
            logger.error(`Error fetching messages for chat ${chatId}:`, error);
            res.status(500).json({ error: 'Failed to fetch messages' });
            return;
        }

        const formattedMessages = await Promise.all(messages.map(async (msg) => {
            try {
                let mediaUrl = null;
                let fileName = null;

                if (msg.hasMedia) {
                    try {
                        const media = await msg.downloadMedia();
                        if (media) {
                            mediaUrl = `data:${media.mimetype};base64,${media.data}`;
                            fileName = media.filename || 'Download Document';
                        }
                    } catch (mediaError) {
                        logger.error(`Error downloading media for message ${msg.id._serialized}:`, mediaError);
                    }
                }

                let senderName = msg.from.split('@')[0];
                try {
                    const contact = await msg.getContact();
                    senderName = contact.pushname || contact.name || senderName;
                } catch (contactError) {
                    logger.error(`Error getting contact info for message ${msg.id._serialized}:`, contactError);
                }

                let replyTo = null;
                if (msg.hasQuotedMsg) {
                    try {
                        replyTo = await getQuotedMessageData(msg);
                    } catch (quoteError) {
                        logger.error(`Error processing quoted message for ${msg.id._serialized}:`, quoteError);
                    }
                }

                return {
                    id: msg.id._serialized,
                    sender: msg.from,
                    senderName: senderName,
                    message: msg.body,
                    timestamp: moment(msg.timestamp * 1000).toISOString(),
                    isRead: msg.isStatus,
                    chatId: msg.from,
                    mediaUrl,
                    fileName,
                    type: msg.hasMedia ?
                        (msg.type === MessageTypes.IMAGE ? 'image' : 'document')
                        : 'text',
                    fromMe: msg.fromMe,
                    status: msg.fromMe ?
                        (msg.ack >= 3 ? 'read' : msg.ack >= 2 ? 'delivered' : 'sent')
                        : undefined,
                    replyTo
                };
            } catch (messageError) {
                logger.error(`Error processing message ${msg.id._serialized}:`, messageError);
                return {
                    id: msg.id._serialized,
                    sender: msg.from,
                    senderName: msg.from.split('@')[0],
                    message: 'Error loading message',
                    timestamp: moment(msg.timestamp * 1000).toISOString(),
                    isRead: false,
                    chatId: msg.from,
                    type: 'text',
                    fromMe: msg.fromMe,
                    status: msg.fromMe ? 'sent' : undefined
                };
            }
        }));

        const validMessages = formattedMessages.filter(msg => msg !== null);

        res.json(validMessages);
        logger.info(`Successfully sent ${validMessages.length} messages for chat ${chatId}`);
    } catch (error) {
        logger.error('Error in getChatHistoryHandler:', error);
        res.status(500).json({
            error: 'Failed to fetch chat history',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};

const logoutHandler: RequestHandler = async (req, res) => {
    try {
        await client.logout();
        qrCode = null;
        connectedNumber = null;
        userName = null;
        chatList = [];
        contactStatuses.clear();
        typingUsers.forEach(timeout => clearTimeout(timeout));
        typingUsers.clear();
        client.initialize();
        io.emit('disconnected', 'User logged out');
        logger.info('User logged out and client reinitialized');
        res.json({ success: true });
    } catch (error) {
        logger.error('Error during logout:', error);
        res.status(500).json({ error: 'Failed to logout' });
    }
};

// API untuk mendapatkan status kontak
const getContactStatusHandler: RequestHandler = async (req, res) => {
    try {
        const { contactId } = req.params;
        
        if (!contactId.includes('@')) {
            res.status(400).json({ error: 'Format ID kontak tidak valid' });
            return;
        }
        
        let status = contactStatuses.get(contactId);
        
        if (!status) {
            await requestPresence(contactId);
            status = contactStatuses.get(contactId);
        }
        
        if (status) {
            res.json(status);
            return;
        } else {
            res.status(404).json({ error: 'Status kontak tidak ditemukan' });
            return;
        }
    } catch (error) {
        logger.error('Error getting contact status:', error);
        res.status(500).json({ 
            error: 'Gagal mendapatkan status kontak',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};

app.post('/api/send-message', upload.single('media'), sendMessageHandler);
app.get('/api/chat-history/:chatId', getChatHistoryHandler);
app.post('/api/logout', logoutHandler);
app.get('/api/contact-status/:contactId', getContactStatusHandler);

io.on('connection', (socket) => {
    if (connectedNumber && userName) {
        socket.emit('ready', {
            phoneNumber: connectedNumber,
            userName: userName,
            chats: chatList
        });
        
        const allStatuses = Array.from(contactStatuses.values());
        socket.emit('initialStatuses', allStatuses);
    } else if (qrCode) {
        socket.emit('qr', qrCode);
    }

    socket.on('markChatAsRead', ({ chatId }) => {
        const chatIndex = chatList.findIndex(chat => chat.id === chatId);
        if (chatIndex !== -1) {
            chatList[chatIndex].unreadCount = 0;
            updateAndEmitChatList();
        }
    });

    socket.on('markMessageAsRead', async ({ messageId, chatId }) => {
        try {
            const chat = await client.getChatById(chatId);
            if (!chat) {
                throw new Error(`Chat with ID ${chatId} not found`);
            }
            await chat.sendSeen();
            io.emit('messageRead', { messageId, chatId });
        } catch (error: any) {
            logger.error('Error marking message as read:', error);
            socket.emit('error', { message: 'Failed to mark message as read', error: error.message });
        }
    });

    // Typing dari Web ke WhatsApp
    socket.on('typing', async ({ chatId, isTyping }: { chatId: string, isTyping: boolean }) => {
        try {
            if (isTyping) {
                const chat = await client.getChatById(chatId);
                await chat.sendStateTyping();
                
                const typingStatus: TypingStatus = {
                    chatId,
                    isTyping: true,
                    userId: connectedNumber || 'unknown',
                    userName: userName || 'You',
                    timestamp: Date.now()
                };
                
                socket.broadcast.emit('typingStatus', typingStatus);
                
                // Clear timeout sebelumnya
                if (typingUsers.has(chatId)) {
                    clearTimeout(typingUsers.get(chatId)!);
                }
                
                // Auto stop setelah 5 detik
                const timeout = setTimeout(() => {
                    socket.emit('typing', { chatId, isTyping: false });
                    typingUsers.delete(chatId);
                }, 5000);
                
                typingUsers.set(chatId, timeout);
                
            } else {
                const chat = await client.getChatById(chatId);
                await chat.clearState();
                
                const typingStatus: TypingStatus = {
                    chatId,
                    isTyping: false,
                    userId: connectedNumber || 'unknown',
                    userName: userName || 'You',
                    timestamp: Date.now()
                };
                
                socket.broadcast.emit('typingStatus', typingStatus);
                
                if (typingUsers.has(chatId)) {
                    clearTimeout(typingUsers.get(chatId)!);
                    typingUsers.delete(chatId);
                }
            }
        } catch (error) {
            logger.error('Error handling typing status:', error);
        }
    });

    // Request presence untuk kontak
    socket.on('requestPresence', async ({ contactId }: { contactId: string }) => {
        try {
            const success = await requestPresence(contactId);
            if (success) {
                const status = contactStatuses.get(contactId);
                if (status) {
                    socket.emit('presenceUpdate', status);
                }
            }
        } catch (error) {
            logger.error('Error in requestPresence:', error);
            socket.emit('error', { 
                message: 'Gagal request presence',
                details: error instanceof Error ? error.message : undefined
            });
        }
    });
});

client.on('disconnected', (reason) => {
    qrCode = null;
    connectedNumber = null;
    userName = null;
    chatList = [];
    contactStatuses.clear();
    typingUsers.forEach(timeout => clearTimeout(timeout));
    typingUsers.clear();
    io.emit('disconnected', reason);
    client.initialize();
    logger.warn('Client disconnected, reinitializing...');
});

io.on('connect_error', (error) => {
    logger.error('Socket connection error:', error);
});

client.initialize();

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
});

process.on('SIGINT', async () => {
    try {
        await client.destroy();
        server.close();
        process.exit(0);
    } catch (err) {
        logger.error('Error during shutdown:', err);
        process.exit(1);
    }
});