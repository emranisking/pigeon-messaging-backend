/* ============================================================
   Messenger App — Main application logic
   ============================================================ */

const App = (() => {
    // ---- State ----
    let currentUser = null;          // { id, username }
    let conversations = [];          // [{ conversationId, otherUser, lastMessage, ... }]
    let groups = [];                 // [{ id, name, members, lastMessage, ... }]
    let activeConversation = null;   // conversationId
    let activeGroup = null;          // groupId
    let activeOtherUser = null;      // { id, username }
    let messages = {};               // { conversationId: [msg, ...] }
    let groupMessages = {};          // { groupId: [msg, ...] }
    let nextCursor = {};             // { conversationId: cursor }
    let hasMore = {};                // { conversationId: bool }
    let userCache = {};              // { id: { id, username } }
    let deliveredMessages = new Set(); // track which messages we sent "delivered" for
    let seenMessages = new Set();      // track which messages we sent "seen" for
    let searchDebounce = null;
    let currentTab = 'chats';        // 'chats' or 'groups'

    // ---- Avatar Colors ----
    const AVATAR_COLORS = [
        '#1877f2', '#42b72a', '#f02849', '#a033ff',
        '#f5533d', '#00a884', '#0095f6', '#ff6900'
    ];

    function getAvatarColor(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
    }

    function getInitial(username) {
        return (username || '?').charAt(0).toUpperCase();
    }

    function setAvatarEl(el, username) {
        el.textContent = getInitial(username);
        el.style.background = getAvatarColor(username);
    }

    // ---- Time Formatting ----
    /**
     * Normalize any timestamp (ISO string, epoch seconds, epoch millis) to a Date.
     */
    function parseTimestamp(value) {
        if (!value) return new Date();
        if (value instanceof Date) return value;
        if (typeof value === 'string') return new Date(value);
        // Numeric: if < 1e12 treat as epoch seconds, otherwise millis
        if (typeof value === 'number') {
            return value < 1e12 ? new Date(value * 1000) : new Date(value);
        }
        return new Date();
    }

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

    function formatFullTime(isoString) {
        const d = parseTimestamp(isoString);
        return d.toLocaleString([], {
            month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    function formatDateSeparator(isoString) {
        const d = parseTimestamp(isoString);
        const now = new Date();
        const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }

    // ---- Initialization ----
    async function init() {
        // Check auth
        const token = localStorage.getItem('token');
        const userId = localStorage.getItem('userId');
        const username = localStorage.getItem('username');

        if (!token || !userId) {
            window.location.href = '/index.html';
            return;
        }

        currentUser = { id: userId, username: username || 'User' };
        userCache[userId] = currentUser;

        // Set user info in sidebar
        setupUI();

        // Load conversations
        await loadConversations();

        // Load groups
        await loadGroups();

        // Connect WebSocket
        setupWebSocket(token, userId);

        // Setup event handlers
        setupEventHandlers();
    }

    function setupUI() {
        const userAvatar = document.getElementById('userAvatar');
        const userName = document.getElementById('userName');
        setAvatarEl(userAvatar, currentUser.username);
        userName.textContent = currentUser.username;
    }

    // ---- Conversations ----
    async function loadConversations() {
        const loadingEl = document.getElementById('convLoading');
        try {
            const data = await API.getConversations();
            conversations = data || [];

            // Cache users
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

    function renderConversationList() {
        const listEl = document.getElementById('conversationList');
        const loadingEl = document.getElementById('convLoading');

        // Sort by last message time, most recent first
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

        // Preserve loading spinner reference
        listEl.innerHTML = html;
    }

    function truncate(str, len) {
        if (!str) return '';
        return str.length > len ? str.substring(0, len) + '...' : str;
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ---- Open Conversation ----
    async function openConversation(conversationId, otherUserId, otherUsername) {
        // Clear group state when opening DM
        activeGroup = null;
        
        activeConversation = conversationId;
        activeOtherUser = { id: otherUserId, username: otherUsername };
        userCache[otherUserId] = activeOtherUser;

        // Update UI
        document.getElementById('chatEmpty').style.display = 'none';
        const chatView = document.getElementById('chatView');
        chatView.style.display = 'flex';

        // Set chat header
        const chatAvatar = document.getElementById('chatAvatar');
        setAvatarEl(chatAvatar, otherUsername);
        document.getElementById('chatName').textContent = otherUsername;
        document.getElementById('chatStatus').textContent = 'Active now';

        // Mobile: hide sidebar, show chat
        if (window.innerWidth <= 768) {
            document.getElementById('sidebar').classList.add('hidden');
            document.getElementById('chatPanel').classList.remove('hidden');
        }

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

        // Send seen for unread messages from the other user
        markMessagesAsSeen(conversationId);

        // Focus input
        document.getElementById('chatInput').focus();
    }

    async function loadMessages(conversationId, prepend = false) {
        const container = document.getElementById('messagesContainer');
        if (!prepend) {
            container.innerHTML = '<div class="loading-spinner"></div>';
        }

        try {
            const cursor = prepend ? nextCursor[conversationId] : null;
            const data = await API.getMessages(conversationId, cursor, 50);

            if (data && data.messages) {
                // Messages come newest first from the API, reverse for display
                const newMsgs = data.messages.reverse();

                if (prepend) {
                    messages[conversationId] = [...newMsgs, ...(messages[conversationId] || [])];
                } else {
                    messages[conversationId] = newMsgs;
                }

                nextCursor[conversationId] = data.nextCursor || null;
                hasMore[conversationId] = data.hasMore || false;
            }

            renderMessages(prepend);

            if (!prepend) {
                scrollToBottom();
            }
        } catch (err) {
            console.error('Failed to load messages:', err);
            if (!prepend) {
                container.innerHTML = '';
            }
        }
    }

    // ---- Render Messages ----
    function renderMessages(preserveScroll = false) {
        const container = document.getElementById('messagesContainer');
        const convId = activeConversation || '_pending_conv';
        const msgs = messages[convId] || [];

        if (!activeConversation && !messages['_pending_conv']) return;

        const scrolledToBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
        const oldScrollHeight = container.scrollHeight;

        let html = '';

        // Load more button
        if (hasMore[convId]) {
            html += '<div class="load-more-wrap"><button class="btn-load-more" onclick="App.loadOlder()">Load older messages</button></div>';
        }

        // Group messages by sender + time proximity
        let lastSenderId = null;
        let lastDate = null;

        for (let i = 0; i < msgs.length; i++) {
            const msg = msgs[i];
            const isSent = msg.senderId === currentUser.id;
            const msgDate = parseTimestamp(msg.createdAt);
            const dateKey = msgDate.toDateString();

            // Date separator
            if (dateKey !== lastDate) {
                html += `<div class="date-separator">${formatDateSeparator(msg.createdAt)}</div>`;
                lastDate = dateKey;
                lastSenderId = null;
            }

            // Determine bubble position in group
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

            // Show avatar only for last message in received group
            let avatarHtml = '';
            if (!isSent) {
                if (isLastInGroup) {
                    avatarHtml = `<div class="message-avatar-small" style="background:${getAvatarColor(otherUser.username)}">${getInitial(otherUser.username)}</div>`;
                } else {
                    avatarHtml = '<div class="message-avatar-spacer"></div>';
                }
            }

            // Status indicator (only for last sent message or specifically relevant)
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
                    ${isSent ? '' : ''}
                </div>
            `;

            lastSenderId = msg.senderId;
        }

        container.innerHTML = html;

        if (preserveScroll) {
            // Keep scroll position when prepending
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - oldScrollHeight;
        } else if (scrolledToBottom || !preserveScroll) {
            scrollToBottom();
        }
    }

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

    function scrollToBottom() {
        const container = document.getElementById('messagesContainer');
        requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
        });
    }

    // ---- Send Message ----
    function sendMessage() {
        // Check if we're in a group chat
        if (activeGroup) {
            sendGroupMessage();
            return;
        }

        const input = document.getElementById('chatInput');
        const content = input.value.trim();

        if (!content || !activeOtherUser) return;

        const success = WS.sendMessage(activeOtherUser.id, content, activeConversation);
        if (success) {
            // Optimistic UI: show the message immediately without waiting for server echo
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

            const convId = activeConversation || '_pending_conv';
            if (!messages[convId]) {
                messages[convId] = [];
            }
            messages[convId].push(tempMsg);

            // Render immediately so sender sees their message
            if (activeConversation || convId === '_pending_conv') {
                renderMessages();
                scrollToBottom();
            }

            input.value = '';
            input.style.height = 'auto';
            updateSendButton();
        }
    }

    // ---- Message Status ----
    function markMessagesAsSeen(conversationId) {
        const msgs = messages[conversationId] || [];
        msgs.forEach(msg => {
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

    function markMessageDelivered(msg) {
        const key = msg.messageId;
        if (!deliveredMessages.has(key)) {
            deliveredMessages.add(key);
            WS.sendDelivered(msg.messageId, msg.conversationId, msg.senderId, msg.createdAt);
        }
    }

    // ---- WebSocket Handlers ----
    function setupWebSocket(token, userId) {
        WS.on('connection', handleConnectionChange);
        WS.on('message', handleIncomingMessage);
        WS.on('status', handleStatusUpdate);
        WS.on('groupMessage', handleGroupMessage);
        WS.connect(token, userId);
    }

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

    function handleIncomingMessage(msg) {
        const convId = msg.conversationId;
        const isSent = msg.senderId === currentUser.id;

        // Initialize message list for this conversation if needed
        if (!messages[convId]) {
            messages[convId] = [];
        }

        // Deduplicate by messageId
        const exists = messages[convId].some(m => m.messageId === msg.messageId);
        if (!exists) {
            // If this is a server echo of our own sent message, replace the pending/optimistic version
            if (isSent) {
                const pendingIdx = messages[convId].findIndex(
                    m => m._pending && m.senderId === msg.senderId && m.content === msg.content
                );
                if (pendingIdx !== -1) {
                    messages[convId].splice(pendingIdx, 1);
                }
                // Also check _pending_conv for new conversations
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
            messages[convId].push(msg);
        }

        // Update or create conversation in sidebar
        updateConversationInList(msg);

        // Handle new conversation: if activeConversation is null but we have a matching activeOtherUser
        if (!activeConversation && activeOtherUser) {
            const otherUserId = isSent ? msg.receiverId : msg.senderId;
            if (otherUserId === activeOtherUser.id) {
                activeConversation = convId;
                nextCursor[convId] = null;
                hasMore[convId] = false;
            }
        }

        // If this is the active conversation, render messages
        if (activeConversation === convId) {
            renderMessages();
            scrollToBottom();

            // Mark as delivered + seen since user is viewing this conversation
            if (!isSent) {
                markMessageDelivered(msg);
                // Small delay before marking as seen
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
            // Not viewing this conversation — mark as delivered only
            markMessageDelivered(msg);
            // Show notification effect on conversation item
            playNotificationEffect();
        }
    }

    function handleStatusUpdate(event) {
        const convId = event.conversationId;
        const msgList = messages[convId];

        if (msgList) {
            // Update the status of the matching message
            msgList.forEach(msg => {
                if (msg.messageId === event.messageId) {
                    msg.status = event.status;
                }
            });

            // If we receive a "seen" for a conversation, mark all sent messages as seen
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

        // Update sidebar preview status
        updateConversationStatus(convId, event.status);
    }

    function updateConversationInList(msg) {
        const convId = msg.conversationId;
        const otherUserId = msg.senderId === currentUser.id ? msg.receiverId : msg.senderId;

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
            // New conversation
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

            // Fetch user info if not cached
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

    // ---- Groups ----
    async function loadGroups() {
        try {
            const data = await API.getGroups();
            groups = data || [];
            renderGroupList();
        } catch (err) {
            console.error('Failed to load groups:', err);
        }
    }

    function renderGroupList() {
        const listEl = document.getElementById('groupList');
        if (!listEl) return;

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
            html = '<div class="empty-list">No groups yet</div>';
        }

        listEl.innerHTML = html;
    }

    async function openGroup(groupId) {
        // Clear DM state
        activeConversation = null;
        activeOtherUser = null;
        activeGroup = groupId;

        const group = groups.find(g => g.id === groupId);
        if (!group) return;

        // Update UI
        document.getElementById('chatEmpty').style.display = 'none';
        const chatView = document.getElementById('chatView');
        chatView.style.display = 'flex';

        // Set chat header for group
        const chatAvatar = document.getElementById('chatAvatar');
        setAvatarEl(chatAvatar, group.name);
        document.getElementById('chatName').textContent = group.name;
        const memberCount = group.members ? group.members.length : 0;
        document.getElementById('chatStatus').textContent = `${memberCount} members`;

        // Mobile: hide sidebar
        if (window.innerWidth <= 768) {
            document.getElementById('sidebar').classList.add('hidden');
            document.getElementById('chatPanel').classList.remove('hidden');
        }

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

        // Subscribe to group topic
        WS.subscribeToGroup(groupId);

        document.getElementById('chatInput').focus();
    }

    async function loadGroupMessages(groupId, page = 0) {
        const container = document.getElementById('messagesContainer');
        if (page === 0) {
            container.innerHTML = '<div class="loading-spinner"></div>';
        }

        try {
            const data = await API.getGroupMessages(groupId, page, 50);
            if (data) {
                // Messages come newest first, reverse for display
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

            // Date separator
            if (dateKey !== lastDate) {
                html += `<div class="date-separator">${formatDateSeparator(msg.createdAt)}</div>`;
                lastDate = dateKey;
                lastSenderId = null;
            }

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

            // Show sender name for received messages at start of group
            let senderHtml = '';
            if (!isSent && isNewGroup) {
                senderHtml = `<div class="group-sender-name" style="color:${getAvatarColor(senderName)}">${escapeHtml(senderName)}</div>`;
            }

            // Avatar for group messages
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

    function handleGroupMessage(msg) {
        const groupId = msg.groupId;

        if (!groupMessages[groupId]) {
            groupMessages[groupId] = [];
        }

//        // Deduplicate
//        const exists = groupMessages[groupId].some(m => m.messageId === msg.messageId);
//        if (!exists) {
//            groupMessages[groupId].push(msg);
//        }

        // Update group in list
        const group = groups.find(g => g.id === groupId);
        if (group) {
            group.lastMessage = msg;
            renderGroupList();
        }

        // If this is the active group, render
        if (activeGroup === groupId) {
            renderGroupMessages();
        } else {
            playNotificationEffect();
        }
    }

    function sendGroupMessage() {
        const input = document.getElementById('chatInput');
        const content = input.value.trim();

        if (!content || !activeGroup) return;

        const success = WS.sendGroupMessage(activeGroup, content);
        if (success) {
            // Optimistic UI
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

            input.value = '';
            input.style.height = 'auto';
            updateSendButton();
        }
    }

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

    function updateConversationStatus(convId, status) {
        const conv = conversations.find(c => c.conversationId === convId);
        if (conv && conv.lastMessage) {
            conv.lastMessage.status = status;
            renderConversationList();
        }
    }

    function playNotificationEffect() {
        // Simple title flash
        const originalTitle = document.title;
        document.title = '💬 New Message!';
        setTimeout(() => { document.title = originalTitle; }, 3000);
    }

    // ---- Event Handlers ----
    function setupEventHandlers() {
        // Send button
        document.getElementById('btnSend').addEventListener('click', sendMessage);

        // Chat input
        const chatInput = document.getElementById('chatInput');
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        chatInput.addEventListener('input', () => {
            // Auto-resize
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
        document.getElementById('groupNameInput').addEventListener('input', updateCreateGroupButton);
        document.getElementById('groupSearchInput').addEventListener('input', (e) => {
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(() => searchUsersForGroup(e.target.value.trim()), 300);
        });
        document.getElementById('btnCreateGroup').addEventListener('click', handleCreateGroup);

        // Modal search
        document.getElementById('modalSearchInput').addEventListener('input', (e) => {
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(() => searchUsersModal(e.target.value.trim()), 300);
        });

        // Sidebar search
        document.getElementById('searchInput').addEventListener('input', (e) => {
            const query = e.target.value.trim().toLowerCase();
            filterConversations(query);
        });

        // Back button (mobile)
        document.getElementById('btnBack').addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('hidden');
            document.getElementById('chatPanel').classList.add('hidden');
        });

        // Load older messages
        document.getElementById('messagesContainer').addEventListener('scroll', (e) => {
            // Could implement infinite scroll here if desired
        });
    }

    function updateSendButton() {
        const input = document.getElementById('chatInput');
        const btn = document.getElementById('btnSend');
        btn.disabled = !input.value.trim();
    }

    // ---- Search / Filter ----
    function filterConversations(query) {
        const items = document.querySelectorAll('.conversation-item');
        items.forEach(item => {
            const name = (item.dataset.username || '').toLowerCase();
            item.style.display = name.includes(query) ? '' : 'none';
        });
    }

    // ---- New Chat Modal ----
    function openNewChatModal() {
        document.getElementById('newChatModal').classList.add('active');
        document.getElementById('modalSearchInput').value = '';
        document.getElementById('modalUserList').innerHTML = '<div class="search-empty">Type a name to search</div>';
        setTimeout(() => document.getElementById('modalSearchInput').focus(), 100);
    }

    function closeNewChatModal() {
        document.getElementById('newChatModal').classList.remove('active');
    }

    // ---- New Group Modal ----
    let selectedGroupMembers = [];

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

    function closeNewGroupModal() {
        document.getElementById('newGroupModal').classList.remove('active');
        selectedGroupMembers = [];
    }

    function updateCreateGroupButton() {
        const nameInput = document.getElementById('groupNameInput');
        const btn = document.getElementById('btnCreateGroup');
        const hasName = nameInput && nameInput.value.trim().length > 0;
        const hasMembers = selectedGroupMembers.length > 0;
        btn.disabled = !(hasName && hasMembers);
    }

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

    function addGroupMember(userId, username) {
        if (!selectedGroupMembers.find(m => m.id === userId)) {
            selectedGroupMembers.push({ id: userId, username: username });
            renderSelectedMembers();
        }
    }

    function removeGroupMember(userId) {
        selectedGroupMembers = selectedGroupMembers.filter(m => m.id !== userId);
        renderSelectedMembers();
    }

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

    async function startConversation(otherUserId, otherUsername) {
        closeNewChatModal();
        userCache[otherUserId] = { id: otherUserId, username: otherUsername };

        // Check if conversation already exists
        const existing = conversations.find(c => c.otherUser && c.otherUser.id === otherUserId);
        if (existing) {
            openConversation(existing.conversationId, otherUserId, otherUsername);
            return;
        }

        // No existing conversation — we'll create one when the first message is sent
        // For now, set up the chat view with a temporary state
        activeConversation = null;
        activeOtherUser = { id: otherUserId, username: otherUsername };

        document.getElementById('chatEmpty').style.display = 'none';
        const chatView = document.getElementById('chatView');
        chatView.style.display = 'flex';

        const chatAvatar = document.getElementById('chatAvatar');
        setAvatarEl(chatAvatar, otherUsername);
        document.getElementById('chatName').textContent = otherUsername;

        // Clear messages area
        document.getElementById('messagesContainer').innerHTML = '';

        if (window.innerWidth <= 768) {
            document.getElementById('sidebar').classList.add('hidden');
            document.getElementById('chatPanel').classList.remove('hidden');
        }

        // Override send to handle new conversation
        document.getElementById('chatInput').focus();
    }

    function loadOlder() {
        if (activeConversation && hasMore[activeConversation]) {
            loadMessages(activeConversation, true);
        }
    }

    // ---- Public Interface ----
    return {
        init,
        openConversation,
        startConversation,
        loadOlder,
        // Group functions
        openGroup,
        createGroup,
        switchTab,
        loadGroups,
        addGroupMember,
        removeGroupMember
    };
})();

// Initialize on page load
document.addEventListener('DOMContentLoaded', App.init);
