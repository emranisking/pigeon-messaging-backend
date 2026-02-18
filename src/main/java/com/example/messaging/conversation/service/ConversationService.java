package com.example.messaging.conversation.service;

import com.example.messaging.conversation.Conversation;
import com.example.messaging.conversation.ConversationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.UUID;

@Service
@Transactional
public class ConversationService {

    private final ConversationRepository conversationRepository;

    public ConversationService(ConversationRepository conversationRepository) {
        this.conversationRepository = conversationRepository;
    }

    /**
     * Find or create a conversation between two users.
     * Uses deterministic conversationId based on sorted user IDs to ensure uniqueness.
     *
     * @param userId1 First user ID
     * @param userId2 Second user ID
     * @return Existing or newly created conversation
     */
    public Conversation findOrCreateConversation(UUID userId1, UUID userId2) {
        if (userId1.equals(userId2)) {
            throw new IllegalArgumentException("Cannot create conversation with same user");
        }

        // Sort IDs to ensure consistency (A, B) = (B, A)
        UUID userAId = userId1.compareTo(userId2) < 0 ? userId1 : userId2;
        UUID userBId = userId1.compareTo(userId2) < 0 ? userId2 : userId1;

        // Try to find existing conversation
        return conversationRepository.findByUserAIdAndUserBId(userAId, userBId)
                .orElseGet(() -> createNewConversation(userAId, userBId));
    }

    /**
     * Create a new conversation with a deterministic conversationId.
     * ConversationId is derived from sorted user pair hash.
     *
     * @param userAId First user ID (must be sorted before calling this method)
     * @param userBId Second user ID (must be sorted before calling this method)
     * @return Newly created conversation
     */
    private Conversation createNewConversation(UUID userAId, UUID userBId) {
        String conversationId = generateDeterministicId(userAId, userBId);

        Conversation conversation = Conversation.builder()
                .conversationId(conversationId)
                .userAId(userAId)
                .userBId(userBId)
                .isActive(true)
                .build();

        return conversationRepository.save(conversation);
    }

    /**
     * Generate a deterministic conversationId from two sorted UUIDs.
     * Uses SHA-256 hash of concatenated UUID strings.
     *
     * @param userAId First user ID (sorted)
     * @param userBId Second user ID (sorted)
     * @return Deterministic conversationId (hex string, length 64)
     */
    private String generateDeterministicId(UUID userAId, UUID userBId) {
        String combined = userAId.toString() + userBId.toString();
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(combined.getBytes());
            return bytesToHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 algorithm not available", e);
        }
    }

    /**
     * Convert byte array to hex string.
     *
     * @param bytes Byte array to convert
     * @return Hex string representation
     */
    private String bytesToHex(byte[] bytes) {
        StringBuilder hexString = new StringBuilder();
        for (byte b : bytes) {
            String hex = Integer.toHexString(0xff & b);
            if (hex.length() == 1) {
                hexString.append('0');
            }
            hexString.append(hex);
        }
        return hexString.toString();
    }

    /**
     * Get conversation by ID if active.
     *
     * @param conversationId Conversation ID
     * @return Conversation if found and active
     */
    public Conversation getConversation(String conversationId) {
        return conversationRepository.findByConversationIdAndIsDeletedFalse(conversationId)
                .orElseThrow(() -> new IllegalArgumentException("Conversation not found: " + conversationId));
    }
}
