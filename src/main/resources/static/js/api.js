/**
 * ============================================================
 * API SERVICE MODULE
 * ============================================================
 * 
 * Purpose: Centralized REST API communication layer
 * - Handles all HTTP requests to backend
 * - Manages JWT token in Authorization header
 * - Handles authentication errors and redirects
 * - Provides clean API methods for all operations
 * - Error handling with user-friendly messages
 * 
 * ============================================================
 */

const API = (() => {
    const BASE_URL = window.location.origin;

    // ============================================================
    // PRIVATE UTILITY FUNCTIONS
    // ============================================================

    /**
     * Get JWT token from localStorage
     * @returns {string|null} JWT token or null if not found
     * Purpose: Retrieve stored authentication token
     */
    function getToken() {
        return localStorage.getItem('token');
    }

    /**
     * Build HTTP headers with JWT authorization
     * @returns {object} Headers object with Content-Type and Authorization
     * Purpose: Ensure all API requests include valid auth token
     */
    function authHeaders() {
        const token = getToken();
        return {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        };
    }

    /**
     * Make HTTP request to backend API
     * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
     * @param {string} path - API endpoint path
     * @param {object|null} body - Request body (optional)
     * @returns {Promise<object>} Parsed JSON response
     * @throws {Error} If request fails or response is invalid
     * 
     * Purpose: Central request handler with error handling
     * - Sends requests with JWT token
     * - Handles authentication errors (401/403)
     * - Redirects to login on auth failure
     * - Parses error messages from response
     */
    async function request(method, path, body = null) {
        const opts = {
            method,
            headers: authHeaders()
        };

        // Include request body if provided
        if (body) {
            opts.body = JSON.stringify(body);
        }

        // Make HTTP request
        const res = await fetch(`${BASE_URL}${path}`, opts);

        // Handle authentication failures
        if (res.status === 401 || res.status === 403) {
            localStorage.clear();
            window.location.href = '/index.html';
            throw new Error('Unauthorized - please login again');
        }

        // Handle other HTTP errors
        if (!res.ok) {
            const text = await res.text();
            let message;

            // Try to parse error from JSON response
            try {
                const json = JSON.parse(text);
                message = json.message || json.error || text;
            } catch {
                // Fallback to plain text or status code
                message = text || `HTTP ${res.status}`;
            }

            throw new Error(message);
        }

        // Parse response as JSON if available
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return res.json();
        }

        return null;
    }

    // ============================================================
    // AUTHENTICATION ENDPOINTS
    // ============================================================

    /**
     * User login
     * @param {string} username - Username
     * @param {string} password - Password
     * @returns {Promise<object>} { token, userId, username }
     * Purpose: Authenticate user and receive JWT token
     */
    async function login(username, password) {
        return request('POST', '/api/auth/login', { username, password });
    }

    /**
     * User registration
     * @param {string} username - Username
     * @param {string} password - Password
     * @returns {Promise<object>} { token, userId, username }
     * Purpose: Create new user account and receive JWT token
     */
    async function register(username, password) {
        return request('POST', '/api/auth/register', { username, password });
    }

    // ============================================================
    // USER ENDPOINTS
    // ============================================================

    /**
     * Get current logged-in user info
     * @returns {Promise<object>} Current user object
     * Purpose: Fetch authenticated user's profile data
     */
    async function getMe() {
        return request('GET', '/api/users/me');
    }

    /**
     * Search users by username
     * @param {string} query - Search query
     * @returns {Promise<array>} Array of matching user objects
     * Purpose: Find users to start new conversations with
     */
    async function searchUsers(query) {
        return request('GET', `/api/users/search?query=${encodeURIComponent(query)}`);
    }

    /**
     * Get specific user by ID
     * @param {string} userId - User ID
     * @returns {Promise<object>} User object
     * Purpose: Fetch user information for display
     */
    async function getUser(userId) {
        return request('GET', `/api/users/${userId}`);
    }

    // ============================================================
    // CONVERSATION ENDPOINTS (1-1 chats)
    // ============================================================

    /**
     * Get all conversations for current user
     * @returns {Promise<array>} Array of conversation objects
     * Purpose: Populate conversation list in sidebar
     * Each conversation includes: id, lastMessage, otherUser, unreadCount
     */
    async function getConversations() {
        return request('GET', '/api/conversations');
    }

    // ============================================================
    // MESSAGE ENDPOINTS (1-1 chat messages)
    // ============================================================

    /**
     * Get messages from a conversation with pagination
     * @param {string} conversationId - Conversation ID
     * @param {string|null} cursor - Pagination cursor (optional)
     * @param {number} limit - Number of messages to fetch
     * @returns {Promise<object>} { messages: [], nextCursor: '', hasMore: boolean }
     * Purpose: Fetch message history with pagination for infinite scroll
     */
    async function getMessages(conversationId, cursor = null, limit = 50) {
        let url = `/api/messages/conversations/${encodeURIComponent(conversationId)}?limit=${limit}`;

        if (cursor) {
            url += `&cursor=${encodeURIComponent(cursor)}`;
        }

        return request('GET', url);
    }

    /**
     * Get conversation statistics
     * @param {string} conversationId - Conversation ID
     * @returns {Promise<object>} { totalMessages: number, lastMessageTime: string }
     * Purpose: Display conversation metadata and stats
     */
    async function getConversationStats(conversationId) {
        return request('GET', `/api/messages/conversations/${encodeURIComponent(conversationId)}/stats`);
    }

    // ============================================================
    // GROUP CHAT ENDPOINTS
    // ============================================================

    /**
     * Create new group chat
     * @param {string} name - Group name
     * @param {array} memberIds - Array of user IDs to add
     * @returns {Promise<object>} New group object
     * Purpose: Initialize a new group conversation
     */
    async function createGroup(name, memberIds) {
        return request('POST', '/api/groups', { name, memberIds });
    }

    /**
     * Get all groups for current user
     * @returns {Promise<array>} Array of group objects
     * Purpose: Populate group list in sidebar
     * Each group includes: id, name, members, lastMessage
     */
    async function getGroups() {
        return request('GET', '/api/groups');
    }

    /**
     * Get specific group by ID
     * @param {string} groupId - Group ID
     * @returns {Promise<object>} Group object with members
     * Purpose: Fetch group information and member list
     */
    async function getGroup(groupId) {
        return request('GET', `/api/groups/${groupId}`);
    }

    /**
     * Get messages from a group with pagination
     * @param {string} groupId - Group ID
     * @param {number} page - Page number (0-indexed)
     * @param {number} size - Messages per page
     * @returns {Promise<object>} Paginated messages response
     * Purpose: Fetch group message history
     */
    async function getGroupMessages(groupId, page = 0, size = 50) {
        return request('GET', `/api/groups/${groupId}/messages?page=${page}&size=${size}`);
    }

    /**
     * Add member to group
     * @param {string} groupId - Group ID
     * @param {string} userId - User ID to add
     * @returns {Promise<object>} Updated group object
     * Purpose: Invite user to existing group
     */
    async function addGroupMember(groupId, userId) {
        return request('POST', `/api/groups/${groupId}/members`, { userId });
    }

    /**
     * Remove member from group
     * @param {string} groupId - Group ID
     * @param {string} userId - User ID to remove
     * @returns {Promise<void>}
     * Purpose: Remove user from group
     */
    async function removeGroupMember(groupId, userId) {
        return request('DELETE', `/api/groups/${groupId}/members/${userId}`);
    }

    // ============================================================
    // PUBLIC API INTERFACE
    // ============================================================

    return {
        // Auth
        login,
        register,

        // Users
        getMe,
        searchUsers,
        getUser,

        // Conversations
        getConversations,

        // Messages (1-1)
        getMessages,
        getConversationStats,

        // Groups
        createGroup,
        getGroups,
        getGroup,
        getGroupMessages,
        addGroupMember,
        removeGroupMember,

        // Utilities
        getToken
    };
})();