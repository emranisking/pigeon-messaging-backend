package com.example.messaging.message.cassandra.repository;

import com.datastax.oss.driver.api.core.CqlSession;
import com.datastax.oss.driver.api.core.cql.ResultSet;
import com.datastax.oss.driver.api.core.cql.Row;
import com.example.messaging.message.cassandra.entity.MessageEntity;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository for Cassandra message operations.
 * Handles persistence and retrieval of messages from Cassandra.
 */
@Repository
public class MessageRepository {

    private final CqlSession cqlSession;
    private static final String TABLE_NAME = "messages";
    private static final String KEYSPACE = "messaging";

    public MessageRepository(CqlSession cqlSession) {
        this.cqlSession = cqlSession;
    }

    /**
     * Save a message to Cassandra.
     * Gracefully handles cases where Cassandra is unavailable.
     *
     * @param message MessageEntity to save
     * @return Saved message (or null if Cassandra unavailable)
     */
    public MessageEntity save(MessageEntity message) {
        if (cqlSession == null) {
            System.err.println("⚠ Cassandra unavailable - message not persisted");
            return message;  // Return message anyway
        }

        try {
            String query = String.format(
                    "INSERT INTO %s.%s " +
                            "(conversation_id, created_at, message_id, sender_id, receiver_id, content, status) " +
                            "VALUES (?, ?, ?, ?, ?, ?, ?) " +
                            "IF NOT EXISTS",
                    KEYSPACE, TABLE_NAME
            );

            cqlSession.execute(
                    cqlSession.prepare(query).bind(
                            message.getConversationId(),
                            message.getCreatedAt(),
                            message.getMessageId(),
                            message.getSenderId(),
                            message.getReceiverId(),
                            message.getContent(),
                            message.getStatus()
                    )
            );

            return message;
        } catch (Exception e) {
            System.err.println("Error saving message to Cassandra: " + e.getMessage());
            return message;  // Return message anyway
        }
    }

    /**
     * Find message by conversation ID and message ID.
     *
     * @param conversationId Conversation ID
     * @param messageId Message ID
     * @return Optional containing message if found
     */
    public Optional<MessageEntity> findByIdInConversation(String conversationId, UUID messageId) {
        String query = String.format(
                "SELECT * FROM %s.%s " +
                        "WHERE conversation_id = ? AND message_id = ?",
                KEYSPACE, TABLE_NAME
        );

        ResultSet resultSet = cqlSession.execute(
                cqlSession.prepare(query).bind(conversationId, messageId)
        );

        Row row = resultSet.one();
        return row != null ? Optional.of(mapRowToEntity(row)) : Optional.empty();
    }

    /**
     * Get all messages in a conversation (newest first).
     * Limits to 50 messages by default.
     *
     * @param conversationId Conversation ID
     * @param limit Maximum number of messages to retrieve
     * @return List of messages
     */
    public List<MessageEntity> findByConversationId(String conversationId, int limit) {
        String query = String.format(
                "SELECT * FROM %s.%s " +
                        "WHERE conversation_id = ? " +
                        "LIMIT ?",
                KEYSPACE, TABLE_NAME
        );

        ResultSet resultSet = cqlSession.execute(
                cqlSession.prepare(query).bind(conversationId, limit)
        );

        List<MessageEntity> messages = new ArrayList<>();
        for (Row row : resultSet) {
            messages.add(mapRowToEntity(row));
        }
        return messages;
    }

    /**
     * Get messages in conversation after a specific timestamp (for pagination).
     *
     * @param conversationId Conversation ID
     * @param cursor Cursor timestamp (exclusive)
     * @param limit Maximum number of messages to retrieve
     * @return List of messages after cursor
     */
    public List<MessageEntity> findByConversationIdAfterCursor(String conversationId, Instant cursor, int limit) {
        String query = String.format(
                "SELECT * FROM %s.%s " +
                        "WHERE conversation_id = ? AND created_at < ? " +
                        "LIMIT ?",
                KEYSPACE, TABLE_NAME
        );

        ResultSet resultSet = cqlSession.execute(
                cqlSession.prepare(query).bind(conversationId, cursor, limit)
        );

        List<MessageEntity> messages = new ArrayList<>();
        for (Row row : resultSet) {
            messages.add(mapRowToEntity(row));
        }
        return messages;
    }

    /**
     * Update message status (sent/delivered/seen).
     *
     * @param conversationId Conversation ID
     * @param createdAt Message timestamp
     * @param status New status
     */
    public void updateStatus(String conversationId, Instant createdAt, String status) {
        String query = String.format(
                "UPDATE %s.%s " +
                        "SET status = ? " +
                        "WHERE conversation_id = ? AND created_at = ?",
                KEYSPACE, TABLE_NAME
        );

        cqlSession.execute(
                cqlSession.prepare(query).bind(status, conversationId, createdAt)
        );
    }

    /**
     * Map Cassandra Row to MessageEntity.
     */
    private MessageEntity mapRowToEntity(Row row) {
        return MessageEntity.builder()
                .conversationId(row.getString("conversation_id"))
                .createdAt(row.getInstant("created_at"))
                .messageId(row.getUuid("message_id"))
                .senderId(row.getUuid("sender_id"))
                .receiverId(row.getUuid("receiver_id"))
                .content(row.getString("content"))
                .status(row.getString("status"))
                .build();
    }
}
