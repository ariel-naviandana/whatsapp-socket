const socket = io();
const messages = new Map();
let currentChat = null;
const notificationSound = document.getElementById('notificationSound');

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
                hour12: false,
            }).format(date);
        } else {
            return new Intl.DateTimeFormat('id-ID', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
            }).format(date);
        }
    } catch (error) {
        console.error('Error formatting timestamp:', error);
        return timestamp.toString();
    }
}

function createMessageElement(message, isOwnMessage) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${isOwnMessage ? 'sent' : 'received'}`;
    messageElement.id = `message-${message.id}`;

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';

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
        } else if (message.type === 'video') {
            const video = document.createElement('video');
            video.controls = true;
            const source = document.createElement('source');
            source.src = message.mediaUrl;
            video.appendChild(source);
            mediaContainer.appendChild(video);
        }

        messageContent.appendChild(mediaContainer);
    }

    const messageText = document.createElement('div');
    messageText.className = 'message-text';
    messageText.textContent = message.message;
    messageContent.appendChild(messageText);

    const messageTime = document.createElement('div');
    messageTime.className = 'message-time';
    messageTime.textContent = formatTimestamp(message.timestamp);
    messageContent.appendChild(messageTime);

    messageElement.appendChild(messageContent);
    return messageElement;
}

function updateChatList(message) {
    const chatList = document.getElementById('chatList');
    if (!chatList) return;

    let chatItem = Array.from(chatList.children).find(
        (item) => item.dataset.chatId === message.chatId
    );

    if (!chatItem) {
        chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.dataset.chatId = message.chatId;
        chatList.insertBefore(chatItem, chatList.firstChild);
    }

    const senderName = message.senderName || message.sender.split('@')[0];

    chatItem.innerHTML = `
        <div class="chat-name">${senderName}</div>
        <div class="chat-preview">${message.message}</div>
        <div class="chat-time">${formatTimestamp(message.timestamp)}</div>
    `;

    chatItem.onclick = () => {
        const chatId = message.chatId;
        const senderName = message.senderName || message.sender.split('@')[0];

        currentChat = { id: chatId, name: senderName };
        document.querySelectorAll('.chat-item').forEach((item) =>
            item.classList.remove('active')
        );
        chatItem.classList.add('active');

        const headerEl = document.getElementById('chatHeader');
        if (headerEl) {
            headerEl.innerHTML = `<h3>${senderName}</h3>`;
        }

        loadChatHistory(chatId);
    };
}

function loadChatHistory(chatId) {
    if (!chatId) {
        console.error('Chat ID is undefined or null');
        return;
    }

    currentChat = { id: chatId };

    const container = document.getElementById('messagesContainer');
    if (container) {
        container.innerHTML = '';
    }

    socket.emit('requestChatHistory', chatId);
}

socket.on('connect', () => {
    console.log('Connected to socket server');
});

socket.on('disconnect', () => {
    console.log('Disconnected from socket server');
});

socket.on('message', (message) => {
    messages.set(message.id, message);
    updateChatList(message);

    if (currentChat && message.chatId === currentChat.id) {
        const container = document.getElementById('messagesContainer');
        if (container) {
            const messageElement = createMessageElement(message, message.fromMe);
            container.appendChild(messageElement);
            container.scrollTop = container.scrollHeight;
        }
    }

    if (!message.fromMe && notificationSound) {
        notificationSound
            .play()
            .catch((err) => console.log('Error playing sound:', err));
    }
});

socket.on('chatHistory', (data) => {
    if (currentChat && data.chatId === currentChat.id) {
        const container = document.getElementById('messagesContainer');
        if (container) {
            container.innerHTML = '';
            data.messages.forEach((msg) => {
                const messageElement = createMessageElement(msg, msg.fromMe);
                container.appendChild(messageElement);
            });
            container.scrollTop = container.scrollHeight;
        }
    }
});

socket.on('ready', (data) => {
    document.getElementById('qrCodeContainer').style.display = 'none';

    const userNameEl = document.getElementById('userName');
    const connectedNumberEl = document.getElementById('connectedNumber');

    if (userNameEl) userNameEl.textContent = data.userName || '';
    if (connectedNumberEl) connectedNumberEl.textContent = `+${data.phoneNumber}`;

    if (data.chats && Array.isArray(data.chats)) {
        data.chats.forEach((chat) => {
            updateChatList({
                chatId: chat.id,
                senderName: chat.name,
                message: chat.lastMessage || '',
                timestamp: chat.timestamp,
                sender: chat.id,
            });
        });
    }
});

socket.on('qr', (qr) => {
    const qrCodeContainer = document.getElementById('qrCodeContainer');
    const qrCodeElement = document.getElementById('qrCode');

    if (qrCodeElement) {
        qrCodeElement.src = qr;
        qrCodeContainer.style.display = 'block';
    }
});

socket.on('disconnected', (reason) => {
    console.log('WhatsApp disconnected:', reason);
    document.getElementById('qrCodeContainer').style.display = 'block';
});

socket.on('chatHistoryError', (data) => {
    console.error(
        `Error loading chat history for ${data.chatId}: ${data.error}`
    );
    alert(`Gagal memuat riwayat obrolan. Kesalahan: ${data.error}`);
});
