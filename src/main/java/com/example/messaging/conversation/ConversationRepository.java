package com.example.messaging.conversation;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ConversationRepository extends JpaRepository<Conversation, String> {

    Optional<Conversation> findByConversationIdAndIsDeletedFalse(String conversationId);

    Optional<Conversation> findByUserAIdAndUserBId(UUID userAId, UUID userBId);

    @Query("SELECT c FROM Conversation c WHERE (c.userAId = :userId OR c.userBId = :userId) AND c.isDeleted = false ORDER BY c.updatedAt DESC")
    List<Conversation> findByUserIdAndIsDeletedFalse(@Param("userId") UUID userId);
}
