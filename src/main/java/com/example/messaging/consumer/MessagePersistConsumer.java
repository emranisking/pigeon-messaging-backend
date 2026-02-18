package com.example.messaging.consumer;

import com.example.messaging.config.RabbitMQConfig;
import com.example.messaging.message.cassandra.entity.MessageEntity;
import com.example.messaging.message.cassandra.repository.MessageRepository;
import com.example.messaging.websocket.dto.ChatMessage;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Component
public class MessagePersistConsumer {

    private final MessageRepository messageRepository;

    public MessagePersistConsumer(MessageRepository messageRepository) {
        this.messageRepository = messageRepository;
    }

    /**
     * Consumer listens to chat messages from RabbitMQ and persists them to Cassandra.
     * Implements idempotent writing using message_id for deduplication.
     *
     * @param message ChatMessage from WebSocket/Controller
     */
    @RabbitListener(queues = RabbitMQConfig.CHAT_QUEUE)
    public void consume(ChatMessage message) {
        try {
            // Convert ChatMessage to MessageEntity
            MessageEntity messageEntity = MessageEntity.from(
                    message.getConversationId(),
                    message.getMessageId(),
                    message.getSenderId(),
                    message.getReceiverId(),
                    message.getContent()
            );

            // Persist to Cassandra (IF NOT EXISTS ensures idempotency)
            messageRepository.save(messageEntity);

            System.out.println("Message persisted to Cassandra: " + message.getMessageId());
        } catch (Exception e) {
            System.err.println("Error persisting message: " + e.getMessage());
            e.printStackTrace();
            // In production: send to dead-letter queue
        }
    }
}


