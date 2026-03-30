package com.example.messaging.groupchat.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;
import com.example.messaging.groupchat.entity.GroupMember;

public interface GroupMemberRepository extends JpaRepository<GroupMember, UUID> {

    boolean existsByGroupIdAndUserId(UUID groupId, UUID userId);
    
    List<GroupMember> findByGroupId(UUID groupId);
    
    List<GroupMember> findByUserId(UUID userId);
    
    void deleteByGroupIdAndUserId(UUID groupId, UUID userId);

}