package com.example.messaging.groupchat.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "group_conversations")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GroupConversation {

    @Id
    @GeneratedValue
    private UUID id;

    private String name;

    private UUID createdBy;

    private Instant createdAt;

}
