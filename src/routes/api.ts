import { Router } from 'express'
import multer from 'multer'
import { ChatHandler } from '../handlers/chatHandler'

const upload = multer({
    limits: {
        fileSize: 16 * 1024 * 1024
    }
})

export function createRouter(chatHandler: ChatHandler): Router {
    const router = Router()

    router.post('/send-message', upload.single('media'), chatHandler.sendMessage.bind(chatHandler))
    router.get('/chat-history/:chatId', chatHandler.getChatHistory.bind(chatHandler))
    router.post('/logout', chatHandler.logout.bind(chatHandler))

    return router
}