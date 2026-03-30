package com.example.messaging.groupchat.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "group_messages")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GroupMessage {

    @Id
    @GeneratedValue
    private UUID id;

    private UUID groupId;

    private UUID senderId;

    @Column(columnDefinition = "TEXT")
    private String content;

    private Instant createdAt = Instant.now();
}