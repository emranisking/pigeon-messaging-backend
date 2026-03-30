package com.example.messaging.groupchat.dto;

import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GroupMessageResponse {

    private UUID messageId;
    private UUID groupId;
    private UUID senderId;
    private String senderUsername;
    private String content;
    private Instant createdAt;

}