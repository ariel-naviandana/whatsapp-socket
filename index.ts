import express, { RequestHandler } from 'express'
import { Server } from 'socket.io'
import http from 'http'
import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js'
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
    message: string
    timestamp: string
    isRead: boolean
    chatId: string
    mediaUrl?: string | null
    fileName?: string | null
    type: string
    fromMe: boolean
    status?: 'sent' | 'delivered' | 'read'
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

client.on('qr', (qr) => {
    qrCode = qr
    qrcode.generate(qr, { small: true })
    io.emit('qr', qr)
    logger.info('QR code received and emitted')
})

client.on('ready', async () => {
    const info = client.info
    connectedNumber = info.wid.user
    userName = info.pushname

    const chats = await client.getChats()
    chatList = await Promise.all(chats.map(async (chat) => {
        const messages = await chat.fetchMessages({ limit: 1 })
        const lastMsg = messages[0] || {}
        return {
            id: chat.id._serialized,
            name: chat.name,
            lastMessage: lastMsg.body || '',
            timestamp: lastMsg.timestamp ? lastMsg.timestamp * 1000 : Date.now(),
            unreadCount: chat.unreadCount
        }
    }))

    chatList.sort((a, b) => b.timestamp - a.timestamp)

    io.emit('ready', {
        phoneNumber: connectedNumber,
        userName: userName,
        chats: chatList
    })
    logger.info('Client is ready')
})

client.on('message', async (message: Message) => {
    const timestamp = new Date(message.timestamp * 1000)

    let mediaUrl = null
    if (message.hasMedia) {
        try {
            const media = await message.downloadMedia()
            mediaUrl = `data:${media.mimetype};base64,${media.data}`
        } catch (error) {
            logger.error('Error downloading media:', error)
        }
    }

    let senderName = message.from.split('@')[0]
    try {
        const contact = await message.getContact()
        senderName = contact.pushname || contact.name || senderName
    } catch (error) {
        logger.error('Error getting contact info:', error)
    }

    const messageData: MessageData = {
        id: message.id._serialized,
        sender: message.from,
        senderName: senderName,
        message: message.body,
        timestamp: timestamp.toISOString(),
        isRead: false,
        chatId: message.from,
        mediaUrl,
        type: message.type,
        fromMe: message.fromMe,
        status: message.fromMe ? 'sent' : undefined
    }

    const chatIndex = chatList.findIndex(chat => chat.id === message.from)
    if (chatIndex !== -1) {
        chatList[chatIndex].lastMessage = message.body
        chatList[chatIndex].timestamp = timestamp.getTime()
        if (!message.fromMe) {
            chatList[chatIndex].unreadCount = (chatList[chatIndex].unreadCount || 0) + 1
        }
    } else {
        chatList.push({
            id: message.from,
            name: senderName,
            lastMessage: message.body,
            timestamp: timestamp.getTime(),
            unreadCount: message.fromMe ? 0 : 1
        })
    }

    chatList.sort((a, b) => b.timestamp - a.timestamp)

    io.emit('message', messageData)
    io.emit('updateChatList', chatList)
    logger.info('New message received and processed')
})

client.on('message_ack', (message: Message, ack: number) => {
    let status: 'sent' | 'delivered' | 'read'
    switch(ack) {
        case 1:
            status = 'sent'
            break
        case 2:
            status = 'delivered'
            break
        case 3:
            status = 'read'
            break
        default:
            status = 'sent'
    }

    io.emit('messageStatus', {
        messageId: message.id._serialized,
        status
    })
    logger.info(`Message ${message.id._serialized} status updated to ${status}`)
})

const sendMessageHandler: RequestHandler = async (req, res) => {
    try {
        const { chatId, message } = req.body as SendMessageBody
        const media = req.file

        let sentMessage
        let mediaUrl = null
        let fileName = null

        if (media) {
            const messageMedia = new MessageMedia(
                media.mimetype,
                media.buffer.toString('base64'),
                media.originalname
            )
            sentMessage = await client.sendMessage(chatId, messageMedia, { caption: message })
            mediaUrl = `data:${media.mimetype};base64,${media.buffer.toString('base64')}`
            fileName = media.originalname
        } else {
            sentMessage = await client.sendMessage(chatId, message)
        }

        const messageData: MessageData = {
            id: sentMessage.id._serialized,
            sender: sentMessage.from,
            senderName: userName || sentMessage.from.split('@')[0],
            message: sentMessage.body,
            timestamp: new Date().toISOString(),
            isRead: false,
            chatId: chatId,
            mediaUrl,
            fileName,
            type: media ? (media.mimetype.startsWith('image') ? 'image' : 'document') : 'text',
            fromMe: true,
            status: 'sent'
        }

        io.emit('message', messageData)
        res.json({ success: true })
        logger.info(`Message sent to ${chatId}`)
    } catch (error) {
        logger.error('Error sending message:', error)
        res.status(500).json({ error: 'Failed to send message' })
    }
}

