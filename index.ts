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
    authStrategy: new LocalAuth()
})

let qrCode: string | null = null

client.on('qr', (qr) => {
    qrCode = qr
    qrcode.generate(qr, { small: true })
    io.emit('qr', qr)
})

client.on('ready', () => {
    console.log('Client is ready!')
    io.emit('ready')
})

client.on('message', message => {
    console.log('MESSAGE RECEIVED', message)
    io.emit('message', {
        sender: message.from,
        message: message.body,
        timestamp: new Date().toISOString()
    })
})

client.initialize()

io.on('connection', (socket) => {
    console.log('a user connected')
    if (qrCode) {
        socket.emit('qr', qrCode)
    }
})

app.use(express.static(path.join(__dirname, 'public')))

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})