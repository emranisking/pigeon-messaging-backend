/**
 * ============================================================
 * WEBSOCKET SERVICE MODULE (STOMP over SockJS)
 * ============================================================
 * 
 * Purpose: Real-time bidirectional communication with backend
 * - Establishes STOMP connection to WebSocket server
 * - Handles automatic reconnection on disconnect
 * - Manages message subscriptions (personal & group)
 * - Sends/receives messages in real-time
 * - Handles delivery and read status updates
 * - Event-driven architecture with callbacks
 * 
 * ============================================================
 */

const WS = (() => {
    // ============================================================
    // PRIVATE STATE
    // ============================================================

    let stompClient = null;          // STOMP client instance
    let connected = false;           // Connection status
    let reconnectTimer = null;       // Auto-reconnect timer
    let subscriptions = {};          // Active subscriptions map

    // ============================================================
    // EVENT HANDLERS (Callbacks)
    // ============================================================

    let onMessageReceived = null;      // Callback: new message arrives
    let onStatusUpdate = null;         // Callback: delivery/read status updated
    let onConnectionChange = null;     // Callback: connection status changed
    let onGroupMessageReceived = null;  // Callback: group message arrives

    // ============================================================
    // CONNECTION MANAGEMENT
    // ============================================================

    /**
     * Establish WebSocket connection to server
     * @param {string} token - JWT authentication token
     * @param {string} userId - Current user's ID
     * 
     * Purpose: Create STOMP connection and subscribe to message queues
     * Process:
     * 1. Create SockJS connection
     * 2. Wrap with STOMP protocol
     * 3. Connect with JWT token in headers
     * 4. Subscribe to personal message queues
     * 5. Handle connection errors and schedule reconnect
     */
    function connect(token, userId) {
        // Prevent duplicate connections
        if (stompClient && connected) {
            return;
        }

        // Clear any pending reconnect attempts
        clearTimeout(reconnectTimer);

        // Create SockJS transport layer
        const socket = new SockJS('/ws-chat');

        // Wrap with STOMP protocol
        stompClient = Stomp.over(socket);

        // Configure STOMP debug logging (only important messages)
        stompClient.debug = (str) => {
            if (str.startsWith('>>>') || str.startsWith('<<<') ||
                str.includes('CONNECT') || str.includes('ERROR') ||
                str.includes('SUBSCRIBE') || str.includes('CONNECTED') ||
                str.includes('MESSAGE')) {
                console.log('[STOMP]', str);
            }
        };

        // Prepare authentication headers
        const headers = {
            'Authorization': `Bearer ${token}`
        };

        // Notify listeners: connection attempt started
        if (onConnectionChange) onConnectionChange('connecting');

        // Connect to STOMP server
        stompClient.connect(headers, () => {
            // ========================================================
            // CONNECTION SUCCESSFUL
            // ========================================================

            connected = true;
            console.log('✓ WebSocket connected');
            if (onConnectionChange) onConnectionChange('connected');

            // ========================================================
            // SUBSCRIBE TO PERSONAL MESSAGE QUEUE
            // ========================================================
            // Receive incoming 1-1 messages from other users

            subscriptions.messages = stompClient.subscribe(
                '/user/queue/messages',
                (frame) => {
                    try {
                        const message = JSON.parse(frame.body);
                        console.log('[WS] Message received:', message.messageId);
                        if (onMessageReceived) onMessageReceived(message);
                    } catch (e) {
                        console.error('Error parsing message:', e);
                    }
                }
            );

            // ========================================================
            // SUBSCRIBE TO MESSAGE STATUS QUEUE
            // ========================================================
            // Receive delivery/read receipts for sent messages

            subscriptions.status = stompClient.subscribe(
                '/user/queue/status',
                (frame) => {
                    try {
                        const event = JSON.parse(frame.body);
                        console.log('[WS] Status update:', event.messageId, event.status);
                        if (onStatusUpdate) onStatusUpdate(event);
                    } catch (e) {
                        console.error('Error parsing status:', e);
                    }
                }
            );

            // ========================================================
            // SUBSCRIBE TO GROUP MESSAGE QUEUE
            // ========================================================
            // Receive incoming group messages

            subscriptions.groupMessages = stompClient.subscribe(
                '/user/queue/group-messages',
                (frame) => {
                    try {
                        const message = JSON.parse(frame.body);
                        console.log('[WS] Group message received:', message.messageId);
                        if (onGroupMessageReceived) onGroupMessageReceived(message);
                    } catch (e) {
                        console.error('Error parsing group message:', e);
                    }
                }
            );

        }, (error) => {
            // ========================================================
            // CONNECTION FAILED
            // ========================================================

            connected = false;
            console.error('✗ WebSocket error:', error);
            if (onConnectionChange) onConnectionChange('disconnected');

            // Schedule automatic reconnection attempt
            scheduleReconnect(token, userId);
        });

        // ================================================================
        // HANDLE UNEXPECTED SOCKET CLOSURE (network issues, etc)
        // ================================================================

        socket.onclose = () => {
            connected = false;
            if (onConnectionChange) onConnectionChange('disconnected');
            scheduleReconnect(token, userId);
        };
    }

    /**
     * Schedule automatic reconnection attempt
     * @param {string} token - JWT token for reconnection
     * @param {string} userId - User ID for reconnection
     * 
     * Purpose: Attempt to reconnect after 3 seconds of disconnection
     */
    function scheduleReconnect(token, userId) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
            console.log('⟳ Attempting WebSocket reconnect...');
            connect(token, userId);
        }, 3000);
    }

    // ============================================================
    // MESSAGE SENDING
    // ============================================================

    /**
     * Send 1-1 message to another user
     * @param {string} receiverId - ID of message recipient
     * @param {string} content - Message text
     * @param {string} conversationId - Conversation ID (optional)
     * @returns {boolean} true if sent, false if not connected
     * 
     * Purpose: Publish message to /app/chat.send endpoint
     * Backend will: publish to RabbitMQ → persist to Cassandra → broadcast to receiver
     */
    function sendMessage(receiverId, content, conversationId) {
        if (!stompClient || !connected) {
            console.error('✗ Not connected to WebSocket');
            return false;
        }

        const payload = {
            receiverId: receiverId,
            content: content
        };

        // Include conversation ID if available
        if (conversationId) {
            payload.conversationId = conversationId;
        }

        // Send to backend message handler
        stompClient.send('/app/chat.send', {}, JSON.stringify(payload));
        return true;
    }

    /**
     * Send message to group chat
     * @param {string} groupId - ID of target group
     * @param {string} content - Message text
     * @returns {boolean} true if sent, false if not connected
     * 
     * Purpose: Publish group message to /app/group.send endpoint
     * Backend will: publish to RabbitMQ → persist → broadcast to all group members
     */
    function sendGroupMessage(groupId, content) {
        if (!stompClient || !connected) {
            console.error('✗ Not connected to WebSocket');
            return false;
        }

        const payload = {
            groupId: groupId,
            content: content
        };

        // Send to backend group handler
        stompClient.send('/app/group.send', {}, JSON.stringify(payload));
        return true;
    }

    // ============================================================
    // STATUS UPDATES (Delivery & Read Receipts)
    // ============================================================

    /**
     * Send delivery receipt for received message
     * @param {string} messageId - Message ID
     * @param {string} conversationId - Conversation ID
     * @param {string} senderId - Original sender's ID
     * @param {string} createdAt - Message creation timestamp
     * 
     * Purpose: Notify sender that message was delivered to recipient
     * Status flow: sent → delivered → seen
     */
    function sendDelivered(messageId, conversationId, senderId, createdAt) {
        if (!stompClient || !connected) return;

        stompClient.send('/app/chat.delivered', {}, JSON.stringify({
            messageId: messageId,
            conversationId: conversationId,
            senderId: senderId,
            status: 'delivered',
            createdAt: createdAt
        }));
    }

    /**
     * Send read receipt for viewed message
     * @param {string} messageId - Message ID
     * @param {string} conversationId - Conversation ID
     * @param {string} senderId - Original sender's ID
     * @param {string} createdAt - Message creation timestamp
     * 
     * Purpose: Notify sender that message was read by recipient
     * Shows 'seen' indicator with user avatar
     */
    function sendSeen(messageId, conversationId, senderId, createdAt) {
        if (!stompClient || !connected) return;

        stompClient.send('/app/chat.seen', {}, JSON.stringify({
            messageId: messageId,
            conversationId: conversationId,
            senderId: senderId,
            status: 'seen',
            createdAt: createdAt
        }));
    }

    // ============================================================
    // GROUP SUBSCRIPTIONS
    // ============================================================

    /**
     * Subscribe to group topic for real-time messages
     * @param {string} groupId - Group ID
     * @returns {object} STOMP subscription object or null
     * 
     * Purpose: Listen for messages posted to a group topic
     * Prevents duplicate subscriptions for same group
     */
    function subscribeToGroup(groupId) {
        if (!stompClient || !connected) {
            console.error('✗ Not connected to WebSocket');
            return null;
        }

        // Use unique key for subscription tracking
        const subKey = `group_${groupId}`;

        // Prevent duplicate subscriptions
        if (subscriptions[subKey]) {
            return subscriptions[subKey];
        }

        // Subscribe to group's public topic
        subscriptions[subKey] = stompClient.subscribe(
            `/topic/group/${groupId}`,
            (frame) => {
                try {
                    const message = JSON.parse(frame.body);
                    console.log('[WS] Group topic message:', message.messageId);
                    if (onGroupMessageReceived) onGroupMessageReceived(message);
                } catch (e) {
                    console.error('Error parsing group message:', e);
                }
            }
        );

        return subscriptions[subKey];
    }

    /**
     * Unsubscribe from group topic
     * @param {string} groupId - Group ID
     * 
     * Purpose: Stop listening to group messages when leaving group
     * Cleans up subscription resources
     */
    function unsubscribeFromGroup(groupId) {
        const subKey = `group_${groupId}`;

        if (subscriptions[subKey]) {
            try {
                subscriptions[subKey].unsubscribe();
            } catch (e) {
                // Ignore errors on unsubscribe
            }

            delete subscriptions[subKey];
        }
    }

    // ============================================================
    // CONNECTION LIFECYCLE
    // ============================================================

    /**
     * Disconnect from WebSocket server
     * Purpose: Clean shutdown - unsubscribe all and close connection
     * Called when: user logs out, app closes, or on error recovery
     */
    function disconnect() {
        clearTimeout(reconnectTimer);

        if (stompClient) {
            // Unsubscribe from all active subscriptions
            Object.values(subscriptions).forEach(sub => {
                try {
                    sub.unsubscribe();
                } catch (e) {
                    // Ignore errors
                }
            });

            subscriptions = {};

            // Close STOMP connection
            try {
                stompClient.disconnect();
            } catch (e) {
                // Ignore errors
            }

            stompClient = null;
            connected = false;
        }
    }

    /**
     * Check if WebSocket is currently connected
     * @returns {boolean} true if connected, false otherwise
     * Purpose: Determine if ready to send messages
     */
    function isConnected() {
        return connected;
    }

    // ============================================================
    // EVENT LISTENER REGISTRATION
    // ============================================================

    /**
     * Register callback for specific events
     * @param {string} event - Event name (message, status, connection, groupMessage)
     * @param {function} handler - Callback function
     * 
     * Purpose: Allow other modules to listen to WebSocket events
     * Example: App.js uses this to handle incoming messages
     */
    function on(event, handler) {
        switch (event) {
            case 'message':
                onMessageReceived = handler;
                break;
            case 'status':
                onStatusUpdate = handler;
                break;
            case 'connection':
                onConnectionChange = handler;
                break;
            case 'groupMessage':
                onGroupMessageReceived = handler;
                break;
        }
    }

    // ============================================================
    // PUBLIC API INTERFACE
    // ============================================================

    return {
        // Connection lifecycle
        connect,
        disconnect,
        isConnected,

        // Messaging
        sendMessage,
        sendGroupMessage,

        // Status updates
        sendDelivered,
        sendSeen,

        // Group management
        subscribeToGroup,
        unsubscribeFromGroup,

        // Event listeners
        on
    };
})();