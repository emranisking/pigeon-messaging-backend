# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a production-grade real-time messaging backend built with Spring Boot, using WebSocket (STOMP), RabbitMQ for async processing, Cassandra for message storage, and PostgreSQL for relationships. The architecture follows an event-driven pattern where controllers publish to RabbitMQ and workers consume and persist messages.

## Key Architecture

- **WebSocket Controllers** (`ChatController`, `GroupChatController`): Handle real-time messaging via STOMP, publish to RabbitMQ
- **RabbitMQ Producer** (`MessageEventPublisher`): Publishes messages to exchanges (`chat.exchange`, `group.exchange`)
- **RabbitMQ Consumer** (`MessagePersistConsumer`): Listens on queues, persists messages to Cassandra with idempotent writes
- **Cassandra Storage**: Messages stored with `conversation_id` (partition key) and `created_at` (clustering key, DESC)
- **REST API** (`MessageController`): Provides paginated message history and conversation stats
- **Security**: JWT-based authentication, CORS configured for frontend origins

## Development Commands

```bash
# Build the project
./mvnw clean package

# Run the application
./mvnw spring-boot:run

# Run tests
./mvnw test

# Run a single test
./mvnw test -Dtest=MessageControllerTest

# Build and run with specific profile
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
```

## Data Flow Pattern

**1-1 Chat Flow:**
1. User sends message via WebSocket (`/app/chat.send`)
2. `ChatController` publishes to RabbitMQ (`chat.exchange` with routing key `chat.message`)
3. `MessagePersistConsumer` consumes message, persists to Cassandra with `IF NOT EXISTS` (idempotent)
4. Consumer broadcasts to receiver via WebSocket
5. Delivery status updates flow back via `/chat.delivered` and `/chat.seen`

**Group Chat Flow:**
Same pattern but uses `group.exchange` and `group.queue`.

## Important Design Decisions

- **Never** let controllers write directly to Cassandra - always go through RabbitMQ
- **Always** use `IF NOT EXISTS` in Cassandra inserts for idempotency
- **Always** query Cassandra with partition key (`conversation_id`) for efficiency
- **Always** use descending clustering order (`created_at DESC`) for natural pagination
- **Graceful degradation**: If Cassandra is unavailable, services continue operating (messages queued)

## File Structure Highlights

- `src/main/java/com/example/messaging/config/` - RabbitMQ, Cassandra, Security configurations
- `src/main/java/com/example/messaging/consumer/` - RabbitMQ message consumers
- `src/main/java/com/example/messaging/message/cassandra/` - Cassandra entities, repositories
- `src/main/java/com/example/messaging/websocket/controller/` - Real-time WebSocket handlers
- `src/main/resources/application.yml` - Application configuration including Cassandra, RabbitMQ, JWT settings
- `src/main/resources/static/` - Frontend files (HTML, CSS, JavaScript)
  - `index.html` - Login page
  - `css/messenger.css` - Styles including auth page and chat UI
  - `js/api.js` - REST API service layer
  - `js/auth.js` - Authentication form handling
  - `js/websocket.js` - WebSocket connection management
  - `js/app.js` - Main application logic and message rendering

## Testing Notes

- Cassandra must be running locally on port 9042 for full integration tests
- RabbitMQ must be running locally on port 5672 for async tests
- JWT secret in `application.yml` must match test configurations
- Tests are in `src/test/java/`; use profiles to manage test vs dev configurations

## Frontend Notes

- The `auth-page` CSS class is used for the login/register page
- When switching between login forms (login vs register), the `active` class is toggled on forms
- WebSocket subscriptions are managed in `websocket.js` with `/user/queue/` prefixes for user-specific destinations
- Message rendering in `app.js` groups messages by sender and date, with avatars shown for received message groups
- The `loadMessages()` function uses pagination with cursors; `hasMore` state controls the "Load older messages" button