import { Server, Socket } from 'socket.io'
import { IWhatsAppService } from '../services/interfaces/IWhatsAppService'
import {
    SocketEvents,
    WhatsAppMessage,
    TypingData,
    MarkMessageReadData
} from './types'
import log4js from 'log4js'

const logger = log4js.getLogger('socketHandler')

export class SocketHandler {
    private io: Server | null = null
    private connectedSockets: Set<Socket> = new Set()

    constructor(private whatsAppService: IWhatsAppService) {}

    initialize(io: Server): void {
        this.io = io
        this.setupWhatsAppEvents()
        this.setupSocketEvents()
        logger.info('Socket handler initialized')
    }

    private setupWhatsAppEvents(): void {
        if (!this.io) throw new Error('Socket.IO not initialized')

        this.whatsAppService.onQRCode((qr) => {
            this.io!.emit('qr', qr)
            logger.info('QR code emitted')
        })

        this.whatsAppService.onReady((state) => {
            this.io!.emit('ready', {
                phoneNumber: state.connectedNumber,
                userName: state.userName,
                chats: state.chatList
            })
            logger.info('WhatsApp client ready')
        })

        this.whatsAppService.onMessage((message: WhatsAppMessage) => {
            this.io!.emit('message', message)
            logger.info(`New message received: ${message.id}`)
        })

        this.whatsAppService.onMessageAck((messageId, status) => {
            this.io!.emit('messageStatus', { messageId, status })
            logger.info(`Message ${messageId} status updated to ${status}`)
        })

        this.whatsAppService.onDisconnected((reason) => {
            this.io!.emit('disconnected', reason)
            logger.warn(`WhatsApp client disconnected: ${reason}`)
        })
    }

    private setupSocketEvents(): void {
        if (!this.io) throw new Error('Socket.IO not initialized')

        this.io.on('connection', (socket: Socket) => {
            this.handleSocketConnection(socket)
        })
    }

    private handleSocketConnection(socket: Socket): void {
        this.connectedSockets.add(socket)
        logger.info(`New socket connected: ${socket.id}`)

        // Initialize client state
        const state = this.whatsAppService.getState()
        if (state.connectedNumber && state.userName) {
            socket.emit('ready', {
                phoneNumber: state.connectedNumber,
                userName: state.userName,
                chats: state.chatList
            })
        } else if (state.qrCode) {
            socket.emit('qr', state.qrCode)
        }

        // Setup socket event handlers
        socket.on('typing', (data: TypingData) => {
            this.handleTyping(socket, data)
        })

        socket.on('markMessageAsRead', (data: MarkMessageReadData) => {
            this.handleMarkMessageAsRead(socket, data)
        })

        socket.on('disconnect', () => {
            this.handleDisconnect(socket)
        })
    }

    private handleTyping(socket: Socket, data: TypingData): void {
        logger.debug(`Typing status from ${socket.id} for chat ${data.chatId}: ${data.isTyping}`)
        socket.broadcast.emit('userTyping', data)
    }

    private async handleMarkMessageAsRead(socket: Socket, data: MarkMessageReadData): Promise<void> {
        try {
            await this.whatsAppService.markMessageAsRead(data.chatId)
            this.io?.emit('messageRead', data)
            logger.info(`Message ${data.messageId} marked as read in chat ${data.chatId}`)
        } catch (error) {
            logger.error('Error marking message as read:', error)
            socket.emit('error', {
                type: 'MARK_READ_ERROR',
                message: 'Failed to mark message as read'
            })
        }
    }

    private handleDisconnect(socket: Socket): void {
        this.connectedSockets.delete(socket)
        logger.info(`Socket disconnected: ${socket.id}`)
    }

    broadcastMessage(event: string, data: any): void {
        if (!this.io) throw new Error('Socket.IO not initialized')
        this.io.emit(event, data)
    }

    getConnectedClientsCount(): number {
        return this.connectedSockets.size
    }
}