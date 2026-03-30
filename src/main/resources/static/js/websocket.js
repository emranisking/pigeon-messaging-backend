/* ============================================================
   WebSocket Service — STOMP over SockJS
   ============================================================ */

const WS = (() => {
    let stompClient = null;
    let connected = false;
    let reconnectTimer = null;
    let subscriptions = {};

    // Callbacks
    let onMessageReceived = null;
    let onStatusUpdate = null;
    let onConnectionChange = null;
    let onGroupMessageReceived = null;

    /**
     * Connect to WebSocket with JWT auth.
     */
    function connect(token, userId) {
        if (stompClient && connected) {
            return;
        }

        clearTimeout(reconnectTimer);

        const socket = new SockJS('/ws-chat');
        stompClient = Stomp.over(socket);

        // Enable debug logging for troubleshooting
        stompClient.debug = (str) => {
            if (str.startsWith('>>>') || str.startsWith('<<<') ||
                str.includes('CONNECT') || str.includes('ERROR') ||
                str.includes('SUBSCRIBE') || str.includes('CONNECTED') ||
                str.includes('MESSAGE')) {
                console.log('[STOMP]', str);
            }
        };

        const headers = {
            'Authorization': `Bearer ${token}`
        };

        if (onConnectionChange) onConnectionChange('connecting');

        stompClient.connect(headers, () => {
            connected = true;
            console.log('WebSocket connected');
            if (onConnectionChange) onConnectionChange('connected');

            // Subscribe to incoming messages (use /user/queue/... for proper Spring user destination resolution)
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

            // Subscribe to status updates
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

            // Subscribe to group messages
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
            connected = false;
            console.error('WebSocket error:', error);
            if (onConnectionChange) onConnectionChange('disconnected');
            scheduleReconnect(token, userId);
        });

        socket.onclose = () => {
            connected = false;
            if (onConnectionChange) onConnectionChange('disconnected');
            scheduleReconnect(token, userId);
        };
    }

    function scheduleReconnect(token, userId) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
            console.log('Attempting WebSocket reconnect...');
            connect(token, userId);
        }, 3000);
    }

    /**
     * Send a chat message.
     */
    function sendMessage(receiverId, content, conversationId) {
        if (!stompClient || !connected) {
            console.error('Not connected');
            return false;
        }

        const payload = {
            receiverId: receiverId,
            content: content
        };
        if (conversationId) {
            payload.conversationId = conversationId;
        }

        stompClient.send('/app/chat.send', {}, JSON.stringify(payload));
        return true;
    }

    /**
     * Send a group message.
     */
    function sendGroupMessage(groupId, content) {
        if (!stompClient || !connected) {
            console.error('Not connected');
            return false;
        }

        const payload = {
            groupId: groupId,
            content: content
        };

        stompClient.send('/app/group.send', {}, JSON.stringify(payload));
        return true;
    }

    /**
     * Subscribe to a specific group topic.
     */
    function subscribeToGroup(groupId) {
        if (!stompClient || !connected) {
            console.error('Not connected');
            return null;
        }

        const subKey = `group_${groupId}`;
        if (subscriptions[subKey]) {
            return subscriptions[subKey];
        }

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
     * Unsubscribe from a specific group topic.
     */
    function unsubscribeFromGroup(groupId) {
        const subKey = `group_${groupId}`;
        if (subscriptions[subKey]) {
            try {
                subscriptions[subKey].unsubscribe();
            } catch (e) {}
            delete subscriptions[subKey];
        }
    }

    /**
     * Send delivered status for a message.
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
     * Send seen status for a message.
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

    /**
     * Disconnect from WebSocket.
     */
    function disconnect() {
        clearTimeout(reconnectTimer);
        if (stompClient) {
            Object.values(subscriptions).forEach(sub => {
                try { sub.unsubscribe(); } catch (e) {}
            });
            subscriptions = {};
            try {
                stompClient.disconnect();
            } catch (e) {}
            stompClient = null;
            connected = false;
        }
    }

    /**
     * Check if connected.
     */
    function isConnected() {
        return connected;
    }

    /**
     * Set event handlers.
     */
    function on(event, handler) {
        switch (event) {
            case 'message': onMessageReceived = handler; break;
            case 'status': onStatusUpdate = handler; break;
            case 'connection': onConnectionChange = handler; break;
            case 'groupMessage': onGroupMessageReceived = handler; break;
        }
    }

    return {
        connect,
        disconnect,
        sendMessage,
        sendGroupMessage,
        subscribeToGroup,
        unsubscribeFromGroup,
        sendDelivered,
        sendSeen,
        isConnected,
        on
    };
})();
