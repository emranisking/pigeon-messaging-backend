package com.example.messaging.websocket.controller;

import com.example.messaging.conversation.service.ConversationService;
import com.example.messaging.message.cassandra.repository.MessageRepository;
import com.example.messaging.producer.MessageEventPublisher;
import com.example.messaging.websocket.dto.ChatMessage;
import com.example.messaging.websocket.dto.ChatMessageRequest;
import com.example.messaging.websocket.dto.MessageStatusEvent;
import org.springframework.lang.NonNull;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import java.util.UUID;

@Controller
public class ChatController {

    private final SimpMessagingTemplate messagingTemplate;
    private final MessageEventPublisher messageEventPublisher;
    private final ConversationService conversationService;
    private final MessageRepository messageRepository;

    public ChatController(
            SimpMessagingTemplate messagingTemplate,
            MessageEventPublisher messageEventPublisher,
            ConversationService conversationService,
            MessageRepository messageRepository
    ) {
        this.messagingTemplate = messagingTemplate;
        this.messageEventPublisher = messageEventPublisher;
        this.conversationService = conversationService;
        this.messageRepository = messageRepository;
    }

    @MessageMapping("/chat.send")
    public void send(ChatMessageRequest request, Principal principal) {
        UUID senderId = extractUserId((Principal) principal);
        UUID receiverId = request.getReceiverId();

        // Find or create conversation using deterministic logic
        String conversationId = conversationService.findOrCreateConversation(senderId, receiverId)
                .getConversationId();

        // Create message with proper conversationId, messageId, timestamp, and status
        ChatMessage message = ChatMessage.create(
                conversationId,
                senderId,
                receiverId,
                request.getContent()
        );

        // 1️⃣ Send message to SENDER in real-time (sender sees immediately)
        messagingTemplate.convertAndSendToUser(
                principal.getName(),
                "/queue/messages",
                message
        );

        // 2️⃣ Send message to RECEIVER in real-time (receiver sees immediately)
        // Convert receiverId to String (principal name format)
        messagingTemplate.convertAndSendToUser(
                receiverId.toString(),
                "/queue/messages",
                message
        );

        // 3️⃣ Async persistence to Cassandra via RabbitMQ
        messageEventPublisher.publish(message);
    }

    /**
     * Handle message delivered status update.
     * Called when receiver's client confirms message reception.
     *
     * @param event MessageStatusEvent containing messageId, conversationId, and timestamp
     * @param principal Current user principal
     */
    @MessageMapping("/chat.delivered")
    public void handleDelivered(@Payload MessageStatusEvent event, Principal principal) {
        try {
            UUID receiverId = extractUserId(principal);

            // Update message status in Cassandra to "delivered"
            if (event.getConversationId() != null && event.getCreatedAt() != null) {
                messageRepository.updateStatus(event.getConversationId().toString(), event.getCreatedAt(), "delivered");
            }

            // Broadcast delivery confirmation to sender
            MessageStatusEvent deliveryConfirm = new MessageStatusEvent(
                    event.getMessageId(),
                    event.getConversationId(),
                    receiverId,
                    "delivered",
                    event.getCreatedAt()
            );

            // Send to sender (identified by their principal)
            messagingTemplate.convertAndSendToUser(
                    event.getSenderId().toString(),
                    "/queue/status",
                    deliveryConfirm
            );

            System.out.println("Message " + event.getMessageId() + " delivered to " + receiverId);
        } catch (Exception e) {
            System.err.println("Error handling delivery confirmation: " + e.getMessage());
        }
    }

    /**
     * Handle message seen status update.
     * Called when receiver's client confirms message has been read.
     *
     * @param event MessageStatusEvent containing messageId, conversationId, and timestamp
     * @param principal Current user principal
     */
    @MessageMapping("/chat.seen")
    public void handleSeen(@Payload MessageStatusEvent event, Principal principal) {
        try {
            UUID receiverId = extractUserId(principal);

            // Update message status in Cassandra to "seen"
            if (event.getConversationId() != null && event.getCreatedAt() != null) {
                messageRepository.updateStatus(event.getConversationId().toString(), event.getCreatedAt(), "seen");
            }

            // Broadcast seen confirmation to sender
            MessageStatusEvent seenConfirm = new MessageStatusEvent(
                    event.getMessageId(),
                    event.getConversationId(),
                    receiverId,
                    "seen",
                    event.getCreatedAt()
            );

            // Send to sender (identified by their principal)
            messagingTemplate.convertAndSendToUser(
                    event.getSenderId().toString(),
                    "/queue/status",
                    seenConfirm
            );

            System.out.println("Message " + event.getMessageId() + " seen by " + receiverId);
        } catch (Exception e) {
            System.err.println("Error handling seen confirmation: " + e.getMessage());
        }
    }

    private UUID extractUserId(@NonNull Principal principal) {
        return UUID.fromString(principal.getName());
    }


}
