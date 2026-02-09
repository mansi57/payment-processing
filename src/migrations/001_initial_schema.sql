-- Payment Processing Database Schema
-- Initial migration for PostgreSQL

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create ENUM types
CREATE TYPE order_status AS ENUM (
  'pending',
  'processing', 
  'completed',
  'failed',
  'cancelled',
  'refunded',
  'partially_refunded'
);

CREATE TYPE transaction_type AS ENUM (
  'purchase',
  'authorize',
  'capture',
  'void',
  'refund'
);

CREATE TYPE transaction_status AS ENUM (
  'pending',
  'processing',
  'succeeded',
  'failed',
  'cancelled',
  'expired'
);

CREATE TYPE refund_status AS ENUM (
  'pending',
  'processing',
  'succeeded',
  'failed',
  'cancelled'
);

CREATE TYPE payment_method_type AS ENUM (
  'credit_card',
  'bank_account'
);

CREATE TYPE account_type AS ENUM (
  'checking',
  'savings'
);

-- Customers table
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(20),
  address_street VARCHAR(255),
  address_city VARCHAR(100),
  address_state VARCHAR(50),
  address_postal_code VARCHAR(20),
  address_country VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for customers
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_name ON customers(first_name, last_name);
CREATE INDEX idx_customers_created_at ON customers(created_at);
CREATE INDEX idx_customers_metadata ON customers USING GIN (metadata);

-- Orders table
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  amount DECIMAL(15,2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  status order_status NOT NULL DEFAULT 'pending',
  description TEXT,
  metadata JSONB,
  correlation_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for orders
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_amount ON orders(amount);
CREATE INDEX idx_orders_currency ON orders(currency);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_correlation_id ON orders(correlation_id);
CREATE INDEX idx_orders_metadata ON orders USING GIN (metadata);

-- Transactions table
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  transaction_id VARCHAR(255) NOT NULL, -- External payment processor transaction ID
  type transaction_type NOT NULL,
  amount DECIMAL(15,2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  status transaction_status NOT NULL DEFAULT 'pending',
  auth_code VARCHAR(50),
  response_code VARCHAR(10),
  response_message TEXT,
  gateway_response JSONB,
  payment_method_type payment_method_type NOT NULL,
  payment_method_last4 VARCHAR(4),
  payment_method_brand VARCHAR(50),
  payment_method_expiration_month INTEGER,
  payment_method_expiration_year INTEGER,
  payment_method_bank_name VARCHAR(100),
  payment_method_account_type account_type,
  processor_response JSONB,
  failure_reason TEXT,
  correlation_id VARCHAR(255),
  request_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for transactions
CREATE INDEX idx_transactions_order_id ON transactions(order_id);
CREATE INDEX idx_transactions_transaction_id ON transactions(transaction_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_amount ON transactions(amount);
CREATE INDEX idx_transactions_currency ON transactions(currency);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_transactions_correlation_id ON transactions(correlation_id);
CREATE INDEX idx_transactions_request_id ON transactions(request_id);
CREATE INDEX idx_transactions_payment_method_type ON transactions(payment_method_type);
CREATE INDEX idx_transactions_gateway_response ON transactions USING GIN (gateway_response);
CREATE INDEX idx_transactions_processor_response ON transactions USING GIN (processor_response);

-- Refunds table
CREATE TABLE refunds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  original_transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  amount DECIMAL(15,2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  reason TEXT,
  status refund_status NOT NULL DEFAULT 'pending',
  refund_transaction_id VARCHAR(255), -- External refund transaction ID
  correlation_id VARCHAR(255),
  request_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for refunds
CREATE INDEX idx_refunds_transaction_id ON refunds(transaction_id);
CREATE INDEX idx_refunds_original_transaction_id ON refunds(original_transaction_id);
CREATE INDEX idx_refunds_status ON refunds(status);
CREATE INDEX idx_refunds_amount ON refunds(amount);
CREATE INDEX idx_refunds_currency ON refunds(currency);
CREATE INDEX idx_refunds_created_at ON refunds(created_at);
CREATE INDEX idx_refunds_correlation_id ON refunds(correlation_id);
CREATE INDEX idx_refunds_request_id ON refunds(request_id);

-- Audit logs table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL,
  old_values JSONB,
  new_values JSONB,
  user_id VARCHAR(255),
  correlation_id VARCHAR(255),
  request_id VARCHAR(255),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for audit logs
CREATE INDEX idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_correlation_id ON audit_logs(correlation_id);
CREATE INDEX idx_audit_logs_request_id ON audit_logs(request_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);

-- Migration tracking table
CREATE TABLE schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  checksum VARCHAR(64)
);

-- Functions for automatic updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at columns
CREATE TRIGGER update_customers_updated_at 
  BEFORE UPDATE ON customers 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at 
  BEFORE UPDATE ON orders 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at 
  BEFORE UPDATE ON transactions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_refunds_updated_at 
  BEFORE UPDATE ON refunds 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Views for common queries
CREATE VIEW transaction_summary AS
SELECT 
  t.id,
  t.transaction_id,
  t.type,
  t.amount,
  t.currency,
  t.status,
  t.created_at,
  o.id as order_id,
  c.id as customer_id,
  c.email as customer_email,
  c.first_name || ' ' || c.last_name as customer_name
FROM transactions t
JOIN orders o ON t.order_id = o.id
JOIN customers c ON o.customer_id = c.id;

CREATE VIEW order_summary AS
SELECT 
  o.id,
  o.amount,
  o.currency,
  o.status,
  o.description,
  o.created_at,
  c.id as customer_id,
  c.email as customer_email,
  c.first_name || ' ' || c.last_name as customer_name,
  COUNT(t.id) as transaction_count,
  SUM(CASE WHEN t.status = 'succeeded' THEN t.amount ELSE 0 END) as successful_amount,
  SUM(CASE WHEN t.type = 'refund' AND t.status = 'succeeded' THEN t.amount ELSE 0 END) as refunded_amount
FROM orders o
JOIN customers c ON o.customer_id = c.id
LEFT JOIN transactions t ON o.id = t.order_id
GROUP BY o.id, c.id, c.email, c.first_name, c.last_name;

-- Performance and monitoring views
CREATE VIEW database_stats AS
SELECT 
  'customers' as table_name,
  COUNT(*) as record_count,
  pg_size_pretty(pg_total_relation_size('customers')) as table_size
FROM customers
UNION ALL
SELECT 
  'orders' as table_name,
  COUNT(*) as record_count,
  pg_size_pretty(pg_total_relation_size('orders')) as table_size
FROM orders
UNION ALL
SELECT 
  'transactions' as table_name,
  COUNT(*) as record_count,
  pg_size_pretty(pg_total_relation_size('transactions')) as table_size
FROM transactions
UNION ALL
SELECT 
  'refunds' as table_name,
  COUNT(*) as record_count,
  pg_size_pretty(pg_total_relation_size('refunds')) as table_size
FROM refunds
UNION ALL
SELECT 
  'audit_logs' as table_name,
  COUNT(*) as record_count,
  pg_size_pretty(pg_total_relation_size('audit_logs')) as table_size
FROM audit_logs;

-- Insert initial migration record
INSERT INTO schema_migrations (version, checksum) 
VALUES ('001_initial_schema', md5('001_initial_schema'));

-- Grant permissions (adjust as needed for your environment)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO payment_app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO payment_app_user;




