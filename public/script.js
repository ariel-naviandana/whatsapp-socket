const socket = io()
const messages = new Map()
let currentChat = null
const notificationSound = document.getElementById('notificationSound')

const MESSAGE_STATUS = {
    SENT: '<i class="fas fa-check"></i>',
    DELIVERED: '<i class="fas fa-check-double"></i>',
    READ: '<i class="fas fa-check-double text-blue"></i>'
}

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

    const messageFooter = document.createElement('div')
    messageFooter.className = 'message-footer'

    const messageTime = document.createElement('span')
    messageTime.className = 'message-time'
    messageTime.textContent = formatTimestamp(message.timestamp)
    messageFooter.appendChild(messageTime)

    if (isOwnMessage) {
        const messageStatus = document.createElement('span')
        messageStatus.className = 'message-status'
        messageStatus.innerHTML = message.status === 'read'
            ? MESSAGE_STATUS.READ
            : message.status === 'delivered'
                ? MESSAGE_STATUS.DELIVERED
                : MESSAGE_STATUS.SENT
        messageFooter.appendChild(messageStatus)
    }

    messageContent.appendChild(messageFooter)
    messageElement.appendChild(messageContent)
    return messageElement
}

function updateMessageStatus(messageId, status) {
    const messageEl = document.getElementById(`message-${messageId}`)
    if (messageEl) {
        const statusEl = messageEl.querySelector('.message-status')
        if (statusEl) {
            statusEl.innerHTML = MESSAGE_STATUS[status.toUpperCase()]
        }
    }
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
    const isUnread = getUnreadStatus(message.chatId) && (!currentChat || currentChat.id !== message.chatId)

    chatItem.innerHTML = `
        <div class="chat-header-info">
            <div class="chat-name">${senderName}</div>
            <div class="chat-time">${formatTimestamp(message.timestamp)}</div>
        </div>
        <div class="chat-preview">
            ${isUnread ? '<span class="unread-indicator">●</span>' : ''}
            ${message.message}
        </div>
    `

    chatItem.onclick = () => {
        currentChat = { id: message.chatId, name: senderName }
        document.querySelectorAll('.chat-item').forEach(item =>
            item.classList.remove('active')
        )
        chatItem.classList.add('active')

        setUnreadStatus(message.chatId, false)
        const unreadIndicator = chatItem.querySelector('.unread-indicator')
        if (unreadIndicator) {
            unreadIndicator.remove()
        }

        const headerEl = document.getElementById('chatHeader')
        if (headerEl) {
            headerEl.innerHTML = `
                <h3>${senderName}</h3>
                <div class="typing-status" id="typingStatus-${message.chatId}"></div>
            `
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
    if (!message.fromMe) {
        setUnreadStatus(message.chatId, true)
    }
    updateChatList(message)

    if (currentChat && message.chatId === currentChat.id) {
        socket.emit('markMessageAsRead', {
            messageId: message.id,
            chatId: message.chatId
        })
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

socket.on('messageStatus', ({ messageId, status }) => {
    updateMessageStatus(messageId, status)
})

socket.on('userTyping', ({ chatId, isTyping }) => {
    const typingStatus = document.getElementById(`typingStatus-${chatId}`)
    if (typingStatus) {
        typingStatus.textContent = isTyping ? 'typing...' : ''
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
                sender: chat.id,
                unreadCount: chat.unreadCount
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

let typingTimeout = null

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
            messageInput.style.height = 'auto'
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

            setUnreadStatus(chatId, false)
            const chatItem = document.querySelector(`.chat-item[data-chat-id="${chatId}"]`)
            if (chatItem) {
                const unreadIndicator = chatItem.querySelector('.unread-indicator')
                if (unreadIndicator) {
                    unreadIndicator.remove()
                }
            }
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

document.getElementById('messageInput')?.addEventListener('input', (e) => {
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px'

    if (currentChat) {
        socket.emit('typing', { chatId: currentChat.id, isTyping: true })

        if (typingTimeout) {
            clearTimeout(typingTimeout)
        }

        typingTimeout = setTimeout(() => {
            socket.emit('typing', { chatId: currentChat.id, isTyping: false })
        }, 3000)
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

function getUnreadStatus(chatId) {
    const unreadStatus = JSON.parse(localStorage.getItem('unreadStatus') || '{}')
    return unreadStatus[chatId] || false
}

function setUnreadStatus(chatId, status) {
    const unreadStatus = JSON.parse(localStorage.getItem('unreadStatus') || '{}')
    unreadStatus[chatId] = status
    localStorage.setItem('unreadStatus', JSON.stringify(unreadStatus))
}

const debugPanel = document.createElement('div')
debugPanel.id = 'debugPanel'
debugPanel.style.cssText = `
    position: fixed;
    bottom: 0;
    right: 0;
    background: rgba(0,0,0,0.8);
    color: white;
    padding: 10px;
    font-size: 12px;
    z-index: 9999;
    display: none;
`

document.body.appendChild(debugPanel)

function updateDebugInfo() {
    if (debugPanel) {
        debugPanel.innerHTML = `
            <div>Socket Connected: ${socket.connected}</div>
            <div>Current Chat: ${currentChat ? `${currentChat.name} (${currentChat.id})` : 'None'}</div>
            <div>Messages in Memory: ${messages.size}</div>
            <div>Last Update: ${new Date().toISOString()}</div>
        `
    }
}

setInterval(updateDebugInfo, 1000)

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'd') {
        e.preventDefault()
        debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none'
    }
})