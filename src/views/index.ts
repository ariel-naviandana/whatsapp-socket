import { Request, Response } from 'express'

export const renderIndex = (req: Request, res: Response) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Web Client</title>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <link href="/styles/main.css" rel="stylesheet">
</head>
<body>
    <div class="container">
        <div class="sidebar">
            <div class="user-info">
                <div class="user-details">
                    <div id="userName" class="user-name"></div>
                    <div id="connectedNumber" class="user-number"></div>
                </div>
                <button id="logoutButton" class="logout-button">Logout</button>
            </div>
            <div class="search-container">
                <input type="text" class="search-input" placeholder="Search or start new chat" id="searchInput">
            </div>
            <div class="chat-list" id="chatList"></div>
        </div>

        <div class="main-chat">
            <div class="chat-header">
                <div class="chat-header-content" id="chatHeader">
                    <h3>Select a chat to start messaging</h3>
                </div>
            </div>

            <div class="messages-container" id="messagesContainer"></div>

            <div class="chat-footer">
                <div class="attachment-preview" id="attachmentPreview" style="display: none;"></div>
                <div class="attachment-container" id="attachmentContainer" style="display: none;">
                    <span class="attachment-name" id="attachmentName"></span>
                    <button id="cancelAttachmentButton" class="attach-button">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="reply-container" id="replyContainer">
                    <div class="reply-header">
                        <span class="reply-message" id="replyMessage"></span>
                        <button id="cancelReplyButton" class="attach-button">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <img id="replyImage" class="reply-image" style="display: none;">
                    <a id="replyDocument" class="reply-document" style="display: none;"></a>
                </div>
                <div class="message-input-container">
                    <button class="attach-button" id="attachButton">
                        <i class="fas fa-paperclip"></i>
                    </button>
                    <input type="file" id="fileInput" style="display: none" accept="image/*,video/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
                    <textarea
                        class="message-input"
                        id="messageInput"
                        placeholder="Type a message"
                        rows="1"
                    ></textarea>
                    <button class="send-button" id="sendButton">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        </div>
    </div>

    <div id="qrCodeContainer" style="display: none">
        <p>Scan QR code with WhatsApp on your phone</p>
        <div id="qrCode"></div>
    </div>

    <audio id="notificationSound" src="/sounds/notification.mp3" style="display: none"></audio>

    <script src="/socket.io/socket.io.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/moment/2.29.1/moment.min.js"></script>
    <script src="/js/script.js"></script>
</body>
</html>`)
}

// Export handler for use in main router
export const indexHandler = {
    renderIndex
}