package com.example.messaging.groupchat.controller;

import com.example.messaging.groupchat.dto.*;
import com.example.messaging.groupchat.service.GroupMessageService;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import java.util.List;
import java.util.UUID;

@Controller
@RequiredArgsConstructor
public class GroupChatController {

    private final SimpMessagingTemplate messagingTemplate;
    private final GroupMessageService groupMessageService;

    @MessageMapping("/group.send")
    public void sendGroupMessage(
            @Payload GroupMessageRequest request,
            Principal principal
    ) {
        UUID senderId = UUID.fromString(principal.getName());

        GroupMessageResponse response =
                groupMessageService.saveMessage(request, senderId);

        // Get all group member IDs
        List<UUID> memberIds = groupMessageService.getGroupMemberIds(request.getGroupId());

        // Send to each member's personal queue
        for (UUID memberId : memberIds) {
            messagingTemplate.convertAndSendToUser(
                    memberId.toString(),
                    "/queue/group-messages",
                    response
            );
        }

        // Also broadcast to topic for any listeners
        messagingTemplate.convertAndSend(
                "/topic/group/" + request.getGroupId(),
                response
        );
    }
}