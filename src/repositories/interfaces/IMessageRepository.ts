import { MessageData } from '../../types'

export interface IMessageRepository {
    saveMessage(message: MessageData): Promise<void>
    getMessages(chatId: string): Promise<MessageData[]>
    updateMessageStatus(messageId: string, status: string): Promise<void>
    clearMessages(): void
}