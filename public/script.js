const socket = io()
const messages = new Map()
let currentChat = null
const notificationSound = document.getElementById('notificationSound')

function formatTimestamp(timestamp) {
    if (!timestamp) return ''

    const date = new Date(timestamp)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()

    try {
        if (isToday) {
            return new Intl.DateTimeFormat('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }).format(date)
        } else {
            return new Intl.DateTimeFormat('id-ID', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }).format(date)
        }
    } catch (error) {
        console.error('Error formatting timestamp:', error)
        return timestamp.toString()
    }
}

function createMessageElement(message, isOwnMessage) {
    const messageElement = document.createElement('div')
    messageElement.className = `message ${isOwnMessage ? 'sent' : 'received'}`
    messageElement.id = `message-${message.id}`

    const messageContent = document.createElement('div')
    messageContent.className = 'message-content'

    if (!isOwnMessage && message.senderName) {
        const senderName = document.createElement('div')
        senderName.className = 'message-sender'
        senderName.textContent = message.senderName
        messageContent.appendChild(senderName)
    }

    if (message.mediaUrl) {
        const mediaContainer = document.createElement('div')
        mediaContainer.className = 'media-message'

        if (message.type === 'image') {
            const img = document.createElement('img')
            img.src = message.mediaUrl
            img.alt = 'Image'
            img.loading = 'lazy'
            mediaContainer.appendChild(img)
        } else if (message.type === 'video') {
            const video = document.createElement('video')
            video.controls = true
            const source = document.createElement('source')
            source.src = message.mediaUrl
            video.appendChild(source)
            mediaContainer.appendChild(video)
        }

        messageContent.appendChild(mediaContainer)
    }

    const messageText = document.createElement('div')
    messageText.className = 'message-text'
    messageText.textContent = message.message
    messageContent.appendChild(messageText)

    const messageTime = document.createElement('div')
    messageTime.className = 'message-time'
    messageTime.textContent = formatTimestamp(message.timestamp)
    messageContent.appendChild(messageTime)

    messageElement.appendChild(messageContent)
    return messageElement
}

function updateChatList(message) {
    const chatList = document.getElementById('chatList')
    if (!chatList) return

    let chatItem = Array.from(chatList.children).find(
        item => item.dataset.chatId === message.chatId
    )

    if (!chatItem) {
        chatItem = document.createElement('div')
        chatItem.className = 'chat-item'
        chatItem.dataset.chatId = message.chatId
        chatList.insertBefore(chatItem, chatList.firstChild)
    }

    const senderName = message.senderName || message.sender.split('@')[0]

    chatItem.innerHTML = `
        <div class="chat-name">${senderName}</div>
        <div class="chat-preview">${message.message}</div>
        <div class="chat-time">${formatTimestamp(message.timestamp)}</div>
    `

    chatItem.onclick = () => {
        currentChat = { id: message.chatId, name: senderName }
        document.querySelectorAll('.chat-item').forEach(item =>
            item.classList.remove('active')
        )
        chatItem.classList.add('active')

        const headerEl = document.getElementById('chatHeader')
        if (headerEl) {
            headerEl.innerHTML = `<h3>${senderName}</h3>`
        }

        loadChatHistory(message.chatId)
    }
}

socket.on('connect', () => {
    console.log('Connected to socket server')
})

socket.on('disconnect', () => {
    console.log('Disconnected from socket server')
})

socket.on('message', (message) => {
    messages.set(message.id, message)
    updateChatList(message)

    if (currentChat && message.chatId === currentChat.id) {
        const container = document.getElementById('messagesContainer')
        if (container) {
            const messageElement = createMessageElement(message, message.fromMe)
            container.appendChild(messageElement)
            container.scrollTop = container.scrollHeight
        }
    }

    if (!message.fromMe && notificationSound) {
        notificationSound.play().catch(err => console.log('Error playing sound:', err))
    }
})

