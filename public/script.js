const socket = io()

socket.on('qr', (qr) => {
    const qrCodeContainer = document.getElementById('qrCodeContainer')
    qrCodeContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qr)}&size=200x200" alt="QR Code" />`
})

socket.on('message', (message) => {
    const chatView = document.getElementById('chatView')
    const messageElement = document.createElement('div')
    messageElement.className = 'chat-message'
    messageElement.innerHTML = `
        <div class="chat-message-header">
            <span class="chat-message-sender">${message.sender}</span>
            <span class="chat-message-timestamp">${message.timestamp}</span>
        </div>
        <div class="chat-message-body">${message.message}</div>
    `
    chatView.appendChild(messageElement)
})