import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js'
import { IWhatsAppService } from './interfaces/IWhatsAppService'
import { MessageData, SendMessageOptions, ChatInfo, WhatsAppState } from '../types'
import log4js from 'log4js'

const logger = log4js.getLogger('whatsAppService')

export class WhatsAppService implements IWhatsAppService {
    private client: Client
    private state: WhatsAppState = {
        qrCode: null,
        connectedNumber: null,
        userName: null,
        chatList: []
    }
    private messageHandlers: ((message: MessageData) => void)[] = []
    private qrCodeHandlers: ((qr: string) => void)[] = []
    private readyHandlers: ((state: WhatsAppState) => void)[] = []
    private disconnectHandlers: ((reason: string) => void)[] = []
    private messageAckHandlers: ((messageId: string, status: string) => void)[] = []

    constructor() {
        this.client = new Client({
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

        this.setupClientEvents()
    }

    private setupClientEvents(): void {
        this.client.on('qr', (qr: string) => {
            this.state.qrCode = qr
            this.qrCodeHandlers.forEach(handler => handler(qr))
            logger.info('QR Code received')
        })

        this.client.on('ready', async () => {
            try {
                const info = this.client.info
                this.state.connectedNumber = info.wid.user
                this.state.userName = info.pushname

                await this.updateChatList()

                this.readyHandlers.forEach(handler => handler(this.state))
                logger.info('Client is ready', {
                    user: this.state.userName,
                    number: this.state.connectedNumber
                })
            } catch (error) {
                logger.error('Error in ready event:', error)
            }
        })

        this.client.on('message', async (msg: Message) => {
            try {
                const messageData = await this.formatMessage(msg)
                this.messageHandlers.forEach(handler => handler(messageData))
                logger.debug('Message received', { id: msg.id._serialized })
            } catch (error) {
                logger.error('Error processing message:', error)
            }
        })

        this.client.on('message_ack', (msg: Message, ack: number) => {
            const status = this.getMessageStatus(ack)
            this.messageAckHandlers.forEach(handler =>
                handler(msg.id._serialized, status)
            )
            logger.debug('Message status updated', {
                id: msg.id._serialized,
                status
            })
        })

        this.client.on('disconnected', (reason: string) => {
            this.state = {
                qrCode: null,
                connectedNumber: null,
                userName: null,
                chatList: []
            }
            this.disconnectHandlers.forEach(handler => handler(reason))
            logger.warn('Client disconnected', { reason })
        })
    }

    private async updateChatList(): Promise<void> {
        try {
            const chats = await this.client.getChats()
            this.state.chatList = await Promise.all(
                chats.map(async (chat) => {
                    const messages = await chat.fetchMessages({ limit: 1 })
                    const lastMsg = messages[0]
                    return {
                        id: chat.id._serialized,
                        name: chat.name,
                        lastMessage: lastMsg?.body || '',
                        timestamp: lastMsg?.timestamp ? lastMsg.timestamp * 1000 : Date.now(),
                        unreadCount: chat.unreadCount,
                        type: lastMsg?.hasMedia ?
                            (lastMsg.type === 'image' ? 'image' : 'document')
                            : 'text'
                    }
                })
            )
            logger.info('Chat list updated', {
                count: this.state.chatList.length
            })
        } catch (error) {
            logger.error('Error updating chat list:', error)
            throw error
        }
    }

    private getMessageStatus(ack: number): string {
        switch (ack) {
            case 1: return 'sent'
            case 2: return 'delivered'
            case 3: return 'read'
            default: return 'sent'
        }
    }

    private async formatMessage(msg: Message): Promise<MessageData> {
        try {
            const timestamp = new Date(msg.timestamp * 1000)

            let mediaUrl = null
            let fileName = null
            if (msg.hasMedia) {
                const media = await msg.downloadMedia()
                if (media) {
                    mediaUrl = `data:${media.mimetype};base64,${media.data}`
                    fileName = media.filename || 'Download Document'
                }
            }

            let senderName = msg.from.split('@')[0]
            try {
                const contact = await msg.getContact()
                senderName = contact.pushname || contact.name || senderName
            } catch (error) {
                logger.warn('Error getting contact info:', error)
            }

            let replyTo = null
            if (msg.hasQuotedMsg) {
                const quotedMsg = await msg.getQuotedMessage()
                replyTo = await this.formatMessage(quotedMsg)
            }

            return {
                id: msg.id._serialized,
                sender: msg.from,
                senderName,
                message: msg.body,
                timestamp: timestamp.toISOString(),
                isRead: false,
                chatId: msg.from,
                mediaUrl,
                fileName,
                type: msg.type,
                fromMe: msg.fromMe,
                status: msg.fromMe ? 'sent' : undefined,
                replyTo
            }
        } catch (error) {
            logger.error('Error formatting message:', error)
            throw error
        }
    }

    async initialize(): Promise<void> {
        try {
            await this.client.initialize()
            logger.info('WhatsApp client initialized')
        } catch (error) {
            logger.error('Error initializing client:', error)
            throw error
        }
    }

    async sendMessage(options: SendMessageOptions): Promise<MessageData> {
        try {
            const { chatId, message, media, replyTo } = options

            const messageOptions: any = {}
            if (replyTo) {
                messageOptions.quotedMessageId = replyTo.id
            }

            let sentMessage
            if (media) {
                const messageMedia = new MessageMedia(
                    media.mimetype,
                    media.buffer.toString('base64'),
                    media.originalname
                )
                messageOptions.caption = message
                sentMessage = await this.client.sendMessage(
                    chatId,
                    messageMedia,
                    messageOptions
                )
            } else {
                sentMessage = await this.client.sendMessage(
                    chatId,
                    message,
                    messageOptions
                )
            }

            return this.formatMessage(sentMessage)
        } catch (error) {
            logger.error('Error sending message:', error)
            throw error
        }
    }

    async getChatHistory(chatId: string): Promise<MessageData[]> {
        try {
            const chat = await this.client.getChatById(chatId)
            const messages = await chat.fetchMessages({ limit: 50 })
            return Promise.all(messages.map(msg => this.formatMessage(msg)))
        } catch (error) {
            logger.error('Error getting chat history:', error)
            throw error
        }
    }

    async markMessageAsRead(chatId: string): Promise<void> {
        try {
            const chat = await this.client.getChatById(chatId)
            await chat.sendSeen()
            logger.info('Messages marked as read', { chatId })
        } catch (error) {
            logger.error('Error marking message as read:', error)
            throw error
        }
    }

    async logout(): Promise<void> {
        try {
            await this.client.logout()
            this.state = {
                qrCode: null,
                connectedNumber: null,
                userName: null,
                chatList: []
            }
            await this.client.initialize()
            logger.info('Client logged out successfully')
        } catch (error) {
            logger.error('Error during logout:', error)
            throw error
        }
    }

    getClient(): Client {
        return this.client
    }

    getState(): WhatsAppState {
        return this.state
    }

    onMessage(handler: (message: MessageData) => void): void {
        this.messageHandlers.push(handler)
    }

    onQRCode(handler: (qr: string) => void): void {
        this.qrCodeHandlers.push(handler)
    }

    onReady(handler: (state: WhatsAppState) => void): void {
        this.readyHandlers.push(handler)
    }

    onDisconnected(handler: (reason: string) => void): void {
        this.disconnectHandlers.push(handler)
    }

    onMessageAck(handler: (messageId: string, status: string) => void): void {
        this.messageAckHandlers.push(handler)
    }
}