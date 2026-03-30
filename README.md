# 📡 Messaging Backend Architecture (Updated)

## 🚀 Overview

This backend supports:

* ✅ 1-to-1 chat (existing)
* ✅ Group chat (new)
* ✅ WebSocket real-time messaging
* ✅ JWT authentication
* ✅ Cassandra for scalable message storage

---

# 🏗️ System Architecture

## 🧠 Database Strategy

### 🟢 PostgreSQL (Relational DB)

Used for **structured & relational data**:

* Users
* Conversations (1–1)
* Group Conversations
* Group Members

---

### 🔵 Cassandra (NoSQL DB)

Used for **high-volume data**:

* Messages
* Group Messages

Reason:

* High write throughput
* Infinite scalability
* Fast message retrieval

---

# 📂 Project Structure

```
com.example.messaging
│
├── auth
│   ├── JwtService
│
├── websocket
│   ├── config
│   ├── interceptor
│
├── chat                (1-to-1 chat)
│
└── groupchat           (NEW)
    │
    ├── controller
    │   └── GroupChatController
    │
    ├── service
    │   └── GroupMessageService
    │
    ├── repository
    │   ├── GroupConversationRepository (Postgres)
    │   ├── GroupMemberRepository (Postgres)
    │   └── GroupMessageRepository (Cassandra)
    │
    ├── entity
    │   ├── GroupConversation (Postgres)
    │   ├── GroupMember (Postgres)
    │   └── GroupMessage (Cassandra)
    │
    └── dto
        ├── GroupMessageRequest
        └── GroupMessageResponse
```

---

# 🧱 Database Design

## 📌 PostgreSQL Tables

### group_conversations

```
id (UUID)
name
created_by
created_at
```

---

### group_members

```
id
group_id
user_id
role (ADMIN / MEMBER)
joined_at
```

---

## 📌 Cassandra Table

### group_messages

```
group_id UUID
created_at TIMESTAMP
message_id UUID
sender_id UUID
content TEXT

PRIMARY KEY ((group_id), created_at, message_id)
```

✔ Partition Key → group_id
✔ Clustering → created_at DESC

---

# 🔌 WebSocket Configuration

## Endpoint

```
/ws-chat
```

## Message Prefix

```
/app
```

## Topic Prefix

```
/topic
```

---

# 📡 WebSocket Flow (Group Chat)

## 1. Client Sends Message

```
SEND /app/group.send
```

### Payload

```json
{
  "groupId": "UUID",
  "content": "Hello group"
}
```

---

## 2. Controller

```java
@MessageMapping("/group.send")
```

Steps:

* Extract senderId from JWT (Principal)
* Call service
* Broadcast message

---

## 3. Service Layer

### Responsibilities:

* Validate user is group member
* Save message to Cassandra
* Build response DTO

---

## 4. Save Message (Cassandra)

```
group_id → partition
created_at → clustering
```

---

## 5. Broadcast Message

```
/topic/group/{groupId}
```

---

## 6. Clients Receive Message

All subscribed users get real-time update.

---

# 📡 Client Flow

## Subscribe

```
SUBSCRIBE /topic/group/{groupId}
```

---

## Send Message

```
SEND /app/group.send
```

---

# 🔐 Security Flow

## JWT Authentication

1. Client sends token in WebSocket CONNECT
2. Interceptor extracts token
3. JwtService validates token
4. userId stored in Principal

---

## Message Security

Before saving message:

```
Check:
groupMemberRepository.existsByGroupIdAndUserId()
```

If false → reject request

---

# 🔁 Message Flow Diagram

```
User → WebSocket (/app/group.send)
      ↓
GroupChatController
      ↓
GroupMessageService
      ↓
Validate Membership
      ↓
Save to Cassandra
      ↓
Publish (/topic/group/{groupId})
      ↓
All Members Receive
```

---

# 🧩 Future Enhancements

## ✅ MQTT Integration

Topics:

```
chat/group/{groupId}
```

---

## ✅ Delivery System

* SENT
* DELIVERED
* SEEN

---

## ✅ Typing Indicator

```
/topic/group/{groupId}/typing
```

---

## ✅ Pagination (Important)

Use Cassandra query:

```
WHERE group_id = ?
AND created_at < lastMessageTime
LIMIT 20
```

---

# ⚠️ Important Design Notes

## ❌ Do NOT store messages in PostgreSQL

Reasons:

* Not scalable
* Slow queries for large history

---

## ✅ Always partition Cassandra by groupId

Ensures:

* Fast reads
* Efficient scaling

---

## ✅ Keep Group & Members in PostgreSQL

Because:

* relational queries needed
* joins required

---

# 🎯 Final Architecture Summary

```
PostgreSQL
──────────
users
conversations
group_conversations
group_members

Cassandra
─────────
messages
group_messages
```

---

# ✅ Status

| Feature               | Status |
| --------------------- | ------ |
| JWT Auth              | ✅ Done |
| WebSocket             | ✅ Done |
| 1–1 Chat              | ✅ Done |
| Group Chat WebSocket  | ✅ Done |
| Cassandra Integration | ✅ Done |
| MQTT                  | ⏳ Next |

---

# 🚀 Next Step

Implement:

```
POST /groups
```

* Create group
* Add members
* Return groupId

---

**You now have a production-level messaging backend foundation.**
