import express, { RequestHandler } from 'express'
import { Server } from 'socket.io'
import http from 'http'
import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'
import path from 'path'
import moment from 'moment'
import multer from 'multer'

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
    mediaUrl: string | null
    type: string
    fromMe: boolean
    status?: 'sent' | 'delivered' | 'read'
}

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
})

client.on('ready', async () => {
    const info = client.info
    connectedNumber = info.wid.user
    userName = info.pushname

    const chats = await client.getChats()
    chatList = await Promise.all(chats.map(async (chat) => {
        const lastMsg = chat.lastMessage || {}
        return {
            id: chat.id._serialized,
            name: chat.name,
            lastMessage: lastMsg.body || '',
            timestamp: lastMsg.timestamp || Date.now(),
            unreadCount: chat.unreadCount
        }
    }))

    io.emit('ready', {
        phoneNumber: connectedNumber,
        userName: userName,
        chats: chatList
    })
})

client.on('message', async (message: Message) => {
    const timestamp = new Date(message.timestamp * 1000)

    let mediaUrl = null
    if (message.hasMedia) {
        try {
            const media = await message.downloadMedia()
            mediaUrl = `data:${media.mimetype};base64,${media.data}`
        } catch (error) {
            console.error('Error downloading media:', error)
        }
    }

    let senderName = message.from.split('@')[0]
    try {
        const contact = await message.getContact()
        senderName = contact.pushname || contact.name || senderName
    } catch (error) {
        console.error('Error getting contact info:', error)
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

    io.emit('message', messageData)
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
})

const sendMessageHandler: RequestHandler = async (req, res) => {
    try {
        const { chatId, message } = req.body as SendMessageBody
        const media = req.file

        let sentMessage
        let mediaUrl = null

        if (media) {
            const messageMedia = new MessageMedia(
                media.mimetype,
                media.buffer.toString('base64'),
                media.originalname
            )
            sentMessage = await client.sendMessage(chatId, messageMedia, { caption: message })
            mediaUrl = `data:${media.mimetype};base64,${media.buffer.toString('base64')}`
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
            type: media ? 'image' : 'text',
            fromMe: true,
            status: 'sent'
        }

        io.emit('message', messageData)
        res.json({ success: true })
    } catch (error) {
        console.error('Error sending message:', error)
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
                    console.error('Error downloading media:', error)
                }
            }

            let senderName = msg.from.split('@')[0]
            try {
                const contact = await msg.getContact()
                senderName = contact.pushname || contact.name || senderName
            } catch (error) {
                console.error('Error getting contact info:', error)
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
                type: msg.type,
                fromMe: msg.fromMe,
                status: msg.fromMe ? (msg.ack >= 3 ? 'read' : msg.ack >= 2 ? 'delivered' : 'sent') : undefined
            }
        }))

        res.json(formattedMessages)
    } catch (error) {
        console.error('Error fetching chat history:', error)
        res.status(500).json({ error: 'Failed to fetch chat history' })
    }
}

app.post('/api/send-message', upload.single('media'), sendMessageHandler)
app.get('/api/chat-history/:chatId', getChatHistoryHandler)

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

    socket.on('markMessageAsRead', async ({ messageId, chatId }) => {
        try {
            const chat = await client.getChatById(chatId)
            if (!chat) {
                throw new Error(`Chat with ID ${chatId} not found`)
            }
            await chat.sendSeen()
            io.emit('messageRead', { messageId, chatId })
        } catch (error: any) {
            console.error('Error marking message as read:', error)
            socket.emit('error', { message: 'Failed to mark message as read', error: error.message })
        }
    })

    socket.on('typing', async ({ chatId, isTyping }) => {
        try {
            if (isTyping)
                await client.getChatById(chatId).then(chat => chat.sendStateTyping())
             socket.broadcast.emit('userTyping', { chatId, isTyping })
        } catch (error) {
            console.error('Error handling typing status:', error)
        }
    })
})

client.on('disconnected', (reason) => {
    qrCode = null
    connectedNumber = null
    userName = null
    io.emit('disconnected', reason)
    client.initialize()
})

io.on('connect_error', (error) => {
    console.error('Socket connection error:', error)
})

client.initialize()

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})

process.on('SIGINT', async () => {
    try {
        await client.destroy()
        server.close()
        process.exit(0)
    } catch (err) {
        console.error('Error during shutdown:', err)
        process.exit(1)
    }
})