const socket = io()

const messages = new Map()

socket.on('qr', (qr) => {
    const qrCodeContainer = document.getElementById('qrCodeContainer')
    const connectedNumber = document.getElementById('connectedNumber')
    const userName = document.getElementById('userName')

    qrCodeContainer.style.display = 'block'
    connectedNumber.style.display = 'none'
    userName.style.display = 'none'

    qrCodeContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qr)}&size=200x200" alt="QR Code" />`
})

socket.on('ready', (data) => {
    const qrCodeContainer = document.getElementById('qrCodeContainer')
    const connectedNumber = document.getElementById('connectedNumber')
    const userName = document.getElementById('userName')

    qrCodeContainer.style.display = 'none'
    connectedNumber.style.display = 'block'
    userName.style.display = 'block'

    userName.innerHTML = `${data.userName}`
    connectedNumber.innerHTML = `Connected with WhatsApp number: +${data.phoneNumber}`
})

function createMessageElement(message) {
    const messageElement = document.createElement('div')
    messageElement.className = 'chat-message'
    messageElement.id = `message-${message.id}`
    messageElement.innerHTML = `
        <div class="chat-message-header">
            <span class="chat-message-sender">${message.sender}</span>
            <span class="chat-message-timestamp">${message.timestamp}</span>
        </div>
        <div class="chat-message-body">${message.message}</div>
        <div class="message-footer">
            <span class="read-status">
                ${message.isRead ? '<span class="checkmark">✓✓</span>' : '<span class="checkmark">✓</span>'}
            </span>
        </div>
    `
    return messageElement
}

socket.on('message', (message) => {
    const chatView = document.getElementById('chatView')
    messages.set(message.id, message)

    const messageElement = createMessageElement(message)
    chatView.appendChild(messageElement)

    socket.emit('markMessageAsRead', {
        messageId: message.id,
        chatId: message.chatId
    })
})

socket.on('messageRead', (messageId) => {
    const message = messages.get(messageId)
    if (message) {
        message.isRead = true
        const messageElement = document.getElementById(`message-${messageId}`)
        if (messageElement) {
            const readStatus = messageElement.querySelector('.read-status')
            readStatus.innerHTML = '<span class="checkmark">✓✓</span>'
        }
    }
})

socket.on('disconnected', (reason) => {
    const qrCodeContainer = document.getElementById('qrCodeContainer')
    const connectedNumber = document.getElementById('connectedNumber')
    const userName = document.getElementById('userName')

    qrCodeContainer.style.display = 'block'
    connectedNumber.style.display = 'none'
    userName.style.display = 'none'

    qrCodeContainer.innerHTML = '<p>Disconnected. Attempting to reconnect...</p>'
})