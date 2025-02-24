import { MessageData, SendMessageOptions, ChatInfo } from '../../types'

export interface IChatService {
    sendMessage(options: SendMessageOptions): Promise<MessageData>
    getChatHistory(chatId: string): Promise<MessageData[]>
    markMessageAsRead(chatId: string): Promise<void>
    updateChatList(chat: ChatInfo): void
    getChatList(): ChatInfo[]
    markChatAsUnread(chatId: string): void
    markChatAsRead(chatId: string): void
}