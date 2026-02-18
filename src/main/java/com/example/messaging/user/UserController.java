package com.example.messaging.user;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserRepository userRepository;

    public UserController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    /**
     * Get current authenticated user's profile.
     */
    @GetMapping("/me")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> getCurrentUser(Principal principal) {
        UUID userId = UUID.fromString(principal.getName());
        return userRepository.findById(userId)
                .map(user -> ResponseEntity.ok(Map.<String, Object>of(
                        "id", user.getId().toString(),
                        "username", user.getUsername()
                )))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /**
     * Search users by username (partial match, case-insensitive).
     */
    @GetMapping("/search")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<Map<String, Object>>> searchUsers(
            @RequestParam String query,
            Principal principal) {
        UUID currentUserId = UUID.fromString(principal.getName());

        List<Map<String, Object>> results = userRepository
                .findTop20ByUsernameContainingIgnoreCaseAndIsDeletedFalse(query)
                .stream()
                .filter(user -> !user.getId().equals(currentUserId))
                .map(user -> Map.<String, Object>of(
                        "id", user.getId().toString(),
                        "username", user.getUsername()
                ))
                .collect(Collectors.toList());

        return ResponseEntity.ok(results);
    }

    /**
     * Get user profile by ID.
     */
    @GetMapping("/{userId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> getUserById(@PathVariable UUID userId) {
        return userRepository.findById(userId)
                .map(user -> ResponseEntity.ok(Map.<String, Object>of(
                        "id", user.getId().toString(),
                        "username", user.getUsername()
                )))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
