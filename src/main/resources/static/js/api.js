/* ============================================================
   API Service — REST API communication layer
   ============================================================ */

const API = (() => {
    const BASE_URL = window.location.origin;

    function getToken() {
        return localStorage.getItem('token');
    }

    function authHeaders() {
        const token = getToken();
        return {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        };
    }

    async function request(method, path, body = null) {
        const opts = {
            method,
            headers: authHeaders()
        };
        if (body) {
            opts.body = JSON.stringify(body);
        }

        const res = await fetch(`${BASE_URL}${path}`, opts);

        if (res.status === 401 || res.status === 403) {
            localStorage.clear();
            window.location.href = '/index.html';
            throw new Error('Unauthorized');
        }

        if (!res.ok) {
            const text = await res.text();
            let message;
            try {
                const json = JSON.parse(text);
                message = json.message || json.error || text;
            } catch {
                message = text || `HTTP ${res.status}`;
            }
            throw new Error(message);
        }

        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return res.json();
        }
        return null;
    }

    // ---- Auth ----

    async function login(username, password) {
        return request('POST', '/api/auth/login', { username, password });
    }

    async function register(username, password) {
        return request('POST', '/api/auth/register', { username, password });
    }

    // ---- Users ----

    async function getMe() {
        return request('GET', '/api/users/me');
    }

    async function searchUsers(query) {
        return request('GET', `/api/users/search?query=${encodeURIComponent(query)}`);
    }

    async function getUser(userId) {
        return request('GET', `/api/users/${userId}`);
    }

    // ---- Conversations ----

    async function getConversations() {
        return request('GET', '/api/conversations');
    }

    // ---- Messages ----

    async function getMessages(conversationId, cursor = null, limit = 50) {
        let url = `/api/messages/conversations/${encodeURIComponent(conversationId)}?limit=${limit}`;
        if (cursor) {
            url += `&cursor=${encodeURIComponent(cursor)}`;
        }
        return request('GET', url);
    }

    async function getConversationStats(conversationId) {
        return request('GET', `/api/messages/conversations/${encodeURIComponent(conversationId)}/stats`);
    }

    // ---- Groups ----

    async function createGroup(name, memberIds) {
        return request('POST', '/api/groups', { name, memberIds });
    }

    async function getGroups() {
        return request('GET', '/api/groups');
    }

    async function getGroup(groupId) {
        return request('GET', `/api/groups/${groupId}`);
    }

    async function getGroupMessages(groupId, page = 0, size = 50) {
        return request('GET', `/api/groups/${groupId}/messages?page=${page}&size=${size}`);
    }

    async function addGroupMember(groupId, userId) {
        return request('POST', `/api/groups/${groupId}/members`, { userId });
    }

    async function removeGroupMember(groupId, userId) {
        return request('DELETE', `/api/groups/${groupId}/members/${userId}`);
    }

    return {
        login,
        register,
        getMe,
        searchUsers,
        getUser,
        getConversations,
        getMessages,
        getConversationStats,
        getToken,
        // Group APIs
        createGroup,
        getGroups,
        getGroup,
        getGroupMessages,
        addGroupMember,
        removeGroupMember
    };
})();
