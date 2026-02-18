package com.example.messaging.message.controller;

import com.example.messaging.message.cassandra.entity.MessageEntity;
import com.example.messaging.message.cassandra.repository.MessageRepository;
import com.example.messaging.message.dto.MessageResponse;
import com.example.messaging.message.dto.PaginationResponse;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * REST API for message operations including pagination.
 * Provides cursor-based pagination for efficient message history scrolling.
 */
@RestController
@RequestMapping("/api/messages")
public class MessageController {

    private final MessageRepository messageRepository;
    private static final int DEFAULT_PAGE_SIZE = 50;
    private static final int MAX_PAGE_SIZE = 200;

    public MessageController(MessageRepository messageRepository) {
        this.messageRepository = messageRepository;
    }

    /**
     * Get messages from a conversation with cursor-based pagination.
     *
     * @param conversationId Conversation ID
     * @param cursor Optional cursor for pagination (timestamp of last message in previous page)
     * @param limit Number of messages to retrieve (default 50, max 200)
     * @return Paginated message response with nextCursor for loading more
     */
    @GetMapping("/conversations/{conversationId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PaginationResponse> getConversationMessages(
            @PathVariable String conversationId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant cursor,
            @RequestParam(defaultValue = "50") int limit) {

        // Validate limit
        if (limit <= 0 || limit > MAX_PAGE_SIZE) {
            limit = DEFAULT_PAGE_SIZE;
        }

        // Fetch messages (limit + 1 to detect if there are more)
        List<MessageEntity> messages;
        if (cursor == null) {
            messages = messageRepository.findByConversationId(conversationId, limit + 1);
        } else {
            messages = messageRepository.findByConversationIdAfterCursor(conversationId, cursor, limit + 1);
        }

        // Determine if there are more messages
        boolean hasMore = messages.size() > limit;
        if (hasMore) {
            messages = messages.subList(0, limit);
        }

        // Convert to response DTOs
        List<MessageResponse> responses = messages.stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());

        // Calculate nextCursor (timestamp of last message in this page)
        Instant nextCursor = null;
        if (hasMore && !messages.isEmpty()) {
            nextCursor = messages.get(messages.size() - 1).getCreatedAt();
        }

        return ResponseEntity.ok(new PaginationResponse(responses, nextCursor, hasMore));
    }

    /**
     * Get a single message by ID.
     *
     * @param conversationId Conversation ID
     * @param messageId Message ID
     * @return Message if found
     */
    @GetMapping("/conversations/{conversationId}/messages/{messageId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<MessageResponse> getMessage(
            @PathVariable String conversationId,
            @PathVariable UUID messageId) {

        return messageRepository.findByIdInConversation(conversationId, messageId)
                .map(msg -> ResponseEntity.ok(mapToResponse(msg)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /**
     * Get conversation statistics (message count, last message time).
     *
     * @param conversationId Conversation ID
     * @return Conversation stats
     */
    @GetMapping("/conversations/{conversationId}/stats")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> getConversationStats(
            @PathVariable String conversationId) {

        try {
            List<MessageEntity> messages = messageRepository.findByConversationId(conversationId, 1);
            
            if (messages.isEmpty()) {
                return ResponseEntity.ok(new Object() {
                    public int messageCount = 0;
                    public Object lastMessageTime = null;
                });
            }

            MessageEntity lastMessage = messages.get(0);
            return ResponseEntity.ok(new Object() {
                public int messageCount = messages.size();
                public Instant lastMessageTime = lastMessage.getCreatedAt();
            });
        } catch (Exception e) {
            return ResponseEntity.status(500).body("Unable to fetch stats: " + e.getMessage());
        }
    }

    /**
     * Convert MessageEntity to MessageResponse DTO.
     */
    private MessageResponse mapToResponse(MessageEntity entity) {
        return new MessageResponse(
                entity.getMessageId(),
                entity.getConversationId(),
                entity.getSenderId(),
                entity.getReceiverId(),
                entity.getContent(),
                entity.getStatus(),
                entity.getCreatedAt()
        );
    }
}
