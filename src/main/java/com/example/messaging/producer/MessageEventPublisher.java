package com.example.messaging.producer;

import com.example.messaging.config.RabbitMQConfig;
import com.example.messaging.websocket.dto.ChatMessage;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

@Component
public class MessageEventPublisher {

    private final RabbitTemplate rabbitTemplate;

    public MessageEventPublisher(RabbitTemplate rabbitTemplate) {
        this.rabbitTemplate = rabbitTemplate;
    }

    /**
     * Publish a ChatMessage to RabbitMQ for async persistence.
     */
    public void publish(ChatMessage chatMessage) {
        rabbitTemplate.convertAndSend(
                RabbitMQConfig.CHAT_EXCHANGE,
                RabbitMQConfig.CHAT_ROUTING_KEY,
                chatMessage
        );
    }

    /**
     * Generic method to publish messages to any exchange/routing key.
     */
    public void publishMessageEvent(String exchange, String routingKey, ChatMessage chatMessage) {
        // ✅ This will now use Jackson2JsonMessageConverter automatically
        rabbitTemplate.convertAndSend(exchange, routingKey, chatMessage);
    }
}