socket.on('chatHistory', (data) => {
    if (currentChat && data.chatId === currentChat.id) {
        const container = document.getElementById('messagesContainer')
        if (container) {
            container.innerHTML = ''
            data.messages.forEach(msg => {
                const messageElement = createMessageElement(msg, msg.fromMe)
                container.appendChild(messageElement)
            })
            container.scrollTop = container.scrollHeight
        }
    }
})

socket.on('ready', (data) => {
    document.getElementById('qrCodeContainer').style.display = 'none'

    const userNameEl = document.getElementById('userName')
    const connectedNumberEl = document.getElementById('connectedNumber')

    if (userNameEl) userNameEl.textContent = data.userName || ''
    if (connectedNumberEl) connectedNumberEl.textContent = `+${data.phoneNumber}`

    if (data.chats && Array.isArray(data.chats)) {
        data.chats.forEach(chat => {
            updateChatList({
                chatId: chat.id,
                senderName: chat.name,
                message: chat.lastMessage || '',
                timestamp: chat.timestamp,
                sender: chat.id
            })
        })
    }
})

socket.on('qr', (qr) => {
    const qrCodeContainer = document.getElementById('qrCodeContainer')
    const qrCodeElement = document.getElementById('qrCode')

    if (qrCodeContainer && qrCodeElement) {
        qrCodeContainer.style.display = 'block'
        qrCodeElement.innerHTML = `
            <img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qr)}&size=264x264" alt="QR Code">
        `
    }
})

async function sendMessage() {
    if (!currentChat) {
        alert('Please select a chat first')
        return
    }

    const messageInput = document.getElementById('messageInput')
    const fileInput = document.getElementById('fileInput')

    if (!messageInput) return

    const message = messageInput.value.trim()
    const file = fileInput?.files?.[0]

    if (!message && !file) return

    const formData = new FormData()
    formData.append('chatId', currentChat.id)
    formData.append('message', message)
    if (file) {
        formData.append('media', file)
    }

    try {
        const response = await fetch('/api/send-message', {
            method: 'POST',
            body: formData
        })

        const result = await response.json()
        if (result.success) {
            messageInput.value = ''
            if (fileInput) fileInput.value = ''
            messageInput.placeholder = 'Type a message'
        } else {
            throw new Error('Failed to send message')
        }
    } catch (error) {
        console.error('Error sending message:', error)
        alert('Failed to send message')
    }
}

function loadChatHistory(chatId) {
    const container = document.getElementById('messagesContainer')
    if (!container) return

    container.innerHTML = '<div class="loading">Loading messages...</div>'

    fetch(`/api/chat-history/${chatId}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }
            return response.json()
        })
        .then(history => {
            container.innerHTML = ''
            history.forEach(msg => {
                const messageElement = createMessageElement(msg, msg.fromMe)
                container.appendChild(messageElement)
            })
            container.scrollTop = container.scrollHeight
        })
        .catch(error => {
            console.error('Error loading chat history:', error)
            container.innerHTML = `<div class="error">Error loading messages: ${error.message}</div>`
        })
}

document.getElementById('messageInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendMessage()
    }
})

document.getElementById('sendButton')?.addEventListener('click', sendMessage)

document.getElementById('attachButton')?.addEventListener('click', () => {
    document.getElementById('fileInput')?.click()
})

document.getElementById('fileInput')?.addEventListener('change', (e) => {
    const input = e.target
    const messageInput = document.getElementById('messageInput')
    if (input.files?.[0] && messageInput) {
        messageInput.placeholder = `Attached: ${input.files[0].name}`
    }
})

document.getElementById('searchInput')?.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase()
    const chatItems = document.querySelectorAll('.chat-item')

    chatItems.forEach(item => {
        const name = item.querySelector('.chat-name')?.textContent?.toLowerCase() || ''
        const preview = item.querySelector('.chat-preview')?.textContent?.toLowerCase() || ''

        if (name.includes(searchTerm) || preview.includes(searchTerm)) {
            item.style.display = ''
        } else {
            item.style.display = 'none'
        }
    })
})

document.getElementById('messageInput')?.addEventListener('input', function(e) {
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px'
})