const socket = io();
const messages = new Map();
let currentChat = null;
const notificationSound = document.getElementById('notificationSound');
const typingTimeouts = new Map();
const contactStatusCache = new Map();
let connectedNumber = null;

const MESSAGE_STATUS = {
    SENT: '<i class="fas fa-check"></i>',
    DELIVERED: '<i class="fas fa-check-double"></i>',
    READ: '<i class="fas fa-check-double text-blue"></i>'
};

function formatTimestamp(timestamp) {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    try {
        if (isToday) {
            return new Intl.DateTimeFormat('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }).format(date);
        } else {
            return new Intl.DateTimeFormat('id-ID', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }).format(date);
        }
    } catch (error) {
        console.error('Error formatting timestamp:', error);
        return timestamp.toString();
    }
}

function formatTimeForChat(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        // Hari ini
        return new Intl.DateTimeFormat('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).format(date);
    } else if (diffDays === 1) {
        // Kemarin
        return 'Kemarin';
    } else if (diffDays < 7) {
        // Kurang dari seminggu
        const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        return days[date.getDay()];
    } else {
        // Lebih dari seminggu
        return new Intl.DateTimeFormat('id-ID', {
            month: 'short',
            day: 'numeric'
        }).format(date);
    }
}

let replyMessage = null;

