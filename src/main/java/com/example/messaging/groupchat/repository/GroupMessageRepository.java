package com.example.messaging.groupchat.repository;

import com.example.messaging.groupchat.entity.GroupMessage;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface GroupMessageRepository extends JpaRepository<GroupMessage, UUID> {
    
    Page<GroupMessage> findByGroupIdOrderByCreatedAtDesc(UUID groupId, Pageable pageable);
    
    Optional<GroupMessage> findFirstByGroupIdOrderByCreatedAtDesc(UUID groupId);
}