const getChatHistoryHandler: RequestHandler = async (req, res) => {
    try {
        const { chatId } = req.params
        const chat = await client.getChatById(chatId)
        const messages = await chat.fetchMessages({ limit: 50 })

        const formattedMessages = await Promise.all(messages.map(async (msg) => {
            let mediaUrl = null
            if (msg.hasMedia) {
                try {
                    const media = await msg.downloadMedia()
                    mediaUrl = `data:${media.mimetype};base64,${media.data}`
                } catch (error) {
                    logger.error('Error downloading media:', error)
                }
            }

            let senderName = msg.from.split('@')[0]
            try {
                const contact = await msg.getContact()
                senderName = contact.pushname || contact.name || senderName
            } catch (error) {
                logger.error('Error getting contact info:', error)
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
                type: msg.hasMedia ? (msg.type === 'image' ? 'image' : 'document') : 'text',
                fromMe: msg.fromMe,
                status: msg.fromMe ? (msg.ack >= 3 ? 'read' : msg.ack >= 2 ? 'delivered' : 'sent') : undefined
            }
        }))

        res.json(formattedMessages)
        logger.info(`Chat history for ${chatId} fetched`)
    } catch (error) {
        logger.error('Error fetching chat history:', error)
        res.status(500).json({ error: 'Failed to fetch chat history' })
    }
}

const logoutHandler: RequestHandler = async (req, res) => {
    try {
        await client.logout()
        qrCode = null
        connectedNumber = null
        userName = null
        chatList = []
        client.initialize()
        io.emit('disconnected', 'User logged out')
        logger.info('User logged out and client reinitialized')
        res.json({ success: true })
    } catch (error) {
        logger.error('Error during logout:', error)
        res.status(500).json({ error: 'Failed to logout' })
    }
}

app.post('/api/send-message', upload.single('media'), sendMessageHandler)
app.get('/api/chat-history/:chatId', getChatHistoryHandler)
app.post('/api/logout', logoutHandler)

io.on('connection', (socket) => {
    if (connectedNumber && userName) {
        socket.emit('ready', {
            phoneNumber: connectedNumber,
            userName: userName,
            chats: chatList
        })
    } else if (qrCode) {
        socket.emit('qr', qrCode)
    }

    socket.on('markChatAsRead', ({ chatId }) => {
        const chatIndex = chatList.findIndex(chat => chat.id === chatId)
        if (chatIndex !== -1) {
            chatList[chatIndex].unreadCount = 0
            io.emit('updateChatList', chatList)
        }
    })

    socket.on('markMessageAsRead', async ({ messageId, chatId }) => {
        try {
            const chat = await client.getChatById(chatId)
            if (!chat) {
                throw new Error(`Chat with ID ${chatId} not found`)
            }
            await chat.sendSeen()
            io.emit('messageRead', { messageId, chatId })
        } catch (error: any) {
            logger.error('Error marking message as read:', error)
            socket.emit('error', { message: 'Failed to mark message as read', error: error.message })
        }
    })

    socket.on('typing', async ({ chatId, isTyping }) => {
        try {
            if (isTyping)
                await client.getChatById(chatId).then(chat => chat.sendStateTyping())
            socket.broadcast.emit('userTyping', { chatId, isTyping })
        } catch (error) {
            logger.error('Error handling typing status:', error)
        }
    })
})

client.on('disconnected', (reason) => {
    qrCode = null
    connectedNumber = null
    userName = null
    io.emit('disconnected', reason)
    client.initialize()
    logger.warn('Client disconnected, reinitializing...')
})

io.on('connect_error', (error) => {
    logger.error('Socket connection error:', error)
})

client.initialize()

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`)
})

process.on('SIGINT', async () => {
    try {
        await client.destroy()
        server.close()
        process.exit(0)
    } catch (err) {
        logger.error('Error during shutdown:', err)
        process.exit(1)
    }
})