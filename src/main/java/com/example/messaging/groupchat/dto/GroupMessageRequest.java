package com.example.messaging.groupchat.dto;

import lombok.*;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GroupMessageRequest {

    private UUID groupId;
    private String content;

}