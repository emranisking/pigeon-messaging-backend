package com.example.messaging.message.cassandra.entity;

import com.datastax.oss.driver.api.mapper.annotations.ClusteringColumn;
import com.datastax.oss.driver.api.mapper.annotations.Entity;
import com.datastax.oss.driver.api.mapper.annotations.PartitionKey;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Cassandra entity for storing messages.
 *
 * Schema:
 * - Partition Key: conversation_id (ensures all messages in a conversation are together)
 * - Clustering Key: created_at DESC (messages sorted by timestamp, newest first)
 *
 * This design allows efficient queries like:
 * - Get last 50 messages in conversation
 * - Get messages after cursor (for pagination)
 */
@Entity
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MessageEntity {

    /**
     * Conversation ID (partition key).
     * Deterministic hash of sorted user pair.
     */
    @PartitionKey
    private String conversationId;

    /**
     * Timestamp when message was created (clustering key, DESC order).
     * Used for pagination and sorting.
     */
    @ClusteringColumn
    private Instant createdAt;

    /**
     * Unique message identifier (UUID).
     * Used for deduplication and idempotency.
     */
    private UUID messageId;

    /**
     * Sender user ID (UUID).
     */
    private UUID senderId;

    /**
     * Receiver user ID (UUID).
     */
    private UUID receiverId;

    /**
     * Message content/body.
     */
    private String content;

    /**
     * Message status.
     * Values: "sent" | "delivered" | "seen"
     */
    private String status;

    /**
     * Factory method to create MessageEntity from ChatMessage.
     */
    public static MessageEntity from(String conversationId, UUID messageId, UUID senderId, UUID receiverId, String content) {
        return MessageEntity.builder()
                .conversationId(conversationId)
                .messageId(messageId)
                .senderId(senderId)
                .receiverId(receiverId)
                .content(content)
                .status("sent")  // Initial status
                .createdAt(Instant.now())
                .build();
    }
}
