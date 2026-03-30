package com.example.messaging.groupchat.repository;

import com.example.messaging.groupchat.entity.GroupConversation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface GroupConversationRepository extends JpaRepository<GroupConversation, UUID> {

}