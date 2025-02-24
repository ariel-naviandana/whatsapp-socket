import { IMessageRepository } from './interfaces/IMessageRepository'
import { MessageData } from '../types'

export class MessageRepository implements IMessageRepository {
    private messages: Map<string, MessageData[]> = new Map()

    async saveMessage(message: MessageData): Promise<void> {
        const chatMessages = this.messages.get(message.chatId) || []
        chatMessages.push(message)
        this.messages.set(message.chatId, chatMessages)
    }

    async getMessages(chatId: string): Promise<MessageData[]> {
        return this.messages.get(chatId) || []
    }

    async updateMessageStatus(messageId: string, status: string): Promise<void> {
        this.messages.forEach(chatMessages => {
            const message = chatMessages.find(m => m.id === messageId)
            if (message) {
                message.status = status as 'sent' | 'delivered' | 'read'
            }
        })
    }

    clearMessages(): void {
        this.messages.clear()
    }
}