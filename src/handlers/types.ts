import { Request } from 'express'
import { Message } from 'whatsapp-web.js'

export interface SendMessageRequest extends Request {
    body: {
        chatId: string
        message: string
        replyTo?: {
            id: string
            message: string | null
            type: string
            mediaUrl?: string | null
            fileName?: string | null
        }
    }
    file?: Express.Multer.File
}

export interface MessageAckData {
    messageId: string
    status: 'sent' | 'delivered' | 'read'
}

export interface TypingData {
    chatId: string
    isTyping: boolean
}

export interface MarkMessageReadData {
    messageId: string
    chatId: string
}

export interface MarkChatReadData {
    chatId: string
}

export interface ChatUpdateData {
    chatId: string
    lastMessage: string
    timestamp: string
    senderName: string
    unreadCount: number
}

export interface WhatsAppEventHandlers {
    onQRCode: (qr: string) => void
    onReady: (data: {
        phoneNumber: string
        userName: string
        chats: ChatListItem[]
    }) => void
    onMessage: (message: WhatsAppMessage) => void
    onMessageStatus: (data: MessageAckData) => void
    onDisconnected: (reason: string) => void
}

export interface ChatListItem {
    id: string
    name: string
    lastMessage: string
    timestamp: number
    unreadCount: number
    type: 'text' | 'image' | 'document'
}

export interface WhatsAppMessage {
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
    replyTo?: WhatsAppMessage | null
}

export interface SocketEvents {
    connect: () => void
    disconnect: () => void
    message: (data: WhatsAppMessage) => void
    messageStatus: (data: MessageAckData) => void
    typing: (data: TypingData) => void
    markMessageAsRead: (data: MarkMessageReadData) => void
    markChatAsRead: (data: MarkChatReadData) => void
    updateChatList: (data: ChatUpdateData) => void
}

export interface HandlerDependencies {
    logger: {
        info: (message: string, ...args: any[]) => void
        error: (message: string, ...args: any[]) => void
        warn: (message: string, ...args: any[]) => void
    }
}

export interface ErrorResponse {
    error: string
    details?: string
}

export interface SuccessResponse {
    success: true
    data?: any
}

export type APIResponse = ErrorResponse | SuccessResponse