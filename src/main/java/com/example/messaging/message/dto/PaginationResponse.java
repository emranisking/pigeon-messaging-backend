package com.example.messaging.message.dto;

import java.time.Instant;
import java.util.List;

/**
 * DTO for paginated message response.
 * Implements cursor-based pagination for efficient scrolling.
 */
public class PaginationResponse {
    private List<MessageResponse> messages;
    private Instant nextCursor;
    private boolean hasMore;

    public PaginationResponse() {}

    public PaginationResponse(List<MessageResponse> messages, Instant nextCursor, boolean hasMore) {
        this.messages = messages;
        this.nextCursor = nextCursor;
        this.hasMore = hasMore;
    }

    // Getters and Setters
    public List<MessageResponse> getMessages() {
        return messages;
    }

    public void setMessages(List<MessageResponse> messages) {
        this.messages = messages;
    }

    public Instant getNextCursor() {
        return nextCursor;
    }

    public void setNextCursor(Instant nextCursor) {
        this.nextCursor = nextCursor;
    }

    public boolean isHasMore() {
        return hasMore;
    }

    public void setHasMore(boolean hasMore) {
        this.hasMore = hasMore;
    }
}
