import { Client, Message } from 'whatsapp-web.js'
import { MessageData, SendMessageOptions, ChatInfo, WhatsAppState } from '../../types'

export interface IWhatsAppService {
    initialize(): Promise<void>
    getClient(): Client
    getState(): WhatsAppState
    sendMessage(options: SendMessageOptions): Promise<MessageData>
    getChatHistory(chatId: string): Promise<MessageData[]>
    markMessageAsRead(chatId: string): Promise<void>
    logout(): Promise<void>
    onMessage(callback: (message: MessageData) => void): void
    onQRCode(callback: (qr: string) => void): void
    onReady(callback: (state: WhatsAppState) => void): void
    onDisconnected(callback: (reason: string) => void): void
    onMessageAck(callback: (messageId: string, status: string) => void): void
}