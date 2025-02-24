import { IChatService } from './interfaces/IChatService'
import { IWhatsAppService } from './interfaces/IWhatsAppService'
import { MessageData, SendMessageOptions, ChatInfo } from '../types'
import log4js from 'log4js'

const logger = log4js.getLogger('chatService')

export class ChatService implements IChatService {
    private chatList: ChatInfo[] = []
    private unreadMessages: Map<string, Set<string>> = new Map()

    constructor(private whatsAppService: IWhatsAppService) {
        this.setupEventHandlers()
    }

    private setupEventHandlers(): void {
        this.whatsAppService.onMessage((message: MessageData) => {
            this.handleNewMessage(message)
        })

        this.whatsAppService.onReady((state) => {
            this.chatList = state.chatList
            logger.info('Chat service initialized with chat list', {
                count: this.chatList.length
            })
        })
    }

    private handleNewMessage(message: MessageData): void {
        try {
            // Update unread messages
            if (!message.fromMe) {
                const unreadSet = this.unreadMessages.get(message.chatId) || new Set()
                unreadSet.add(message.id)
                this.unreadMessages.set(message.chatId, unreadSet)
            }

            // Update chat list
            this.updateChatList({
                id: message.chatId,
                name: message.senderName,
                lastMessage: message.message || '',
                timestamp: new Date(message.timestamp).getTime(),
                unreadCount: this.getUnreadCount(message.chatId),
                type: message.type
            })

            logger.debug('New message handled', {
                chatId: message.chatId,
                messageId: message.id
            })
        } catch (error) {
            logger.error('Error handling new message:', error)
        }
    }

    private getUnreadCount(chatId: string): number {
        return this.unreadMessages.get(chatId)?.size || 0
    }

    async sendMessage(options: SendMessageOptions): Promise<MessageData> {
        try {
            const message = await this.whatsAppService.sendMessage(options)
            this.handleNewMessage(message)
            logger.info('Message sent successfully', {
                chatId: options.chatId
            })
            return message
        } catch (error) {
            logger.error('Error sending message:', error)
            throw error
        }
    }

    async getChatHistory(chatId: string): Promise<MessageData[]> {
        try {
            const messages = await this.whatsAppService.getChatHistory(chatId)
            logger.info('Chat history retrieved', {
                chatId,
                count: messages.length
            })
            return messages
        } catch (error) {
            logger.error('Error getting chat history:', error)
            throw error
        }
    }

    async markMessageAsRead(chatId: string): Promise<void> {
        try {
            await this.whatsAppService.markMessageAsRead(chatId)
            this.unreadMessages.delete(chatId)
            this.updateChatUnreadCount(chatId, 0)
            logger.info('Messages marked as read', { chatId })
        } catch (error) {
            logger.error('Error marking message as read:', error)
            throw error
        }
    }

    updateChatList(chat: ChatInfo): void {
        const index = this.chatList.findIndex(c => c.id === chat.id)
        if (index !== -1) {
            this.chatList[index] = chat
        } else {
            this.chatList.push(chat)
        }
        this.chatList.sort((a, b) => b.timestamp - a.timestamp)
        logger.debug('Chat list updated', { chatId: chat.id })
    }

    private updateChatUnreadCount(chatId: string, count: number): void {
        const chat = this.chatList.find(c => c.id === chatId)
        if (chat) {
            chat.unreadCount = count
            logger.debug('Chat unread count updated', {
                chatId,
                count
            })
        }
    }

    getChatList(): ChatInfo[] {
        return this.chatList
    }

    markChatAsUnread(chatId: string): void {
        const chat = this.chatList.find(c => c.id === chatId)
        if (chat) {
            chat.unreadCount++
            logger.debug('Chat marked as unread', { chatId })
        }
    }

    markChatAsRead(chatId: string): void {
        this.updateChatUnreadCount(chatId, 0)
        this.unreadMessages.delete(chatId)
        logger.debug('Chat marked as read', { chatId })
    }
}