function createMessageElement(message, isOwnMessage) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${isOwnMessage ? 'sent' : 'received'} ${message.replyTo ? 'with-reply' : ''}`;
    messageElement.id = `message-${message.id}`;

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';

    if (message.replyTo) {
        const replyQuote = document.createElement('div');
        replyQuote.className = 'reply-quote';

        const replySender = document.createElement('div');
        replySender.className = 'reply-sender';
        replySender.textContent = message.replyTo.fromMe ? 'You' : message.replyTo.senderName;
        replyQuote.appendChild(replySender);

        if (message.replyTo.type === 'image' && message.replyTo.mediaUrl) {
            const replyMedia = document.createElement('div');
            replyMedia.className = 'reply-media';

            const replyImage = document.createElement('img');
            replyImage.src = message.replyTo.mediaUrl;
            replyImage.alt = 'Reply Image';
            replyMedia.appendChild(replyImage);

            const replyText = document.createElement('div');
            replyText.className = 'reply-text';
            replyText.textContent = message.replyTo.message || 'Photo';
            replyMedia.appendChild(replyText);

            replyQuote.appendChild(replyMedia);
        } else if (message.replyTo.type === 'document' && message.replyTo.fileName) {
            const replyMedia = document.createElement('div');
            replyMedia.className = 'reply-media';

            const docIcon = document.createElement('span');
            docIcon.className = 'document-icon';
            docIcon.innerHTML = '<i class="fas fa-file"></i>';
            replyMedia.appendChild(docIcon);

            const replyText = document.createElement('div');
            replyText.className = 'reply-text';
            replyText.textContent = message.replyTo.fileName;
            replyMedia.appendChild(replyText);

            replyQuote.appendChild(replyMedia);
        } else {
            const replyText = document.createElement('div');
            replyText.className = 'reply-text';
            replyText.textContent = message.replyTo.message;
            replyQuote.appendChild(replyText);
        }

        messageContent.appendChild(replyQuote);
    }

    if (!isOwnMessage && message.senderName) {
        const senderName = document.createElement('div');
        senderName.className = 'message-sender';
        senderName.textContent = message.senderName;
        messageContent.appendChild(senderName);
    }

    if (message.mediaUrl) {
        const mediaContainer = document.createElement('div');
        mediaContainer.className = 'media-message';

        if (message.type === 'image') {
            const img = document.createElement('img');
            img.src = message.mediaUrl;
            img.alt = 'Image';
            img.loading = 'lazy';
            mediaContainer.appendChild(img);
        } else if (message.type === 'document') {
            const documentLink = document.createElement('a');
            documentLink.href = message.mediaUrl;
            documentLink.textContent = message.fileName || 'Download Document';
            documentLink.download = message.fileName || 'document';
            mediaContainer.appendChild(documentLink);
        }

        messageContent.appendChild(mediaContainer);
    }

    if (message.message) {
        const messageText = document.createElement('div');
        messageText.className = 'message-text';
        messageText.textContent = message.message;
        messageContent.appendChild(messageText);
    }

    const messageFooter = document.createElement('div');
    messageFooter.className = 'message-footer';

    const messageTime = document.createElement('span');
    messageTime.className = 'message-time';
    messageTime.textContent = formatTimestamp(message.timestamp);
    messageFooter.appendChild(messageTime);

    if (isOwnMessage) {
        const messageStatus = document.createElement('span');
        messageStatus.className = 'message-status';
        messageStatus.innerHTML = message.status === 'read'
            ? MESSAGE_STATUS.READ
            : message.status === 'delivered'
                ? MESSAGE_STATUS.DELIVERED
                : MESSAGE_STATUS.SENT;
        messageFooter.appendChild(messageStatus);
    }

    messageContent.appendChild(messageFooter);
    messageElement.appendChild(messageContent);

    messageElement.addEventListener('click', () => {
        replyMessage = message;
        const replyContainer = document.getElementById('replyContainer');
        const replyMessageElement = document.getElementById('replyMessage');
        const replyImage = document.getElementById('replyImage');
        const replyDocument = document.getElementById('replyDocument');

        if (replyContainer && replyMessageElement) {
            replyContainer.style.display = 'flex';
            replyMessageElement.textContent = message.message || 'Media';
            if (replyImage) {
                if (message.mediaUrl && message.type === 'image') {
                    replyImage.style.display = 'block';
                    replyImage.src = message.mediaUrl;
                } else {
                    replyImage.style.display = 'none';
                }
            }
            if (replyDocument) {
                if (message.mediaUrl && message.type === 'document') {
                    replyDocument.style.display = 'block';
                    replyDocument.href = message.mediaUrl;
                    replyDocument.textContent = message.fileName || 'Download Document';
                    replyDocument.download = message.fileName || 'document';
                } else {
                    replyDocument.style.display = 'none';
                }
            }
        }
    });

    return messageElement;
}

function updateMessageStatus(messageId, status) {
    const messageEl = document.getElementById(`message-${messageId}`);
    if (messageEl) {
        const statusEl = messageEl.querySelector('.message-status');
        if (statusEl) {
            statusEl.innerHTML = MESSAGE_STATUS[status.toUpperCase()];
        }
    }
}

// Update chat list dengan urutan yang benar
function updateChatListUI() {
    const chatListElement = document.getElementById('chatList');
    if (!chatListElement) return;

    // Dapatkan semua chat items
    const chatItems = Array.from(chatListElement.querySelectorAll('.chat-item'));
    
    // Sort berdasarkan timestamp (terbaru pertama)
    chatItems.sort((a, b) => {
        const timeA = parseInt(a.dataset.timestamp) || 0;
        const timeB = parseInt(b.dataset.timestamp) || 0;
        return timeB - timeA; // DESC: terbaru pertama
    });

    // Clear dan append dengan urutan yang benar
    chatListElement.innerHTML = '';
    chatItems.forEach(item => {
        chatListElement.appendChild(item);
    });
}

function createChatItemElement(chat) {
    const chatItem = document.createElement('div');
    chatItem.className = 'chat-item';
    chatItem.dataset.chatId = chat.id;
    chatItem.dataset.timestamp = chat.timestamp;
    
    const lastMessage = chat.lastMessage || '';
    const previewContent = lastMessage.length > 30 ? lastMessage.substring(0, 30) + '...' : lastMessage;
    
    // Dapatkan status dari cache
    const status = contactStatusCache.get(chat.id);
    const timeText = status && status.isOnline ? 
        '<span style="color: #25d366; display: flex; align-items: center;"><span class="status-dot online" style="margin-right: 4px;"></span>Online</span>' :
        formatTimeForChat(chat.timestamp);
    
    chatItem.innerHTML = `
        <div class="chat-header-info">
            <div class="chat-name">${chat.name}</div>
            <div class="chat-time">${timeText}</div>
        </div>
        <div class="chat-preview">
            ${chat.unreadCount > 0 ? '<span class="unread-indicator">●</span>' : ''}
            ${previewContent}
        </div>
    `;

    chatItem.onclick = () => {
        currentChat = { id: chat.id, name: chat.name };
        
        // Update active state
        document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.remove('active');
        });
        chatItem.classList.add('active');

        // Mark as read
        socket.emit('markChatAsRead', { chatId: chat.id });
        
        // Update header
        const headerEl = document.getElementById('chatHeader');
        if (headerEl) {
            headerEl.innerHTML = `
                <h3>${chat.name}</h3>
                <div class="chat-header-status" id="chatHeaderStatus"></div>
            `;
            
            // Tampilkan status jika ada
            if (status) {
                updateChatHeaderStatus(chat.id, status);
            }
        }

        loadChatHistory(chat.id);
    };

    return chatItem;
}

// Socket event handlers
socket.on('connect', () => {
    console.log('Connected to socket server');
});

socket.on('disconnected', (reason) => {
    const qrCodeContainer = document.getElementById('qrCodeContainer');
    const messagesContainer = document.getElementById('messagesContainer');
    const chatList = document.getElementById('chatList');
    const chatHeader = document.getElementById('chatHeader');

    if (qrCodeContainer) {
        qrCodeContainer.style.display = 'block';
    }
    if (messagesContainer) {
        messagesContainer.innerHTML = '';
    }
    if (chatList) {
        chatList.innerHTML = '';
    }
    if (chatHeader) {
        chatHeader.innerHTML = '<h3>Select a chat to start messaging</h3>';
    }
    console.log('Disconnected: ', reason);
});

socket.on('message', (message) => {
    messages.set(message.id, message);

    if (!message.fromMe) {
        setUnreadStatus(message.chatId, true);
    }

    // Update chat list UI
    const chatListElement = document.getElementById('chatList');
    if (chatListElement) {
        // Cek apakah chat sudah ada
        let chatItem = chatListElement.querySelector(`.chat-item[data-chat-id="${message.chatId}"]`);
        
        if (!chatItem) {
            // Buat chat item baru
            const chat = {
                id: message.chatId,
                name: message.senderName || message.sender.split('@')[0],
                lastMessage: message.message || (message.fileName ? `📎 ${message.fileName}` : '📷 Image'),
                timestamp: new Date(message.timestamp).getTime(),
                unreadCount: message.fromMe ? 0 : 1
            };
            
            chatItem = createChatItemElement(chat);
            chatListElement.prepend(chatItem); // Taruh di atas
        } else {
            // Update chat yang sudah ada
            chatItem.dataset.timestamp = new Date(message.timestamp).getTime();
            
            const chatName = chatItem.querySelector('.chat-name');
            const chatPreview = chatItem.querySelector('.chat-preview');
            
            if (chatPreview) {
                const lastMessage = message.message || (message.fileName ? `📎 ${message.fileName}` : '📷 Image');
                const previewContent = lastMessage.length > 30 ? lastMessage.substring(0, 30) + '...' : lastMessage;
                
                // Update unread indicator
                const unreadIndicator = chatPreview.querySelector('.unread-indicator');
                if (!message.fromMe && (!currentChat || currentChat.id !== message.chatId)) {
                    if (!unreadIndicator) {
                        chatPreview.innerHTML = `<span class="unread-indicator">●</span>${previewContent}`;
                    }
                } else if (unreadIndicator) {
                    unreadIndicator.remove();
                }
                
                // Update timestamp
                const chatTime = chatItem.querySelector('.chat-time');
                if (chatTime) {
                    const status = contactStatusCache.get(message.chatId);
                    if (status && status.isOnline) {
                        chatTime.innerHTML = '<span style="color: #25d366; display: flex; align-items: center;"><span class="status-dot online" style="margin-right: 4px;"></span>Online</span>';
                    } else {
                        chatTime.textContent = formatTimeForChat(new Date(message.timestamp).getTime());
                    }
                }
            }
            
            // Pindahkan ke atas (karena baru diupdate)
            chatListElement.prepend(chatItem);
        }
        
        // Urutkan ulang
        updateChatListUI();
    }

    // Tampilkan message jika chat sedang aktif
    if (currentChat && currentChat.id === message.chatId) {
        socket.emit('markMessageAsRead', {
            messageId: message.id,
            chatId: message.chatId
        });

        const container = document.getElementById('messagesContainer');
        if (container) {
            const messageElement = createMessageElement(message, message.fromMe);
            container.appendChild(messageElement);
            container.scrollTop = container.scrollHeight;
        }
    }

    // Play notification sound untuk message dari orang lain
    if (!message.fromMe && notificationSound) {
        notificationSound.play().catch(err => console.log('Error playing sound:', err));
    }
});

socket.on('messageStatus', ({ messageId, status }) => {
    updateMessageStatus(messageId, status);
});

socket.on('ready', (data) => {
    document.getElementById('qrCodeContainer').style.display = 'none';

    const userNameEl = document.getElementById('userName');
    const connectedNumberEl = document.getElementById('connectedNumber');

    if (userNameEl) userNameEl.textContent = data.userName || '';
    if (connectedNumberEl) connectedNumberEl.textContent = `+${data.phoneNumber}`;
    
    connectedNumber = data.phoneNumber;

    if (data.chats && Array.isArray(data.chats)) {
        const chatListElement = document.getElementById('chatList');
        if (chatListElement) {
            chatListElement.innerHTML = '';
            
            // Urutkan chats dari server (harusnya sudah terurut)
            const sortedChats = [...data.chats].sort((a, b) => b.timestamp - a.timestamp);
            
            sortedChats.forEach(chat => {
                const chatItem = createChatItemElement(chat);
                chatListElement.appendChild(chatItem);
            });
        }
    }
});

socket.on('qr', (qr) => {
    const qrCodeContainer = document.getElementById('qrCodeContainer');
    const qrCodeElement = document.getElementById('qrCode');

    if (qrCodeContainer && qrCodeElement) {
        qrCodeContainer.style.display = 'block';
        qrCodeElement.innerHTML = `
            <img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qr)}&size=264x264" alt="QR Code">
        `;
    }
});

socket.on('updateChatList', (updatedChatList) => {
    const chatListElement = document.getElementById('chatList');
    if (!chatListElement) return;

    chatListElement.innerHTML = '';

    // Urutkan dari server (harusnya sudah terurut)
    const sortedChats = [...updatedChatList].sort((a, b) => b.timestamp - a.timestamp);
    
    sortedChats.forEach(chat => {
        const chatItem = createChatItemElement(chat);
        chatListElement.appendChild(chatItem);
    });
});

// Typing Status Handler
socket.on('typingStatus', (typingData) => {
    const { chatId, isTyping, userName, userId } = typingData;
    
    // Skip jika ini dari diri sendiri
    if (userId === connectedNumber || userId === 'unknown') return;
    
    if (currentChat && currentChat.id === chatId) {
        const chatHeader = document.getElementById('chatHeader');
        if (chatHeader) {
            let typingElement = document.getElementById(`typingStatus-${chatId}`);
            
            if (isTyping) {
                if (!typingElement) {
                    typingElement = document.createElement('div');
                    typingElement.id = `typingStatus-${chatId}`;
                    typingElement.className = 'typing-status';
                    typingElement.style.cssText = `
                        font-size: 12px;
                        color: #667781;
                        margin-top: 2px;
                        font-style: italic;
                        display: flex;
                        align-items: center;
                    `;
                    
                    // Hapus status sebelumnya
                    const statusElement = chatHeader.querySelector('.chat-header-status');
                    if (statusElement) {
                        statusElement.style.display = 'none';
                    }
                    
                    chatHeader.appendChild(typingElement);
                }
                
                typingElement.innerHTML = `
                    <span>${userName} is typing</span>
                    <div class="typing-animation" style="margin-left: 4px;">
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                    </div>
                `;
                
                // Clear timeout sebelumnya
                if (typingTimeouts.has(chatId)) {
                    clearTimeout(typingTimeouts.get(chatId));
                }
                
                // Auto clear setelah 3 detik
                const timeout = setTimeout(() => {
                    const currentTypingElement = document.getElementById(`typingStatus-${chatId}`);
                    if (currentTypingElement) {
                        currentTypingElement.remove();
                        // Tampilkan kembali status
                        const statusElement = chatHeader.querySelector('.chat-header-status');
                        if (statusElement) {
                            statusElement.style.display = 'block';
                        }
                    }
                    typingTimeouts.delete(chatId);
                }, 3000);
                
                typingTimeouts.set(chatId, timeout);
                
            } else {
                // Hapus typing indicator
                if (typingElement) {
                    typingElement.remove();
                    
                    // Tampilkan kembali status
                    const statusElement = chatHeader.querySelector('.chat-header-status');
                    if (statusElement) {
                        statusElement.style.display = 'block';
                    }
                }
                
                if (typingTimeouts.has(chatId)) {
                    clearTimeout(typingTimeouts.get(chatId));
                    typingTimeouts.delete(chatId);
                }
            }
        }
    }
});

// Presence/Online Status Handler
function handlePresenceUpdate(statusData) {
    const { userId, isOnline, lastSeenFormatted } = statusData;
    
    // Simpan ke cache
    contactStatusCache.set(userId, statusData);
    
    // Update di chat list
    const chatItem = document.querySelector(`.chat-item[data-chat-id="${userId}"]`);
    if (chatItem) {
        const chatTime = chatItem.querySelector('.chat-time');
        if (chatTime) {
            if (isOnline) {
                chatTime.innerHTML = `
                    <span style="color: #25d366; display: flex; align-items: center;">
                        <span class="status-dot online" style="margin-right: 4px;"></span>
                        Online
                    </span>
                `;
            } else {
                chatTime.innerHTML = `
                    <span style="color: #667781; display: flex; align-items: center;">
                        <span class="status-dot offline" style="margin-right: 4px;"></span>
                        ${lastSeenFormatted || 'Offline'}
                    </span>
                `;
            }
        }
    }
    
    // Update di chat header jika sedang chat dengan kontak tersebut
    if (currentChat && currentChat.id === userId) {
        updateChatHeaderStatus(userId, statusData);
    }
}

function updateChatHeaderStatus(chatId, status) {
    const chatHeader = document.getElementById('chatHeader');
    if (chatHeader) {
        let statusElement = chatHeader.querySelector('.chat-header-status');
        if (!statusElement) {
            statusElement = document.createElement('div');
            statusElement.className = 'chat-header-status';
            statusElement.style.cssText = `
                font-size: 12px;
                color: #667781;
                margin-top: 2px;
            `;
            chatHeader.appendChild(statusElement);
        }
        
        if (status.isOnline) {
            statusElement.innerHTML = `
                <span style="color: #25d366; display: flex; align-items: center;">
                    <span class="status-dot online" style="margin-right: 4px;"></span>
                    Online
                </span>
            `;
        } else {
            statusElement.innerHTML = `
                <span style="color: #667781; display: flex; align-items: center;">
                    <span class="status-dot offline" style="margin-right: 4px;"></span>
                    ${status.lastSeenFormatted || 'Offline'}
                </span>
            `;
        }
    }
}

socket.on('presenceUpdate', handlePresenceUpdate);
socket.on('contactStatus', handlePresenceUpdate);
socket.on('initialStatuses', (statuses) => {
    statuses.forEach(handlePresenceUpdate);
});

// Fungsi utama
async function sendMessage() {
    if (!currentChat) {
        alert('Please select a chat first');
        return;
    }

    const messageInput = document.getElementById('messageInput');
    const fileInput = document.getElementById('fileInput');

    if (!messageInput) return;

    const message = messageInput.value.trim();
    const file = fileInput?.files?.[0];

    if (!message && !file) return;

    const formData = new FormData();
    formData.append('chatId', currentChat.id);
    formData.append('message', message);

    if (file) {
        formData.append('media', file);
    }

    if (replyMessage) {
        const replyData = {
            id: replyMessage.id,
            message: replyMessage.message,
            type: replyMessage.type,
            mediaUrl: replyMessage.mediaUrl,
            fileName: replyMessage.fileName
        };
        formData.append('replyTo', JSON.stringify(replyData));
    }

    try {
        const response = await fetch('/api/send-message', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success) {
            messageInput.value = '';
            if (fileInput) fileInput.value = '';
            messageInput.placeholder = 'Type a message';
            messageInput.style.height = 'auto';
            const attachmentPreview = document.getElementById('attachmentPreview');
            const attachmentContainer = document.getElementById('attachmentContainer');
            if (attachmentPreview) {
                attachmentPreview.style.display = 'none';
                attachmentPreview.innerHTML = '';
            }
            if (attachmentContainer) {
                attachmentContainer.style.display = 'none';
            }
            replyMessage = null;
            const replyContainer = document.getElementById('replyContainer');
            if (replyContainer) {
                replyContainer.style.display = 'none';
            }
        } else {
            throw new Error('Failed to send message');
        }
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message');
    }
}

function loadChatHistory(chatId) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    container.innerHTML = '<div class="loading">Loading messages...</div>';

    // Request presence untuk kontak ini
    if (!chatId.includes('@g.us')) {
        socket.emit('requestPresence', { contactId: chatId });
    }

    fetch(`/api/chat-history/${chatId}`)
        .then(async response => {
            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`${response.status}: ${errorData}`);
            }
            return response.json();
        })
        .then(history => {
            if (!Array.isArray(history)) {
                throw new Error('Invalid response format');
            }

            container.innerHTML = '';

            if (history.length === 0) {
                container.innerHTML = '<div class="no-messages">No messages found</div>';
                return;
            }

            // Sort messages by timestamp (oldest first)
            const sortedHistory = [...history].sort((a, b) => 
                new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );

            sortedHistory.forEach(msg => {
                try {
                    const messageElement = createMessageElement(msg, msg.fromMe);
                    container.appendChild(messageElement);
                } catch (error) {
                    console.error('Error creating message element:', error, msg);
                    const errorElement = document.createElement('div');
                    errorElement.className = 'message-error';
                    errorElement.textContent = 'Error displaying message';
                    container.appendChild(errorElement);
                }
            });
            
            container.scrollTop = container.scrollHeight;

            if (history.length > 0) {
                socket.emit('markMessageAsRead', {
                    messageId: history[0].id,
                    chatId: chatId
                });
            }

            setUnreadStatus(chatId, false);
            const chatItem = document.querySelector(`.chat-item[data-chat-id="${chatId}"]`);
            if (chatItem) {
                const unreadIndicator = chatItem.querySelector('.unread-indicator');
                if (unreadIndicator) {
                    unreadIndicator.remove();
                }
            }
        })
        .catch(error => {
            console.error('Error loading chat history:', error);
            container.innerHTML = `
                <div class="error">
                    <p>Error loading messages</p>
                    <p class="error-details">${error.message}</p>
                    <button onclick="loadChatHistory('${chatId}')">Retry</button>
                </div>
            `;
        });
}

// Event Listeners
document.getElementById('messageInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

let typingTimeout = null;

document.getElementById('messageInput')?.addEventListener('input', (e) => {
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';

    if (currentChat) {
        const isTyping = textarea.value.length > 0;
        
        socket.emit('typing', { 
            chatId: currentChat.id, 
            isTyping: isTyping 
        });

        if (typingTimeout) {
            clearTimeout(typingTimeout);
        }

        typingTimeout = setTimeout(() => {
            socket.emit('typing', { 
                chatId: currentChat.id, 
                isTyping: false 
            });
        }, 3000);
    }
});

document.getElementById('messageInput')?.addEventListener('blur', () => {
    if (currentChat) {
        socket.emit('typing', { 
            chatId: currentChat.id, 
            isTyping: false 
        });
        
        if (typingTimeout) {
            clearTimeout(typingTimeout);
        }
    }
});

document.getElementById('sendButton')?.addEventListener('click', sendMessage);

document.getElementById('cancelReplyButton')?.addEventListener('click', () => {
    replyMessage = null;
    const replyContainer = document.getElementById('replyContainer');
    if (replyContainer) {
        replyContainer.style.display = 'none';
    }
});

document.getElementById('attachButton')?.addEventListener('click', () => {
    document.getElementById('fileInput')?.click();
});

document.getElementById('cancelAttachmentButton')?.addEventListener('click', () => {
    const attachmentContainer = document.getElementById('attachmentContainer');
    const attachmentPreview = document.getElementById('attachmentPreview');
    const fileInput = document.getElementById('fileInput');

    if (attachmentContainer) {
        attachmentContainer.style.display = 'none';
    }
    if (attachmentPreview) {
        attachmentPreview.innerHTML = '';
        attachmentPreview.style.display = 'none';
    }
    if (fileInput) {
        fileInput.value = '';
    }
});

document.getElementById('fileInput')?.addEventListener('change', (e) => {
    const input = e.target;
    const attachmentContainer = document.getElementById('attachmentContainer');
    const attachmentName = document.getElementById('attachmentName');
    const attachmentPreview = document.getElementById('attachmentPreview');

    if (input.files?.[0] && attachmentContainer && attachmentName && attachmentPreview) {
        attachmentContainer.style.display = 'flex';
        attachmentPreview.style.display = 'flex';
        attachmentPreview.innerHTML = '';

        const file = input.files[0];
        attachmentName.textContent = file.name;

        if (file.type.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            img.alt = 'Image Preview';
            attachmentPreview.appendChild(img);
        } else if (file.type.startsWith('video/')) {
            const video = document.createElement('video');
            video.controls = true;
            const source = document.createElement('source');
            source.src = URL.createObjectURL(file);
            video.appendChild(source);
            attachmentPreview.appendChild(video);
        } else {
            const documentLink = document.createElement('a');
            documentLink.href = URL.createObjectURL(file);
            documentLink.textContent = file.name;
            attachmentPreview.appendChild(documentLink);
        }
    }
});

document.getElementById('searchInput')?.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const chatItems = document.querySelectorAll('.chat-item');

    chatItems.forEach(item => {
        const name = item.querySelector('.chat-name')?.textContent?.toLowerCase() || '';
        const preview = item.querySelector('.chat-preview')?.textContent?.toLowerCase() || '';

        if (name.includes(searchTerm) || preview.includes(searchTerm)) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
});

document.getElementById('logoutButton')?.addEventListener('click', async () => {
    try {
        const response = await fetch('/api/logout', { method: 'POST' });
        const result = await response.json();
        if (result.success) {
            console.log('Logged out successfully');
        } else {
            throw new Error('Failed to logout');
        }
    } catch (error) {
        console.error('Error logging out:', error);
        alert('Failed to logout');
    }
});

// Helper functions
function getUnreadStatus(chatId) {
    const unreadStatus = JSON.parse(localStorage.getItem('unreadStatus') || '{}');
    return unreadStatus[chatId] || false;
}

function setUnreadStatus(chatId, status) {
    const unreadStatus = JSON.parse(localStorage.getItem('unreadStatus') || '{}');
    unreadStatus[chatId] = status;
    localStorage.setItem('unreadStatus', JSON.stringify(unreadStatus));
}

// Debug panel (optional)
const debugPanel = document.createElement('div');
debugPanel.id = 'debugPanel';
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
`;

document.body.appendChild(debugPanel);

function updateDebugInfo() {
    if (debugPanel) {
        debugPanel.innerHTML = `
            <div>Socket Connected: ${socket.connected}</div>
            <div>Current Chat: ${currentChat ? `${currentChat.name} (${currentChat.id})` : 'None'}</div>
            <div>Messages in Memory: ${messages.size}</div>
            <div>Last Update: ${new Date().toISOString()}</div>
        `;
    }
}

setInterval(updateDebugInfo, 1000);

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none';
    }
});