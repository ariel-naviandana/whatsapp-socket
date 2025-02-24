import { Request, Response } from 'express'
import { IWhatsAppService } from '../services/interfaces/IWhatsAppService'
import log4js from 'log4js'

const logger = log4js.getLogger('chatHandler')

export class ChatHandler {
    constructor(private whatsAppService: IWhatsAppService) {}

    async sendMessage(req: Request, res: Response): Promise<void> {
        try {
            const { chatId, message } = req.body
            const media = req.file
            const replyTo = req.body.replyTo ? JSON.parse(req.body.replyTo) : null

            const messageData = await this.whatsAppService.sendMessage({
                chatId,
                message,
                media,
                replyTo
            })

            res.json({ success: true, message: messageData })
            logger.info(`Message sent to ${chatId}`)
        } catch (error) {
            logger.error('Error sending message:', error)
            res.status(500).json({ error: 'Failed to send message' })
        }
    }

    async getChatHistory(req: Request, res: Response): Promise<void> {
        try {
            const { chatId } = req.params

            if (!chatId) {
                logger.error('No chatId provided')
                res.status(400).json({ error: 'ChatId is required' })
                return
            }

            const messages = await this.whatsAppService.getChatHistory(chatId)
            res.json(messages)
            logger.info(`Chat history retrieved for ${chatId}`)
        } catch (error) {
            logger.error('Error getting chat history:', error)
            res.status(500).json({ error: 'Failed to fetch chat history' })
        }
    }

    async logout(req: Request, res: Response): Promise<void> {
        try {
            await this.whatsAppService.logout()
            res.json({ success: true })
            logger.info('User logged out successfully')
        } catch (error) {
            logger.error('Error during logout:', error)
            res.status(500).json({ error: 'Failed to logout' })
        }
    }
}