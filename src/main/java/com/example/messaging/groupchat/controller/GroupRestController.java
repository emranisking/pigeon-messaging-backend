package com.example.messaging.groupchat.controller;

import com.example.messaging.groupchat.dto.*;
import com.example.messaging.groupchat.service.GroupMessageService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/groups")
@RequiredArgsConstructor
public class GroupRestController {

    private final GroupMessageService groupMessageService;

    @PostMapping
    public ResponseEntity<GroupResponse> createGroup(
            @RequestBody CreateGroupRequest request,
            Principal principal
    ) {
        UUID userId = UUID.fromString(principal.getName());
        GroupResponse response = groupMessageService.createGroup(request, userId);
        return ResponseEntity.ok(response);
    }

    @GetMapping
    public ResponseEntity<List<GroupResponse>> getMyGroups(Principal principal) {
        UUID userId = UUID.fromString(principal.getName());
        List<GroupResponse> groups = groupMessageService.getUserGroups(userId);
        return ResponseEntity.ok(groups);
    }

    @GetMapping("/{groupId}")
    public ResponseEntity<GroupResponse> getGroup(
            @PathVariable UUID groupId,
            Principal principal
    ) {
        UUID userId = UUID.fromString(principal.getName());
        GroupResponse response = groupMessageService.getGroup(groupId, userId);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{groupId}/messages")
    public ResponseEntity<List<GroupMessageResponse>> getMessages(
            @PathVariable UUID groupId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            Principal principal
    ) {
        UUID userId = UUID.fromString(principal.getName());
        List<GroupMessageResponse> messages = groupMessageService.getMessages(groupId, userId, page, size);
        return ResponseEntity.ok(messages);
    }

    @PostMapping("/{groupId}/members")
    public ResponseEntity<Void> addMember(
            @PathVariable UUID groupId,
            @RequestBody AddMemberRequest request,
            Principal principal
    ) {
        UUID requesterId = UUID.fromString(principal.getName());
        groupMessageService.addMember(groupId, request.getUserId(), requesterId);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{groupId}/members/{userId}")
    public ResponseEntity<Void> removeMember(
            @PathVariable UUID groupId,
            @PathVariable UUID userId,
            Principal principal
    ) {
        UUID requesterId = UUID.fromString(principal.getName());
        groupMessageService.removeMember(groupId, userId, requesterId);
        return ResponseEntity.ok().build();
    }
}
