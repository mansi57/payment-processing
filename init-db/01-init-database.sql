-- Database Initialization Script for Docker
-- This script is automatically executed when PostgreSQL container starts

-- Create the main database (if it doesn't exist from environment)
SELECT 'CREATE DATABASE payment_processing' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'payment_processing')\gexec

-- Connect to the payment_processing database
\c payment_processing;

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create ENUM types
DO $$ BEGIN
    CREATE TYPE transaction_status AS ENUM (
        'pending', 'processing', 'succeeded', 
        'failed', 'cancelled', 'refunded', 'partially_refunded'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE transaction_type AS ENUM (
        'purchase', 'authorize', 'capture', 
        'void', 'refund'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE order_status AS ENUM (
        'pending', 'processing', 'completed', 'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create schema_migrations table first (required by migration system)
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    checksum VARCHAR(64),
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Note: The actual table creation will be handled by the application's migration system
-- This script just ensures the database exists and has the required extensions and types

-- Insert a marker to indicate Docker initialization completed
INSERT INTO schema_migrations (version, checksum) 
VALUES ('docker_init', 'docker_initialization_marker')
ON CONFLICT (version) DO NOTHING;

-- Grant necessary permissions
GRANT ALL PRIVILEGES ON DATABASE payment_processing TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;

-- Log initialization completion
\echo 'Docker PostgreSQL initialization completed successfully!';
