package com.example.messaging.groupchat.dto;

import lombok.*;
import java.util.List;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CreateGroupRequest {
    private String name;
    private List<UUID> memberIds;
}
