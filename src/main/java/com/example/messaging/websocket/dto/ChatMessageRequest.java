package com.example.messaging.websocket.dto;

import java.util.UUID;

public class ChatMessageRequest {
    private String conversationId;
    private UUID receiverId;
    private String content;

    public String getConversationId() { return conversationId; }
    public void setConversationId(String conversationId) { this.conversationId = conversationId; }

    public UUID getReceiverId() { return receiverId; }
    public void setReceiverId(UUID receiverId) { this.receiverId = receiverId; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
}