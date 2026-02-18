package com.example.messaging.user;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByUsernameAndIsDeletedFalse(String username);

    boolean existsByUsername(String username);

    List<User> findTop20ByUsernameContainingIgnoreCaseAndIsDeletedFalse(String username);
}
