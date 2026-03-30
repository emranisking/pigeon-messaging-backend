package com.example.messaging.groupchat.service;

import com.example.messaging.groupchat.dto.*;
import com.example.messaging.groupchat.entity.GroupConversation;
import com.example.messaging.groupchat.entity.GroupMember;
import com.example.messaging.groupchat.entity.GroupMessage;
import com.example.messaging.groupchat.repository.*;
import com.example.messaging.user.User;
import com.example.messaging.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class GroupMessageService {

    private final GroupMessageRepository groupMessageRepository;
    private final GroupMemberRepository groupMemberRepository;
    private final GroupConversationRepository groupConversationRepository;
    private final UserRepository userRepository;

    public GroupMessageResponse saveMessage(
            GroupMessageRequest request,
            UUID senderId
    ) {
        if (!groupMemberRepository.existsByGroupIdAndUserId(request.getGroupId(), senderId)) {
            throw new RuntimeException("User not in group");
        }

        GroupMessage message = new GroupMessage();
        message.setGroupId(request.getGroupId());
        message.setSenderId(senderId);
        message.setContent(request.getContent());
        message.setCreatedAt(Instant.now());

        message = groupMessageRepository.save(message);

        return toMessageResponse(message);
    }

    @Transactional
    public GroupResponse createGroup(CreateGroupRequest request, UUID creatorId) {
        GroupConversation group = GroupConversation.builder()
                .name(request.getName())
                .createdBy(creatorId)
                .createdAt(Instant.now())
                .build();

        group = groupConversationRepository.save(group);

        // Add creator as member
        GroupMember creatorMember = GroupMember.builder()
                .groupId(group.getId())
                .userId(creatorId)
                .build();
        groupMemberRepository.save(creatorMember);

        // Add other members
        if (request.getMemberIds() != null) {
            for (UUID memberId : request.getMemberIds()) {
                if (!memberId.equals(creatorId)) {
                    GroupMember member = GroupMember.builder()
                            .groupId(group.getId())
                            .userId(memberId)
                            .build();
                    groupMemberRepository.save(member);
                }
            }
        }

        return toGroupResponse(group);
    }

    public List<GroupResponse> getUserGroups(UUID userId) {
        List<GroupMember> memberships = groupMemberRepository.findByUserId(userId);
        List<GroupResponse> groups = new ArrayList<>();

        for (GroupMember membership : memberships) {
            groupConversationRepository.findById(membership.getGroupId())
                    .ifPresent(group -> groups.add(toGroupResponse(group)));
        }

        return groups;
    }

    public GroupResponse getGroup(UUID groupId, UUID userId) {
        if (!groupMemberRepository.existsByGroupIdAndUserId(groupId, userId)) {
            throw new RuntimeException("User not in group");
        }

        GroupConversation group = groupConversationRepository.findById(groupId)
                .orElseThrow(() -> new RuntimeException("Group not found"));

        return toGroupResponse(group);
    }

    public List<GroupMessageResponse> getMessages(UUID groupId, UUID userId, int page, int size) {
        if (!groupMemberRepository.existsByGroupIdAndUserId(groupId, userId)) {
            throw new RuntimeException("User not in group");
        }

        Page<GroupMessage> messages = groupMessageRepository
                .findByGroupIdOrderByCreatedAtDesc(groupId, PageRequest.of(page, size));

        return messages.getContent().stream()
                .map(this::toMessageResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public void addMember(UUID groupId, UUID userId, UUID requesterId) {
        if (!groupMemberRepository.existsByGroupIdAndUserId(groupId, requesterId)) {
            throw new RuntimeException("You are not in this group");
        }

        if (groupMemberRepository.existsByGroupIdAndUserId(groupId, userId)) {
            throw new RuntimeException("User is already a member");
        }

        GroupMember member = GroupMember.builder()
                .groupId(groupId)
                .userId(userId)
                .build();
        groupMemberRepository.save(member);
    }

    @Transactional
    public void removeMember(UUID groupId, UUID userId, UUID requesterId) {
        GroupConversation group = groupConversationRepository.findById(groupId)
                .orElseThrow(() -> new RuntimeException("Group not found"));

        // Only creator can remove members (or user can remove themselves)
        if (!group.getCreatedBy().equals(requesterId) && !userId.equals(requesterId)) {
            throw new RuntimeException("Only group creator can remove members");
        }

        groupMemberRepository.deleteByGroupIdAndUserId(groupId, userId);
    }

    public List<UUID> getGroupMemberIds(UUID groupId) {
        return groupMemberRepository.findByGroupId(groupId).stream()
                .map(GroupMember::getUserId)
                .collect(Collectors.toList());
    }

    private GroupMessageResponse toMessageResponse(GroupMessage message) {
        User sender = userRepository.findById(message.getSenderId()).orElse(null);
        
        return GroupMessageResponse.builder()
                .messageId(message.getId())
                .groupId(message.getGroupId())
                .senderId(message.getSenderId())
                .senderUsername(sender != null ? sender.getUsername() : "Unknown")
                .content(message.getContent())
                .createdAt(message.getCreatedAt())
                .build();
    }

    private GroupResponse toGroupResponse(GroupConversation group) {
        List<GroupMember> members = groupMemberRepository.findByGroupId(group.getId());
        List<GroupResponse.GroupMemberInfo> memberInfos = new ArrayList<>();

        for (GroupMember member : members) {
            userRepository.findById(member.getUserId()).ifPresent(user ->
                    memberInfos.add(GroupResponse.GroupMemberInfo.builder()
                            .userId(user.getId())
                            .username(user.getUsername())
                            .build())
            );
        }

        // Get last message
        GroupMessageResponse lastMessage = groupMessageRepository
                .findFirstByGroupIdOrderByCreatedAtDesc(group.getId())
                .map(this::toMessageResponse)
                .orElse(null);

        return GroupResponse.builder()
                .id(group.getId())
                .name(group.getName())
                .createdBy(group.getCreatedBy())
                .createdAt(group.getCreatedAt())
                .members(memberInfos)
                .lastMessage(lastMessage)
                .build();
    }
}