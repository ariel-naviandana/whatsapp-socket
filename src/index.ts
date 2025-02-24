import express from 'express'
import { Server } from 'socket.io'
import http from 'http'
import path from 'path'
import container from './container'
import { createRouter } from './routes/api'
import { ChatHandler } from './handlers/chatHandler'
import { SocketHandler } from './handlers/socketHandler'
import { indexHandler } from './views/index'
import log4js from 'log4js'

// Configure logging
log4js.configure({
    appenders: {
        app: { type: 'file', filename: 'app.log' },
        console: { type: 'console' }
    },
    categories: {
        default: { appenders: ['app', 'console'], level: 'debug' }
    }
})

const logger = log4js.getLogger('app')

// Initialize Express app
const app = express()
const server = http.createServer(app)
const io = new Server(server)

// Serve static files
app.use('/styles', express.static(path.join(__dirname, 'public', 'styles')))
app.use('/js', express.static(path.join(__dirname, 'public', 'js')))
app.use('/sounds', express.static(path.join(__dirname, 'public', 'sounds')))

// Parse JSON bodies
app.use(express.json())

// Get handlers from container
const chatHandler = container.resolve<ChatHandler>('chatHandler')
const socketHandler = container.resolve<SocketHandler>('socketHandler')

// Initialize WebSocket handler
socketHandler.initialize(io)

// API Routes
app.use('/api', createRouter(chatHandler))

// View Routes - use the view renderer instead of sendFile
app.get('/', indexHandler.renderIndex)

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Unhandled error:', err)
    res.status(500).json({ error: 'Internal server error' })
})

// Start server
const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
    logger.info(`Server started on port ${PORT}`)
})

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received. Starting graceful shutdown...')
    try {
        await container.dispose()
        server.close()
        process.exit(0)
    } catch (error) {
        logger.error('Error during shutdown:', error)
        process.exit(1)
    }
})