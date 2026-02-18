package com.example.messaging.websocket.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * DTO for message status update events transmitted over WebSocket.
 * Used for delivered and seen status updates.
 */
public class MessageStatusEvent {

    private UUID messageId;
    private UUID conversationId;
    private UUID senderId;
    private String status; // "sent", "delivered", "seen"
    private Instant createdAt;

    // Default constructor for deserialization
    public MessageStatusEvent() {
    }

    public MessageStatusEvent(UUID messageId, UUID conversationId, UUID senderId, String status, Instant createdAt) {
        this.messageId = messageId;
        this.conversationId = conversationId;
        this.senderId = senderId;
        this.status = status;
        this.createdAt = createdAt;
    }

    public UUID getMessageId() {
        return messageId;
    }

    public void setMessageId(UUID messageId) {
        this.messageId = messageId;
    }

    public UUID getConversationId() {
        return conversationId;
    }

    public void setConversationId(UUID conversationId) {
        this.conversationId = conversationId;
    }

    public UUID getSenderId() {
        return senderId;
    }

    public void setSenderId(UUID senderId) {
        this.senderId = senderId;
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

    @Override
    public String toString() {
        return "MessageStatusEvent{" +
                "messageId=" + messageId +
                ", conversationId=" + conversationId +
                ", senderId=" + senderId +
                ", status='" + status + '\'' +
                ", createdAt=" + createdAt +
                '}';
    }
}
