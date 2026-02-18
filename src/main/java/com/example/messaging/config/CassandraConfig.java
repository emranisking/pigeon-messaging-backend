package com.example.messaging.config;

import com.datastax.oss.driver.api.core.CqlSession;
import com.datastax.oss.driver.api.core.cql.SimpleStatement;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.stereotype.Component;

import java.net.InetSocketAddress;

@Configuration
public class CassandraConfig {

    @Value("${spring.cassandra.contact-points}")
    private String contactPoints;

    @Value("${spring.cassandra.keyspace-name}")
    private String keyspaceName;

    @Value("${spring.cassandra.username}")
    private String username;

    @Value("${spring.cassandra.password}")
    private String password;

    @Value("${spring.cassandra.datacenter-name}")
    private String datacenterName;

    /**
     * Creates and configures a CqlSession for Cassandra operations.
     * Initializes keyspace and message table if they don't exist.
     * Gracefully handles Cassandra connection failures.
     *
     * @return CqlSession bean for database operations (or null if unavailable)
     */
    @Bean
    public CqlSession cqlSession() {
        try {
            // First, connect WITHOUT keyspace to create it
            CqlSession adminSession = CqlSession.builder()
                    .addContactPoint(parseContactPoint())
                    .withLocalDatacenter(datacenterName)
                    .withAuthCredentials(username, password)
                    .build();

            // Initialize keyspace and tables
            initializeKeyspaceAndTables(adminSession);

            // Close admin session
            adminSession.close();

            // Now create the main session WITH keyspace
            CqlSession session = CqlSession.builder()
                    .addContactPoint(parseContactPoint())
                    .withLocalDatacenter(datacenterName)
                    .withAuthCredentials(username, password)
                    .withKeyspace(keyspaceName)
                    .build();

            System.out.println("✓ CqlSession connected and ready");
            return session;
        } catch (Exception e) {
            System.err.println("✗ Failed to connect to Cassandra: " + e.getMessage());
            System.err.println("⚠ Message persistence will be unavailable");
            System.err.println("⚠ Ensure Cassandra is running on " + contactPoints);
            return null;  // Return null - MessageRepository will handle gracefully
        }
    }

    /**
     * Parse contact point string (format: "host:port")
     */
    private InetSocketAddress parseContactPoint() {
        String[] parts = contactPoints.split(":");
        String host = parts[0];
        int port = parts.length > 1 ? Integer.parseInt(parts[1]) : 9042;
        return new InetSocketAddress(host, port);
    }

    /**
     * Initialize keyspace and message table schema.
     */
    private void initializeKeyspaceAndTables(CqlSession session) {
        try {
            // Create keyspace if not exists
            String createKeyspace = String.format(
                    "CREATE KEYSPACE IF NOT EXISTS %s WITH replication = " +
                            "{'class': 'SimpleStrategy', 'replication_factor': 1}",
                    keyspaceName
            );
            session.execute(createKeyspace);

            // Create messages table if not exists
            String createMessagesTable = String.format(
                    "CREATE TABLE IF NOT EXISTS %s.messages (" +
                            "  conversation_id text, " +
                            "  created_at timestamp, " +
                            "  message_id uuid, " +
                            "  sender_id uuid, " +
                            "  receiver_id uuid, " +
                            "  content text, " +
                            "  status text, " +
                            "  PRIMARY KEY (conversation_id, created_at)" +
                            ") WITH CLUSTERING ORDER BY (created_at DESC)",
                    keyspaceName
            );
            session.execute(createMessagesTable);

            System.out.println("✓ Cassandra keyspace and tables initialized successfully");
        } catch (Exception e) {
            System.err.println("⚠ Warning: Could not initialize Cassandra schema: " + e.getMessage());
            System.err.println("⚠ This is expected if Cassandra is not running. Message persistence will be unavailable.");
            // Don't throw exception - allow app to start without Cassandra
        }
    }
}
