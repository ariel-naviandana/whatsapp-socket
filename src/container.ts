import { createContainer, asClass, InjectionMode } from 'awilix'
import { WhatsAppService } from './services/whatsAppService'
import { ChatService } from './services/chatService'
import { ChatHandler } from './handlers/chatHandler'
import { SocketHandler } from './handlers/socketHandler'

const container = createContainer({
    injectionMode: InjectionMode.CLASSIC
})

container.register({
    whatsAppService: asClass(WhatsAppService).singleton(),
    chatService: asClass(ChatService).singleton(),
    chatHandler: asClass(ChatHandler).singleton(),
    socketHandler: asClass(SocketHandler).singleton()
})

export default container