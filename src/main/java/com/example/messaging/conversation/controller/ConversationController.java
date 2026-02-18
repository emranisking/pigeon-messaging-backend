package com.example.messaging.conversation.controller;

import com.example.messaging.conversation.Conversation;
import com.example.messaging.conversation.ConversationRepository;
import com.example.messaging.message.cassandra.entity.MessageEntity;
import com.example.messaging.message.cassandra.repository.MessageRepository;
import com.example.messaging.user.User;
import com.example.messaging.user.UserRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/conversations")
public class ConversationController {

    private final ConversationRepository conversationRepository;
    private final UserRepository userRepository;
    private final MessageRepository messageRepository;

    public ConversationController(
            ConversationRepository conversationRepository,
            UserRepository userRepository,
            MessageRepository messageRepository) {
        this.conversationRepository = conversationRepository;
        this.userRepository = userRepository;
        this.messageRepository = messageRepository;
    }

    /**
     * Get all conversations for the current user with other user info and last message.
     */
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<Map<String, Object>>> getConversations(Principal principal) {
        UUID userId = UUID.fromString(principal.getName());
        List<Conversation> conversations = conversationRepository.findByUserIdAndIsDeletedFalse(userId);

        List<Map<String, Object>> response = conversations.stream().map(conv -> {
            UUID otherId = conv.getUserAId().equals(userId) ? conv.getUserBId() : conv.getUserAId();
            User otherUser = userRepository.findById(otherId).orElse(null);

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("conversationId", conv.getConversationId());
            item.put("otherUser", Map.of(
                    "id", otherUser != null ? otherUser.getId().toString() : otherId.toString(),
                    "username", otherUser != null ? otherUser.getUsername() : "Unknown"
            ));

            // Get last message for preview
            try {
                List<MessageEntity> lastMessages = messageRepository.findByConversationId(conv.getConversationId(), 1);
                if (!lastMessages.isEmpty()) {
                    MessageEntity last = lastMessages.get(0);
                    Map<String, Object> lastMsg = new LinkedHashMap<>();
                    lastMsg.put("content", last.getContent());
                    lastMsg.put("createdAt", last.getCreatedAt().toString());
                    lastMsg.put("senderId", last.getSenderId().toString());
                    lastMsg.put("status", last.getStatus());
                    lastMsg.put("messageId", last.getMessageId().toString());
                    item.put("lastMessage", lastMsg);
                }
            } catch (Exception e) {
                // Cassandra might be unavailable
            }

            item.put("createdAt", conv.getCreatedAt() != null ? conv.getCreatedAt().toString() : null);
            return item;
        }).collect(Collectors.toList());

        return ResponseEntity.ok(response);
    }
}
