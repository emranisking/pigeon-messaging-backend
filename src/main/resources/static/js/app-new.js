/**
 * ============================================================
 * MESSENGER APP - MAIN APPLICATION MODULE
 * ============================================================
 * 
 * Purpose: Core application logic and state management
 * - Initializes app on page load
 * - Manages conversations and group chats
 * - Handles message rendering and sending
 * - Manages WebSocket connections and real-time updates
 * - Provides UI interaction handlers
 * - Manages modal dialogs for creating chats/groups
 * 
 * ============================================================
 */

const App = (() => {
    // ============================================================
    // APPLICATION STATE
    // ============================================================
    // These variables track the current app state

    let currentUser = null;                    // Logged-in user info
    let conversations = [];                    // 1-1 conversations list
    let groups = [];                           // Group chats list
    let activeConversation = null;             // Currently open 1-1 conversation ID
    let activeGroup = null;                    // Currently open group ID
    let activeOtherUser = null;                // Other user in active 1-1 conversation
    let messages = {};                         // Messages by conversation ID
    let groupMessages = {};                    // Messages by group ID
    let nextCursor = {};                       // Pagination cursors
    let hasMore = {};                          // Whether more messages available
    let userCache = {};                        // Cache of user objects to reduce API calls
    let deliveredMessages = new Set();         // Track which messages we've sent delivery status for
    let seenMessages = new Set();              // Track which messages we've sent read status for
    let searchDebounce = null;                 // Debounce timer for search
    let currentTab = 'chats';                  // Currently active sidebar tab

    // ============================================================
    // CONSTANTS
    // ============================================================

    /**
     * Predefined colors for user avatars
     * Uses consistent colors per username via hashing
     */
    const AVATAR_COLORS = [
        '#1877f2', '#42b72a', '#f02849', '#a033ff',
        '#f5533d', '#00a884', '#0095f6', '#ff6900'
    ];

    // ============================================================
    // UTILITY FUNCTIONS - AVATAR & DISPLAY
    // ============================================================

    /**
     * Get consistent color for a username
     * @param {string} str - Username string
     * @returns {string} Color hex code
     * Purpose: Generate same color every time for same username
     */
    function getAvatarColor(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
    }

    /**
     * Get first letter of username for avatar
     * @param {string} username - Username
     * @returns {string} First letter, uppercase
     * Purpose: Display in circular avatar badges
     */
    function getInitial(username) {
        return (username || '?').charAt(0).toUpperCase();
    }

    /**
     * Set avatar element with color and initial
     * @param {HTMLElement} el - Avatar DOM element
     * @param {string} username - Username
     * Purpose: Populate avatar visual with consistent styling
     */
    function setAvatarEl(el, username) {
        el.textContent = getInitial(username);
        el.style.background = getAvatarColor(username);
    }

    /**
     * Escape HTML special characters to prevent XSS
     * @param {string} str - String to escape
     * @returns {string} Escaped string safe for HTML
     * Purpose: Prevent malicious code injection in messages
     */
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Truncate long strings with ellipsis
     * @param {string} str - String to truncate
     * @param {number} len - Max length
     * @returns {string} Truncated string
     * Purpose: Show message previews in conversation list
     */
    function truncate(str, len) {
        if (!str) return '';
        return str.length > len ? str.substring(0, len) + '...' : str;
    }

    // ============================================================
    // UTILITY FUNCTIONS - TIME & DATE
    // ============================================================

    /**
     * Parse various timestamp formats to Date
     * @param {string|number|Date} value - Timestamp in any format
     * @returns {Date} Parsed date object
     * Purpose: Normalize timestamps from backend (ISO string, milliseconds, etc)
     */
    function parseTimestamp(value) {
        if (!value) return new Date();
        if (value instanceof Date) return value;
        if (typeof value === 'string') return new Date(value);
        if (typeof value === 'number') {
            return value < 1e12 ? new Date(value * 1000) : new Date(value);
        }
        return new Date();
    }

    /**
     * Format timestamp for conversation list (relative time)
     * @param {string} isoString - ISO timestamp
     * @returns {string} Formatted time (e.g., "2:30 PM", "Yesterday", "Mon")
     * Purpose: Show brief time indicator in conversation preview
     */
    function formatTime(isoString) {
        const d = parseTimestamp(isoString);
        const now = new Date();
        const diffMs = now - d;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return d.toLocaleDateString([], { weekday: 'short' });
        } else {
            return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
    }

    /**
     * Format timestamp for message bubbles (full time)
     * @param {string} isoString - ISO timestamp
     * @returns {string} Formatted time (e.g., "May 6, 2:30 PM")
     * Purpose: Show detailed time when hovering message
     */
    function formatFullTime(isoString) {
        const d = parseTimestamp(isoString);
        return d.toLocaleString([], {
            month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    /**
     * Format timestamp for date separators in message list
     * @param {string} isoString - ISO timestamp
     * @returns {string} Formatted date (e.g., "Today", "Yesterday", "Monday, May 6, 2026")
     * Purpose: Show date breaks between messages from different days
     */
    function formatDateSeparator(isoString) {
        const d = parseTimestamp(isoString);
        const now = new Date();
        const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }

    // ============================================================
    // INITIALIZATION
    // ============================================================

    /**
     * Initialize application on page load
     * @async
     * Purpose: Entry point - set up entire app
     * Process:
     * 1. Check authentication
     * 2. Load user data
     * 3. Setup UI
     * 4. Load conversations and groups
     * 5. Connect WebSocket
     * 6. Setup event listeners
     */
    async function init() {
        const token = localStorage.getItem('token');
        const userId = localStorage.getItem('userId');
        const username = localStorage.getItem('username');

        // Redirect to login if not authenticated
        if (!token || !userId) {
            window.location.href = '/index.html';
            return;
        }

        // Initialize current user
        currentUser = { id: userId, username: username || 'User' };
        userCache[userId] = currentUser;

        // Setup UI and load data
        setupUI();
        setMobilePanels(false);

        await loadConversations();
        await loadGroups();

        // Connect WebSocket and setup handlers
        setupWebSocket(token, userId);
        setupEventHandlers();
    }

    /**
     * Setup sidebar user profile
     * Purpose: Display current user name and avatar
     */
    function setupUI() {
        const userAvatar = document.getElementById('userAvatar');
        const userName = document.getElementById('userName');
        if (userAvatar && userName) {
            setAvatarEl(userAvatar, currentUser.username);
            userName.textContent = currentUser.username;
        }
    }

    /**
     * Toggle sidebar/chat panel visibility on mobile
     * @param {boolean} showChat - true: show chat, hide sidebar | false: show sidebar, hide chat
     * Purpose: Handle mobile responsive layout
     */
    function setMobilePanels(showChat) {
        if (window.innerWidth > 768) return; // Only on mobile
        const sidebar = document.getElementById('sidebar');
        const chatPanel = document.getElementById('chatPanel');
        if (!sidebar || !chatPanel) return;

        if (showChat) {
            sidebar.classList.add('hidden');
            chatPanel.classList.remove('hidden');
        } else {
            sidebar.classList.remove('hidden');
            chatPanel.classList.add('hidden');
        }
    }

    // ============================================================
    // CONVERSATIONS (1-1 CHATS)
    // ============================================================

    /**
     * Load all conversations from API
     * @async
     * Purpose: Populate sidebar with user's conversations
     */
    async function loadConversations() {
        const loadingEl = document.getElementById('convLoading');
        try {
            const data = await API.getConversations();
            conversations = data || [];

            // Cache all users for quick lookup
            conversations.forEach(c => {
                if (c.otherUser) {
                    userCache[c.otherUser.id] = c.otherUser;
                }
            });

            renderConversationList();
        } catch (err) {
            console.error('Failed to load conversations:', err);
        } finally {
            if (loadingEl) loadingEl.style.display = 'none';
        }
    }

    /**
     * Render conversations list in sidebar
     * Purpose: Display all conversations sorted by most recent
     * Shows: avatar, user name, last message preview, timestamp, unread badge
     */
    function renderConversationList() {
        const listEl = document.getElementById('conversationList');
        const loadingEl = document.getElementById('convLoading');

        // Sort by most recent message
        const sorted = [...conversations].sort((a, b) => {
            const timeA = a.lastMessage ? parseTimestamp(a.lastMessage.createdAt) : parseTimestamp(a.createdAt);
            const timeB = b.lastMessage ? parseTimestamp(b.lastMessage.createdAt) : parseTimestamp(b.createdAt);
            return timeB - timeA;
        });

        let html = '';

        sorted.forEach(conv => {
            const isActive = activeConversation === conv.conversationId;
            const user = conv.otherUser || { id: '', username: 'Unknown' };
            const lastMsg = conv.lastMessage;
            const isUnread = lastMsg && lastMsg.senderId !== currentUser.id && lastMsg.status !== 'seen';

            // Build preview text
            let preview = '';
            let timeStr = '';
            if (lastMsg) {
                const prefix = lastMsg.senderId === currentUser.id ? 'You: ' : '';
                preview = prefix + truncate(lastMsg.content, 30);
                timeStr = formatTime(lastMsg.createdAt);
            }

            html += `
                <div class="conversation-item${isActive ? ' active' : ''}"
                     data-conv-id="${conv.conversationId}"
                     data-user-id="${user.id}"
                     data-username="${escapeHtml(user.username)}"
                     onclick="App.openConversation('${conv.conversationId}', '${user.id}', '${escapeHtml(user.username)}')">
                    <div class="conversation-avatar" style="background:${getAvatarColor(user.username)}">
                        ${getInitial(user.username)}
                    </div>
                    <div class="conversation-info">
                        <div class="conversation-name${isUnread ? ' unread' : ''}">${escapeHtml(user.username)}</div>
                        ${preview ? `<div class="conversation-preview${isUnread ? ' unread' : ''}">${escapeHtml(preview)}</div>` : ''}
                    </div>
                    <div class="conversation-meta">
                        ${timeStr ? `<div class="conversation-time">${timeStr}</div>` : ''}
                        ${isUnread ? '<div class="unread-badge"></div>' : ''}
                    </div>
                </div>
            `;
        });

        listEl.innerHTML = html;
    }

    /**
     * Open a 1-1 conversation
     * @param {string} conversationId - Conversation ID
     * @param {string} otherUserId - ID of other user
     * @param {string} otherUsername - Username of other user
     * @async
     * Purpose: Switch to conversation, load messages, mark as read
     */
    async function openConversation(conversationId, otherUserId, otherUsername) {
        activeGroup = null;
        activeConversation = conversationId;
        activeOtherUser = { id: otherUserId, username: otherUsername };
        userCache[otherUserId] = activeOtherUser;

        // Show chat view, hide empty state
        const chatEmpty = document.getElementById('chatEmpty');
        const chatView = document.getElementById('chatView');
        if (chatEmpty) chatEmpty.style.display = 'none';
        if (chatView) chatView.style.display = 'flex';

        // Update chat header
        const chatAvatar = document.getElementById('chatAvatar');
        const chatName = document.getElementById('chatName');
        const chatStatus = document.getElementById('chatStatus');
        if (chatAvatar) setAvatarEl(chatAvatar, otherUsername);
        if (chatName) chatName.textContent = otherUsername;
        if (chatStatus) chatStatus.textContent = 'Active now';

        // Handle mobile view
        setMobilePanels(true);

        // Highlight active conversation
        document.querySelectorAll('.conversation-item').forEach(el => {
            el.classList.toggle('active', el.dataset.convId === conversationId);
        });

        // Load messages if not cached
        if (!messages[conversationId]) {
            messages[conversationId] = [];
            nextCursor[conversationId] = null;
            hasMore[conversationId] = true;
            await loadMessages(conversationId);
        } else {
            renderMessages();
        }

        // Mark all messages as read
        markMessagesAsSeen(conversationId);

        // Focus input
        const chatInput = document.getElementById('chatInput');
        if (chatInput) chatInput.focus();
    }

    /**
     * Close active conversation
     * Purpose: Clear chat area and return to empty state
     */
    function closeConversation() {
        activeConversation = null;
        activeOtherUser = null;
        activeGroup = null;

        // Show empty state
        const chatEmpty = document.getElementById('chatEmpty');
        const chatView = document.getElementById('chatView');
        if (chatEmpty) chatEmpty.style.display = 'flex';
        if (chatView) chatView.style.display = 'none';

        // Clear input
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            chatInput.value = '';
            chatInput.style.height = 'auto';
        }

        // Remove highlight from conversation items
        document.querySelectorAll('.conversation-item').forEach(el => {
            el.classList.remove('active');
        });

        // Clear messages
        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }

        setMobilePanels(false);
    }

    /**
     * Load message history for conversation
     * @param {string} conversationId - Conversation ID
     * @param {boolean} prepend - true: load older, false: load latest
     * @async
     * Purpose: Fetch messages with pagination for infinite scroll
     */
    async function loadMessages(conversationId, prepend = false) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;

        // Show loading spinner if loading latest
        if (!prepend) {
            container.innerHTML = '<div class="loading-spinner"></div>';
        }

        try {
            const cursor = prepend ? nextCursor[conversationId] : null;
            const data = await API.getMessages(conversationId, cursor, 50);

            if (data && data.messages) {
                const newMsgs = data.messages.reverse();

                // Merge with existing messages
                if (prepend) {
                    messages[conversationId] = [...newMsgs, ...(messages[conversationId] || [])];
                } else {
                    messages[conversationId] = newMsgs;
                }

                // Update pagination state
                nextCursor[conversationId] = data.nextCursor || null;
                hasMore[conversationId] = data.hasMore || false;
            }

            renderMessages(prepend);

            // Scroll to bottom on initial load
            if (!prepend) {
                scrollToBottom();
            }
        } catch (err) {
            console.error('Failed to load messages:', err);
            if (!prepend && container) {
                container.innerHTML = '';
            }
        }
    }

    /**
     * Render messages to DOM
     * @param {boolean} preserveScroll - true: maintain scroll position, false: auto-scroll
     * Purpose: Display messages grouped by sender and date
     * Features: Avatar badges, time stamps, message status icons, date separators
     */
    function renderMessages(preserveScroll = false) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;

        const convId = activeConversation || '_pending_conv';
        const msgs = messages[convId] || [];

        if (!activeConversation && !messages['_pending_conv']) return;

        // Track scroll position to preserve on update
        const scrolledToBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
        const oldScrollHeight = container.scrollHeight;

        let html = '';

        // Add "Load Older" button if more messages available
        if (hasMore[convId]) {
            html += '<div class="load-more-wrap"><button class="btn-load-more" onclick="App.loadOlder()">Load older messages</button></div>';
        }

        let lastSenderId = null;
        let lastDate = null;

        // Process each message
        for (let i = 0; i < msgs.length; i++) {
            const msg = msgs[i];
            const isSent = msg.senderId === currentUser.id;
            const msgDate = parseTimestamp(msg.createdAt);
            const dateKey = msgDate.toDateString();

            // Add date separator if date changed
            if (dateKey !== lastDate) {
                html += `<div class="date-separator">${formatDateSeparator(msg.createdAt)}</div>`;
                lastDate = dateKey;
                lastSenderId = null;
            }

            // Determine bubble style (single, first, middle, last)
            const sameSender = msg.senderId === lastSenderId;
            const nextMsg = msgs[i + 1];
            const nextSameSender = nextMsg && nextMsg.senderId === msg.senderId &&
                parseTimestamp(nextMsg.createdAt).toDateString() === dateKey;
            const isNewGroup = !sameSender;
            const isLastInGroup = !nextSameSender;

            let bubbleClass;
            if (isNewGroup && isLastInGroup) bubbleClass = 'single';
            else if (isNewGroup) bubbleClass = 'first';
            else if (isLastInGroup) bubbleClass = 'last';
            else bubbleClass = 'middle';

            const direction = isSent ? 'sent' : 'received';
            const otherUser = activeOtherUser || { username: '?' };

            // Add avatar for received messages
            let avatarHtml = '';
            if (!isSent) {
                if (isLastInGroup) {
                    avatarHtml = `<div class="message-avatar-small" style="background:${getAvatarColor(otherUser.username)}">${getInitial(otherUser.username)}</div>`;
                } else {
                    avatarHtml = '<div class="message-avatar-spacer"></div>';
                }
            }

            // Add delivery status icon for sent messages
            let statusHtml = '';
            if (isSent && isLastInGroup) {
                statusHtml = renderStatusIcon(msg.status, otherUser);
            }

            html += `
                <div class="message-row ${direction}" data-msg-id="${msg.messageId}">
                    ${!isSent ? avatarHtml : ''}
                    <div>
                        <div class="message-bubble ${direction} ${bubbleClass}">${escapeHtml(msg.content)}</div>
                        <div class="message-time">${formatFullTime(msg.createdAt)}</div>
                        ${statusHtml}
                    </div>
                </div>
            `;

            lastSenderId = msg.senderId;
        }

        container.innerHTML = html;

        // Handle scroll position
        if (preserveScroll) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - oldScrollHeight;
        } else if (scrolledToBottom || !preserveScroll) {
            scrollToBottom();
        }
    }

    /**
     * Render message status indicator
     * @param {string} status - Message status (sent, delivered, seen)
     * @param {object} otherUser - Other user object
     * @returns {string} HTML for status icon
     * Purpose: Show delivery/read receipt with icons
     */
    function renderStatusIcon(status, otherUser) {
        switch (status) {
            case 'sent':
                return `<div class="message-status"><span class="status-icon sent"></span></div>`;
            case 'delivered':
                return `<div class="message-status"><span class="status-icon delivered"></span></div>`;
            case 'seen':
                return `<div class="message-status"><span class="status-icon seen" style="background:${getAvatarColor(otherUser.username)}">${getInitial(otherUser.username)}</span></div>`;
            default:
                return '';
        }
    }

    /**
     * Scroll message container to bottom
     * Purpose: Auto-scroll to latest message
     */
    function scrollToBottom() {
        const container = document.getElementById('messagesContainer');
        requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
        });
    }

    /**
     * Load older messages (pagination)
     * Purpose: Called when user clicks "Load older" button
     */
    function loadOlder() {
        if (activeConversation && hasMore[activeConversation]) {
            loadMessages(activeConversation, true);
        }
    }

    // ============================================================
    // SENDING MESSAGES
    // ============================================================

    /**
     * Send 1-1 message
     * Purpose: Send message via WebSocket, show temporarily, wait for confirmation
     */
    function sendMessage() {
        // Delegate to group sender if in group
        if (activeGroup) {
            sendGroupMessage();
            return;
        }

        const input = document.getElementById('chatInput');
        const content = input.value.trim();

        if (!content || !activeOtherUser) return;

        // Send via WebSocket
        const success = WS.sendMessage(activeOtherUser.id, content, activeConversation);

        if (success) {
            // Create temporary message object
            const tempMsg = {
                messageId: '_pending_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                conversationId: activeConversation || '_pending_conv',
                senderId: currentUser.id,
                receiverId: activeOtherUser.id,
                content: content,
                status: 'sent',
                createdAt: new Date().toISOString(),
                _pending: true
            };

            // Add to messages cache
            const convId = activeConversation || '_pending_conv';
            if (!messages[convId]) {
                messages[convId] = [];
            }
            messages[convId].push(tempMsg);

            // Update UI
            if (activeConversation || convId === '_pending_conv') {
                renderMessages();
                scrollToBottom();
            }

            // Clear input
            input.value = '';
            input.style.height = 'auto';
            updateSendButton();
        }
    }

    /**
     * Send group message
     * Purpose: Send message to group via WebSocket
     */
    function sendGroupMessage() {
        const input = document.getElementById('chatInput');
        const content = input.value.trim();

        if (!content || !activeGroup) return;

        const success = WS.sendGroupMessage(activeGroup, content);

        if (success) {
            // Create temporary message
            const tempMsg = {
                messageId: '_pending_' + Date.now(),
                groupId: activeGroup,
                senderId: currentUser.id,
                senderUsername: currentUser.username,
                content: content,
                createdAt: new Date().toISOString(),
                _pending: true
            };

            if (!groupMessages[activeGroup]) {
                groupMessages[activeGroup] = [];
            }
            groupMessages[activeGroup].push(tempMsg);
            renderGroupMessages();

            // Clear input
            input.value = '';
            input.style.height = 'auto';
            updateSendButton();
        }
    }

    /**
     * Update send button enabled/disabled state
     * Purpose: Disable send button when input empty
     */
    function updateSendButton() {
        const input = document.getElementById('chatInput');
        const btn = document.getElementById('btnSend');
        btn.disabled = !input.value.trim();
    }

    // ============================================================
    // MESSAGE STATUS TRACKING
    // ============================================================

    /**
     * Mark all messages in conversation as read/seen
     * @param {string} conversationId - Conversation ID
     * Purpose: Send read receipts for unread messages
     */
    function markMessagesAsSeen(conversationId) {
        const msgs = messages[conversationId] || [];
        msgs.forEach(msg => {
            // Only send for messages from other user that aren't already marked seen
            if (msg.senderId !== currentUser.id && msg.status !== 'seen') {
                const key = msg.messageId;
                if (!seenMessages.has(key)) {
                    seenMessages.add(key);
                    WS.sendSeen(msg.messageId, msg.conversationId, msg.senderId, msg.createdAt);
                    msg.status = 'seen';
                }
            }
        });
    }

    /**
     * Mark single message as delivered
     * @param {object} msg - Message object
     * Purpose: Send delivery receipt to sender
     */
    function markMessageDelivered(msg) {
        const key = msg.messageId;
        if (!deliveredMessages.has(key)) {
            deliveredMessages.add(key);
            WS.sendDelivered(msg.messageId, msg.conversationId, msg.senderId, msg.createdAt);
        }
    }

    /**
     * Update conversation status in list when message status changes
     * @param {string} convId - Conversation ID
     * @param {string} status - New message status
     * Purpose: Reflect delivery/read status in conversation preview
     */
    function updateConversationStatus(convId, status) {
        const conv = conversations.find(c => c.conversationId === convId);
        if (conv && conv.lastMessage) {
            conv.lastMessage.status = status;
            renderConversationList();
        }
    }

    // ============================================================
    // WEBSOCKET HANDLERS
    // ============================================================

    /**
     * Setup WebSocket connection and event listeners
     * @param {string} token - JWT token
     * @param {string} userId - User ID
     * Purpose: Initialize real-time communication
     */
    function setupWebSocket(token, userId) {
        WS.on('connection', handleConnectionChange);
        WS.on('message', handleIncomingMessage);
        WS.on('status', handleStatusUpdate);
        WS.on('groupMessage', handleGroupMessage);
        WS.connect(token, userId);
    }

    /**
     * Handle WebSocket connection state changes
     * @param {string} state - Connection state (connecting, connected, disconnected)
     * Purpose: Show connection status bar
     */
    function handleConnectionChange(state) {
        const bar = document.getElementById('connectionBar');
        bar.className = 'connection-bar';

        switch (state) {
            case 'connecting':
                bar.classList.add('connecting');
                bar.textContent = 'Connecting...';
                break;
            case 'connected':
                bar.classList.add('connected');
                bar.textContent = 'Connected';
                break;
            case 'disconnected':
                bar.classList.add('disconnected');
                bar.textContent = 'Disconnected. Reconnecting...';
                break;
        }
    }

    /**
     * Handle incoming 1-1 message
     * @param {object} msg - Message object from server
     * Purpose: Receive and display real-time messages
     */
    function handleIncomingMessage(msg) {
        const convId = msg.conversationId;
        const isSent = msg.senderId === currentUser.id;

        // Initialize conversation messages array if needed
        if (!messages[convId]) {
            messages[convId] = [];
        }

        // Check if message already exists (prevent duplicates)
        const exists = messages[convId].some(m => m.messageId === msg.messageId);

        if (!exists) {
            // If sent message, replace temporary with real
            if (isSent) {
                const pendingIdx = messages[convId].findIndex(
                    m => m._pending && m.senderId === msg.senderId && m.content === msg.content
                );
                if (pendingIdx !== -1) {
                    messages[convId].splice(pendingIdx, 1);
                }
                // Also check pending conv for new conversations
                if (messages['_pending_conv'] && messages['_pending_conv'].length > 0) {
                    const pendingNewIdx = messages['_pending_conv'].findIndex(
                        m => m._pending && m.senderId === msg.senderId && m.content === msg.content
                    );
                    if (pendingNewIdx !== -1) {
                        messages['_pending_conv'].splice(pendingNewIdx, 1);
                        if (messages['_pending_conv'].length === 0) {
                            delete messages['_pending_conv'];
                        }
                    }
                }
            }

            // Add real message
            messages[convId].push(msg);
        }

        // Update conversation list
        updateConversationInList(msg);

        // Update active conversation ID if first message
        if (!activeConversation && activeOtherUser) {
            const otherUserId = isSent ? msg.receiverId : msg.senderId;
            if (otherUserId === activeOtherUser.id) {
                activeConversation = convId;
                nextCursor[convId] = null;
                hasMore[convId] = false;
            }
        }

        // Render if this is the active conversation
        if (activeConversation === convId) {
            renderMessages();
            scrollToBottom();

            // Send delivery/read receipt if received message
            if (!isSent) {
                markMessageDelivered(msg);
                setTimeout(() => {
                    const key = msg.messageId;
                    if (!seenMessages.has(key)) {
                        seenMessages.add(key);
                        WS.sendSeen(msg.messageId, msg.conversationId, msg.senderId, msg.createdAt);
                        msg.status = 'seen';
                    }
                }, 500);
            }
        } else if (!isSent) {
            // Mark delivered if not active
            markMessageDelivered(msg);
            playNotificationEffect();
        }
    }

    /**
     * Handle message status update (delivered/seen)
     * @param {object} event - Status event from server
     * Purpose: Update delivery status for sent messages
     */
    function handleStatusUpdate(event) {
        const convId = event.conversationId;
        const msgList = messages[convId];

        if (msgList) {
            // Update specific message status
            msgList.forEach(msg => {
                if (msg.messageId === event.messageId) {
                    msg.status = event.status;
                }
            });

            // If all messages seen, mark all as seen
            if (event.status === 'seen') {
                msgList.forEach(msg => {
                    if (msg.senderId === currentUser.id) {
                        if (msg.status === 'sent' || msg.status === 'delivered') {
                            msg.status = 'seen';
                        }
                    }
                });
            }

            // Re-render if active
            if (activeConversation === convId) {
                renderMessages();
            }
        }

        updateConversationStatus(convId, event.status);
    }

    /**
     * Update conversation list when new message arrives
     * @param {object} msg - Message object
     * Purpose: Bubble latest message to top of conversation list
     */
    function updateConversationInList(msg) {
        const convId = msg.conversationId;
        const otherUserId = msg.senderId === currentUser.id ? msg.receiverId : msg.senderId;

        // Update existing conversation
        let conv = conversations.find(c => c.conversationId === convId);

        if (conv) {
            conv.lastMessage = {
                content: msg.content,
                createdAt: msg.createdAt,
                senderId: msg.senderId,
                status: msg.status,
                messageId: msg.messageId
            };
        } else {
            // Create new conversation if doesn't exist
            const cachedUser = userCache[otherUserId];
            conv = {
                conversationId: convId,
                otherUser: cachedUser || { id: otherUserId, username: 'User' },
                lastMessage: {
                    content: msg.content,
                    createdAt: msg.createdAt,
                    senderId: msg.senderId,
                    status: msg.status,
                    messageId: msg.messageId
                }
            };
            conversations.push(conv);

            // Fetch full user info if not cached
            if (!cachedUser) {
                API.getUser(otherUserId).then(user => {
                    if (user) {
                        userCache[otherUserId] = user;
                        conv.otherUser = user;
                        renderConversationList();
                    }
                }).catch(() => {});
            }
        }

        renderConversationList();
    }

    // ============================================================
    // GROUPS (GROUP CHATS)
    // ============================================================

    /**
     * Load all groups from API
     * @async
     * Purpose: Populate groups tab in sidebar
     */
    async function loadGroups() {
        try {
            const data = await API.getGroups();
            groups = data || [];
            renderGroupList();
        } catch (err) {
            console.error('Failed to load groups:', err);
        }
    }

    /**
     * Render groups list
     * Purpose: Display all groups sorted by recent activity
     */
    function renderGroupList() {
        const listEl = document.getElementById('groupList');
        if (!listEl) return;

        // Sort by most recent message
        const sorted = [...groups].sort((a, b) => {
            const timeA = a.lastMessage ? parseTimestamp(a.lastMessage.createdAt) : parseTimestamp(a.createdAt);
            const timeB = b.lastMessage ? parseTimestamp(b.lastMessage.createdAt) : parseTimestamp(b.createdAt);
            return timeB - timeA;
        });

        let html = '';

        sorted.forEach(group => {
            const isActive = activeGroup === group.id;
            const lastMsg = group.lastMessage;
            const memberCount = group.members ? group.members.length : 0;

            // Build preview
            let preview = '';
            let timeStr = '';
            if (lastMsg) {
                const senderName = lastMsg.senderUsername || 'Someone';
                preview = `${senderName}: ${truncate(lastMsg.content, 25)}`;
                timeStr = formatTime(lastMsg.createdAt);
            } else {
                preview = `${memberCount} members`;
            }

            html += `
                <div class="conversation-item${isActive ? ' active' : ''}"
                     data-group-id="${group.id}"
                     onclick="App.openGroup('${group.id}')">
                    <div class="conversation-avatar group-avatar" style="background:${getAvatarColor(group.name)}">
                        ${getInitial(group.name)}
                    </div>
                    <div class="conversation-info">
                        <div class="conversation-name">${escapeHtml(group.name)}</div>
                        ${preview ? `<div class="conversation-preview">${escapeHtml(preview)}</div>` : ''}
                    </div>
                    <div class="conversation-meta">
                        ${timeStr ? `<div class="conversation-time">${timeStr}</div>` : ''}
                    </div>
                </div>
            `;
        });

        if (groups.length === 0) {
            html = '<div class="empty-list">No groups yet. Create one to get started!</div>';
        }

        listEl.innerHTML = html;
    }

    /**
     * Open a group
     * @param {string} groupId - Group ID
     * @async
     * Purpose: Switch to group, load messages, subscribe to updates
     */
    async function openGroup(groupId) {
        activeConversation = null;
        activeOtherUser = null;
        activeGroup = groupId;

        const group = groups.find(g => g.id === groupId);
        if (!group) return;

        // Show chat view
        document.getElementById('chatEmpty').style.display = 'none';
        const chatView = document.getElementById('chatView');
        chatView.style.display = 'flex';

        // Update header
        const chatAvatar = document.getElementById('chatAvatar');
        setAvatarEl(chatAvatar, group.name);
        document.getElementById('chatName').textContent = group.name;
        const memberCount = group.members ? group.members.length : 0;
        document.getElementById('chatStatus').textContent = `${memberCount} members`;

        setMobilePanels(true);

        // Highlight active group
        document.querySelectorAll('.conversation-item').forEach(el => {
            el.classList.toggle('active', el.dataset.groupId === groupId);
        });

        // Load messages if not cached
        if (!groupMessages[groupId]) {
            groupMessages[groupId] = [];
            await loadGroupMessages(groupId);
        } else {
            renderGroupMessages();
        }

        // Subscribe to group updates
        WS.subscribeToGroup(groupId);

        document.getElementById('chatInput').focus();
    }

    /**
     * Load group message history
     * @param {string} groupId - Group ID
     * @param {number} page - Page number for pagination
     * @async
     * Purpose: Fetch group messages with pagination
     */
    async function loadGroupMessages(groupId, page = 0) {
        const container = document.getElementById('messagesContainer');
        if (page === 0) {
            container.innerHTML = '<div class="loading-spinner"></div>';
        }

        try {
            const data = await API.getGroupMessages(groupId, page, 50);
            if (data) {
                const newMsgs = data.reverse();
                if (page === 0) {
                    groupMessages[groupId] = newMsgs;
                } else {
                    groupMessages[groupId] = [...newMsgs, ...(groupMessages[groupId] || [])];
                }
            }
            renderGroupMessages();
            if (page === 0) {
                scrollToBottom();
            }
        } catch (err) {
            console.error('Failed to load group messages:', err);
            container.innerHTML = '';
        }
    }

    /**
     * Render group messages
     * Purpose: Display group messages with sender names
     */
    function renderGroupMessages() {
        const container = document.getElementById('messagesContainer');
        const groupId = activeGroup;
        if (!groupId) return;

        const msgs = groupMessages[groupId] || [];
        let html = '';
        let lastSenderId = null;
        let lastDate = null;

        for (let i = 0; i < msgs.length; i++) {
            const msg = msgs[i];
            const isSent = msg.senderId === currentUser.id;
            const msgDate = parseTimestamp(msg.createdAt);
            const dateKey = msgDate.toDateString();

            // Add date separator
            if (dateKey !== lastDate) {
                html += `<div class="date-separator">${formatDateSeparator(msg.createdAt)}</div>`;
                lastDate = dateKey;
                lastSenderId = null;
            }

            // Determine bubble style
            const sameSender = msg.senderId === lastSenderId;
            const nextMsg = msgs[i + 1];
            const nextSameSender = nextMsg && nextMsg.senderId === msg.senderId &&
                parseTimestamp(nextMsg.createdAt).toDateString() === dateKey;
            const isNewGroup = !sameSender;
            const isLastInGroup = !nextSameSender;

            let bubbleClass;
            if (isNewGroup && isLastInGroup) bubbleClass = 'single';
            else if (isNewGroup) bubbleClass = 'first';
            else if (isLastInGroup) bubbleClass = 'last';
            else bubbleClass = 'middle';

            const direction = isSent ? 'sent' : 'received';
            const senderName = msg.senderUsername || 'Unknown';

            // Show sender name for new message groups (received only)
            let senderHtml = '';
            if (!isSent && isNewGroup) {
                senderHtml = `<div class="group-sender-name" style="color:${getAvatarColor(senderName)}">${escapeHtml(senderName)}</div>`;
            }

            // Add avatar
            let avatarHtml = '';
            if (!isSent) {
                if (isLastInGroup) {
                    avatarHtml = `<div class="message-avatar-small" style="background:${getAvatarColor(senderName)}">${getInitial(senderName)}</div>`;
                } else {
                    avatarHtml = '<div class="message-avatar-spacer"></div>';
                }
            }

            html += `
                <div class="message-row ${direction}" data-msg-id="${msg.messageId}">
                    ${!isSent ? avatarHtml : ''}
                    <div>
                        ${senderHtml}
                        <div class="message-bubble ${direction} ${bubbleClass}">${escapeHtml(msg.content)}</div>
                        <div class="message-time">${formatFullTime(msg.createdAt)}</div>
                    </div>
                </div>
            `;

            lastSenderId = msg.senderId;
        }

        container.innerHTML = html;
        scrollToBottom();
    }

    /**
     * Create new group
     * @param {string} name - Group name
     * @param {array} memberIds - Array of user IDs to add
     * @returns {object} Created group object
     * @async
     * Purpose: Call API to create group, add to list, open it
     */
    async function createGroup(name, memberIds) {
        try {
            const group = await API.createGroup(name, memberIds);
            groups.unshift(group);
            renderGroupList();
            openGroup(group.id);
            return group;
        } catch (err) {
            console.error('Failed to create group:', err);
            throw err;
        }
    }

    /**
     * Handle incoming group message
     * @param {object} msg - Message object
     * Purpose: Receive and display real-time group messages
     */
    function handleGroupMessage(msg) {
        const groupId = msg.groupId;

        if (!groupMessages[groupId]) {
            groupMessages[groupId] = [];
        }

        // Check for pending message replacement
        const pendingIndex = groupMessages[groupId].findIndex(m =>
            m._pending &&
            m.senderId === msg.senderId &&
            m.content === msg.content
        );

        if (pendingIndex !== -1) {
            groupMessages[groupId][pendingIndex] = msg;
        } else {
            // Check for duplicate
            const exists = groupMessages[groupId].some(m => m.messageId === msg.messageId);
            if (!exists) {
                groupMessages[groupId].push(msg);
            }
        }

        // Update group's last message
        const group = groups.find(g => g.id === groupId);
        if (group) {
            group.lastMessage = msg;
            renderGroupList();
        }

        // Render if active
        if (activeGroup === groupId) {
            renderGroupMessages();
        } else {
            playNotificationEffect();
        }
    }

    /**
     * Switch sidebar tab (Chats vs Groups)
     * @param {string} tab - Tab name ('chats' or 'groups')
     * Purpose: Show/hide conversation and group lists
     */
    function switchTab(tab) {
        currentTab = tab;
        const chatsTab = document.getElementById('tabChats');
        const groupsTab = document.getElementById('tabGroups');
        const convList = document.getElementById('conversationList');
        const groupList = document.getElementById('groupList');

        if (tab === 'chats') {
            chatsTab?.classList.add('active');
            groupsTab?.classList.remove('active');
            if (convList) convList.style.display = '';
            if (groupList) groupList.style.display = 'none';
        } else {
            chatsTab?.classList.remove('active');
            groupsTab?.classList.add('active');
            if (convList) convList.style.display = 'none';
            if (groupList) groupList.style.display = '';
        }
    }

    /**
     * Play notification effect when new message arrives
     * Purpose: Visual indicator of new message (title change)
     */
    function playNotificationEffect() {
        const originalTitle = document.title;
        document.title = '💬 New Message!';
        setTimeout(() => { document.title = originalTitle; }, 3000);
    }

    // ============================================================
    // MODAL DIALOGS - NEW CHAT
    // ============================================================

    /**
     * Open "New Chat" modal dialog
     * Purpose: Search and select user to start 1-1 chat
     */
    function openNewChatModal() {
        document.getElementById('newChatModal').classList.add('active');
        document.getElementById('modalSearchInput').value = '';
        document.getElementById('modalUserList').innerHTML = '<div class="search-empty">Type a name to search</div>';
        setTimeout(() => document.getElementById('modalSearchInput').focus(), 100);
    }

    /**
     * Close "New Chat" modal
     */
    function closeNewChatModal() {
        document.getElementById('newChatModal').classList.remove('active');
    }

    /**
     * Search users in "New Chat" modal
     * @param {string} query - Search query
     * @async
     * Purpose: Search API and display matching users
     */
    async function searchUsersModal(query) {
        const listEl = document.getElementById('modalUserList');

        if (!query) {
            listEl.innerHTML = '<div class="search-empty">Type a name to search</div>';
            return;
        }

        listEl.innerHTML = '<div class="loading-spinner"></div>';

        try {
            const users = await API.searchUsers(query);

            if (!users || users.length === 0) {
                listEl.innerHTML = '<div class="search-empty">No users found</div>';
                return;
            }

            let html = '';
            users.forEach(user => {
                html += `
                    <div class="modal-user-item" onclick="App.startConversation('${user.id}', '${escapeHtml(user.username)}')">
                        <div class="modal-user-avatar" style="background:${getAvatarColor(user.username)}">
                            ${getInitial(user.username)}
                        </div>
                        <div class="modal-user-name">${escapeHtml(user.username)}</div>
                    </div>
                `;
            });

            listEl.innerHTML = html;
        } catch (err) {
            listEl.innerHTML = '<div class="search-empty">Search failed</div>';
        }
    }

    /**
     * Start new 1-1 conversation with user
     * @param {string} otherUserId - User ID
     * @param {string} otherUsername - Username
     * @async
     * Purpose: Open chat with selected user or create new if doesn't exist
     */
    async function startConversation(otherUserId, otherUsername) {
        closeNewChatModal();
        userCache[otherUserId] = { id: otherUserId, username: otherUsername };

        // Check if conversation already exists
        const existing = conversations.find(c => c.otherUser && c.otherUser.id === otherUserId);
        if (existing) {
            openConversation(existing.conversationId, otherUserId, otherUsername);
            return;
        }

        // Create new temporary conversation
        activeConversation = null;
        activeOtherUser = { id: otherUserId, username: otherUsername };

        // Show chat view
        document.getElementById('chatEmpty').style.display = 'none';
        const chatView = document.getElementById('chatView');
        chatView.style.display = 'flex';

        // Update header
        const chatAvatar = document.getElementById('chatAvatar');
        setAvatarEl(chatAvatar, otherUsername);
        document.getElementById('chatName').textContent = otherUsername;

        document.getElementById('messagesContainer').innerHTML = '';

        setMobilePanels(true);

        document.getElementById('chatInput').focus();
    }

    // ============================================================
    // MODAL DIALOGS - NEW GROUP
    // ============================================================

    let selectedGroupMembers = [];  // Members selected for new group

    /**
     * Open "New Group" modal dialog
     * Purpose: Create group with name and members
     */
    function openNewGroupModal() {
        selectedGroupMembers = [];
        document.getElementById('newGroupModal').classList.add('active');
        document.getElementById('groupNameInput').value = '';
        document.getElementById('groupSearchInput').value = '';
        document.getElementById('selectedMembers').innerHTML = '';
        document.getElementById('groupUserList').innerHTML = '<div class="search-empty">Type a name to search</div>';
        updateCreateGroupButton();
        setTimeout(() => document.getElementById('groupNameInput').focus(), 100);
    }

    /**
     * Close "New Group" modal
     */
    function closeNewGroupModal() {
        document.getElementById('newGroupModal').classList.remove('active');
        selectedGroupMembers = [];
    }

    /**
     * Update "Create Group" button enabled/disabled state
     * Purpose: Enable only when group has name and members
     */
    function updateCreateGroupButton() {
        const nameInput = document.getElementById('groupNameInput');
        const btn = document.getElementById('btnCreateGroup');
        const hasName = nameInput && nameInput.value.trim().length > 0;
        const hasMembers = selectedGroupMembers.length > 0;
        btn.disabled = !(hasName && hasMembers);
    }

    /**
     * Render selected members in group creation modal
     * Purpose: Show chips for selected members
     */
    function renderSelectedMembers() {
        const container = document.getElementById('selectedMembers');
        let html = '';
        selectedGroupMembers.forEach(member => {
            html += `
                <div class="selected-member">
                    ${escapeHtml(member.username)}
                    <span class="remove-member" onclick="App.removeGroupMember('${member.id}')">&times;</span>
                </div>
            `;
        });
        container.innerHTML = html;
        updateCreateGroupButton();
    }

    /**
     * Add member to group being created
     * @param {string} userId - User ID
     * @param {string} username - Username
     * Purpose: Add user to selected members list
     */
    function addGroupMember(userId, username) {
        if (!selectedGroupMembers.find(m => m.id === userId)) {
            selectedGroupMembers.push({ id: userId, username: username });
            renderSelectedMembers();
        }
    }

    /**
     * Remove member from group being created
     * @param {string} userId - User ID
     * Purpose: Remove user from selected members list
     */
    function removeGroupMember(userId) {
        selectedGroupMembers = selectedGroupMembers.filter(m => m.id !== userId);
        renderSelectedMembers();
    }

    /**
     * Search users for group creation
     * @param {string} query - Search query
     * @async
     * Purpose: Find users to add to group
     */
    async function searchUsersForGroup(query) {
        const listEl = document.getElementById('groupUserList');

        if (!query) {
            listEl.innerHTML = '<div class="search-empty">Type a name to search</div>';
            return;
        }

        listEl.innerHTML = '<div class="loading-spinner"></div>';

        try {
            const users = await API.searchUsers(query);

            if (!users || users.length === 0) {
                listEl.innerHTML = '<div class="search-empty">No users found</div>';
                return;
            }

            let html = '';
            users.forEach(user => {
                const isSelected = selectedGroupMembers.find(m => m.id === user.id);
                const selectedClass = isSelected ? ' selected' : '';
                html += `
                    <div class="modal-user-item${selectedClass}" onclick="App.addGroupMember('${user.id}', '${escapeHtml(user.username)}')">
                        <div class="modal-user-avatar" style="background:${getAvatarColor(user.username)}">
                            ${getInitial(user.username)}
                        </div>
                        <div class="modal-user-name">${escapeHtml(user.username)}</div>
                        ${isSelected ? '<span class="checkmark">✓</span>' : ''}
                    </div>
                `;
            });

            listEl.innerHTML = html;
        } catch (err) {
            listEl.innerHTML = '<div class="search-empty">Search failed</div>';
        }
    }

    /**
     * Create new group after form submission
     * Purpose: Call createGroup with form data
     */
    async function handleCreateGroup() {
        const nameInput = document.getElementById('groupNameInput');
        const name = nameInput.value.trim();

        if (!name || selectedGroupMembers.length === 0) return;

        try {
            const memberIds = selectedGroupMembers.map(m => m.id);
            await createGroup(name, memberIds);
            closeNewGroupModal();
            switchTab('groups');
        } catch (err) {
            alert('Failed to create group: ' + err.message);
        }
    }

    // ============================================================
    // SEARCH & FILTERING
    // ============================================================

    /**
     * Filter conversations by search query
     * @param {string} query - Search query (lowercase)
     * Purpose: Real-time search in conversation list
     */
    function filterConversations(query) {
        const items = document.querySelectorAll('.conversation-item');
        items.forEach(item => {
            const name = (item.dataset.username || '').toLowerCase();
            item.style.display = name.includes(query) ? '' : 'none';
        });
    }

    // ============================================================
    // EVENT HANDLERS SETUP
    // ============================================================

    /**
     * Setup all UI event listeners
     * Purpose: Bind click, input, and keyboard events
     */
    function setupEventHandlers() {
        // Send message
        document.getElementById('btnSend').addEventListener('click', sendMessage);

        // Message input
        const chatInput = document.getElementById('chatInput');
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        chatInput.addEventListener('input', () => {
            // Auto-expand textarea
            chatInput.style.height = 'auto';
            chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
            updateSendButton();
        });

        // Logout
        document.getElementById('btnLogout').addEventListener('click', () => {
            WS.disconnect();
            localStorage.clear();
            window.location.href = '/index.html';
        });

        // New chat modal
        document.getElementById('btnNewChat').addEventListener('click', openNewChatModal);
        document.getElementById('modalClose').addEventListener('click', closeNewChatModal);
        document.getElementById('newChatModal').addEventListener('click', (e) => {
            if (e.target.id === 'newChatModal') closeNewChatModal();
        });

        // New group modal
        document.getElementById('btnNewGroup').addEventListener('click', openNewGroupModal);
        document.getElementById('groupModalClose').addEventListener('click', closeNewGroupModal);
        document.getElementById('newGroupModal').addEventListener('click', (e) => {
            if (e.target.id === 'newGroupModal') closeNewGroupModal();
        });

        // Group creation form
        document.getElementById('groupNameInput').addEventListener('input', updateCreateGroupButton);
        document.getElementById('groupSearchInput').addEventListener('input', (e) => {
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(() => searchUsersForGroup(e.target.value.trim()), 300);
        });
        document.getElementById('btnCreateGroup').addEventListener('click', handleCreateGroup);

        // New chat search
        document.getElementById('modalSearchInput').addEventListener('input', (e) => {
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(() => searchUsersModal(e.target.value.trim()), 300);
        });

        // Sidebar search
        document.getElementById('searchInput').addEventListener('input', (e) => {
            const query = e.target.value.trim().toLowerCase();
            filterConversations(query);
        });

        // Back button
        document.getElementById('btnBack').addEventListener('click', closeConversation);
    }

    // ============================================================
    // PUBLIC API
    // ============================================================

    return {
        init,
        openConversation,
        startConversation,
        loadOlder,
        openGroup,
        createGroup,
        switchTab,
        loadGroups,
        addGroupMember,
        removeGroupMember
    };
})();

// ============================================================
// DOCUMENT READY
// ============================================================

/**
 * Initialize app when DOM is ready
 */
document.addEventListener('DOMContentLoaded', App.init);
