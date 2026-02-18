package com.example.messaging.websocket.dto;

import java.time.Instant;
import java.util.UUID;

// ✅ DO NOT implement Serializable
public class ChatMessage {

    private String conversationId;
    private UUID messageId;
    private UUID senderId;
    private UUID receiverId;
    private String content;
    private String status;
    private Instant createdAt;

    // ✅ Required for Jackson deserialization
    public ChatMessage() {}

    public ChatMessage(String conversationId, UUID messageId, UUID senderId, UUID receiverId, String content, String status, Instant createdAt) {
        this.conversationId = conversationId;
        this.messageId = messageId;
        this.senderId = senderId;
        this.receiverId = receiverId;
        this.content = content;
        this.status = status;
        this.createdAt = createdAt;
    }

    /**
     * Factory method to create a ChatMessage with auto-generated messageId and timestamp.
     */
    public static ChatMessage create(String conversationId, UUID senderId, UUID receiverId, String content) {
        return new ChatMessage(
                conversationId,
                UUID.randomUUID(),
                senderId,
                receiverId,
                content,
                "sent",
                Instant.now()
        );
    }

    // ✅ Getters and Setters (required for Jackson)
    public String getConversationId() {
        return conversationId;
    }

    public void setConversationId(String conversationId) {
        this.conversationId = conversationId;
    }

    public UUID getMessageId() {
        return messageId;
    }

    public void setMessageId(UUID messageId) {
        this.messageId = messageId;
    }

    public UUID getSenderId() {
        return senderId;
    }

    public void setSenderId(UUID senderId) {
        this.senderId = senderId;
    }

    public UUID getReceiverId() {
        return receiverId;
    }

    public void setReceiverId(UUID receiverId) {
        this.receiverId = receiverId;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}