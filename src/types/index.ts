import { Message } from 'whatsapp-web.js'

export interface MessageData {
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

export interface ChatInfo {
    id: string
    name: string
    lastMessage: string
    timestamp: number
    unreadCount: number
    type: string
}

export interface SendMessageOptions {
    chatId: string
    message: string
    media?: Express.Multer.File
    replyTo?: MessageData
}

export interface WhatsAppState {
    qrCode: string | null
    connectedNumber: string | null
    userName: string | null
    chatList: ChatInfo[]
}