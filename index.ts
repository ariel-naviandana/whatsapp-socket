import express from 'express'
import { Server } from 'socket.io'
import http from 'http'
import { Client, LocalAuth } from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'
import path from 'path'

const app = express()
const server = http.createServer(app)
const io = new Server(server)

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

client.on('qr', (qr) => {
    qrCode = qr
    qrcode.generate(qr, { small: true })
    io.emit('qr', qr)
})

client.on('ready', async () => {
    console.log('Client is ready!')
    const info = await client.info
    connectedNumber = info.wid.user
    io.emit('ready', { phoneNumber: connectedNumber })
    console.log('Connected with number:', connectedNumber)
})

client.on('message', message => {
    console.log('MESSAGE RECEIVED', message)
    io.emit('message', {
        sender: message.from,
        message: message.body,
        timestamp: new Date().toISOString()
    })
})

client.on('disconnected', (reason) => {
    console.log('Client was disconnected', reason)
    qrCode = null
    connectedNumber = null
    io.emit('disconnected', reason)
    client.initialize().catch(err => {
        console.error('Failed to reinitialize client:', err)
    })
})

client.initialize().catch(err => {
    console.error('Failed to initialize client:', err)
})

io.on('connection', (socket) => {
    console.log('a user connected')
    if (connectedNumber) {
        socket.emit('ready', { phoneNumber: connectedNumber })
    } else if (qrCode) {
        socket.emit('qr', qrCode)
    }

    socket.on('disconnect', () => {
        console.log('user disconnected')
    })
})

app.use(express.static(path.join(__dirname, 'public')))

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})

process.on('SIGINT', async () => {
    console.log('Shutting down...')
    try {
        await client.destroy()
        server.close()
        process.exit(0)
    } catch (err) {
        console.error('Error during shutdown:', err)
        process.exit(1)
    }
})