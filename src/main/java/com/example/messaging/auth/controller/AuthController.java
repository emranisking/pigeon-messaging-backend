package com.example.messaging.auth.controller;

import com.example.messaging.auth.AuthService;

import com.example.messaging.auth.dto.AuthResponse;
import com.example.messaging.auth.dto.LoginRequest;
import com.example.messaging.auth.dto.RegisterRequest;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public AuthResponse register(@RequestBody RegisterRequest request) {
        return authService.register(request);
    }

    @PostMapping("/login")
    public AuthResponse login(@RequestBody LoginRequest request) {
        return authService.login(request);
    }
}
