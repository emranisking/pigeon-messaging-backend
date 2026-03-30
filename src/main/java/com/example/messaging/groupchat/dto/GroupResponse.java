package com.example.messaging.groupchat.dto;

import lombok.*;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GroupResponse {
    private UUID id;
    private String name;
    private UUID createdBy;
    private Instant createdAt;
    private List<GroupMemberInfo> members;
    private GroupMessageResponse lastMessage;

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class GroupMemberInfo {
        private UUID userId;
        private String username;
    }
}
