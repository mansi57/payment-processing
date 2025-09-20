# 🗄️ **PostgreSQL Database Setup Guide**

This guide will help you set up PostgreSQL for the payment processing system.

---

## 🚀 **Quick Setup Options**

### **Option 1: Docker (Recommended)**

```bash
# Run PostgreSQL in Docker
docker run --name payment-postgres \
  -e POSTGRES_DB=payment_processing \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  -d postgres:15

# Verify container is running
docker ps
```

### **Option 2: Local Installation**

#### **Windows (using Chocolatey)**
```powershell
# Install PostgreSQL
choco install postgresql

# Start PostgreSQL service
net start postgresql-x64-15
```

#### **macOS (using Homebrew)**
```bash
# Install PostgreSQL
brew install postgresql

# Start PostgreSQL service
brew services start postgresql
```

#### **Ubuntu/Debian**
```bash
# Install PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

---

## 🔧 **Database Configuration**

### **1. Create Database and User**

```sql
-- Connect to PostgreSQL as superuser
psql -U postgres

-- Create database
CREATE DATABASE payment_processing;

-- Create user (optional)
CREATE USER payment_app WITH ENCRYPTED PASSWORD 'app_password';

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE payment_processing TO payment_app;

-- Switch to the database
\c payment_processing;

-- Grant schema permissions
GRANT ALL ON SCHEMA public TO payment_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO payment_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO payment_app;

-- Exit psql
\q
```

### **2. Environment Configuration**

Create a `.env` file in the project root:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=payment_processing
DB_USERNAME=postgres
DB_PASSWORD=password
DB_SSL=false
DB_MAX_CONNECTIONS=20
DB_CONNECTION_TIMEOUT=30000
DB_IDLE_TIMEOUT=30000

# Application Configuration
PORT=3000
NODE_ENV=development
USE_MOCK_PAYMENT_SERVICE=true

# Authorize.Net Configuration (for testing)
AUTHNET_API_LOGIN_ID=test_api_login_id
AUTHNET_TRANSACTION_KEY=test_transaction_key
AUTHNET_ENVIRONMENT=sandbox
AUTHNET_CLIENT_KEY=test_client_key

# Security
API_SECRET=your-secret-key-change-in-production

# Logging
LOG_LEVEL=info
LOG_FILE=logs/app.log
```

---

## 🏃‍♂️ **Running the Application**

### **1. Install Dependencies**
```bash
npm install
```

### **2. Build the Application**
```bash
npm run build
```

### **3. Start the Application**
```bash
npm start
```

The application will:
1. **Connect to PostgreSQL**
2. **Run database migrations automatically**
3. **Start the HTTP server on port 3000**

---

## ✅ **Verification Steps**

### **1. Check Application Health**
```bash
curl http://localhost:3000/health
```

Expected response should include:
```json
{
  "success": true,
  "services": {
    "database": "operational"
  },
  "database": {
    "connected": true,
    "host": "localhost",
    "database": "payment_processing"
  }
}
```

### **2. Check Database Health**
```bash
curl http://localhost:3000/api/database/health
```

### **3. Check Migration Status**
```bash
curl http://localhost:3000/api/database/migrations
```

### **4. View Database Statistics**
```bash
curl http://localhost:3000/api/database/statistics
```

---

## 🗂️ **Database Schema Overview**

The system creates the following tables:

### **Core Tables**
- **`customers`** - Customer information
- **`orders`** - Order records with amounts and status
- **`transactions`** - Payment transactions with gateway details
- **`refunds`** - Refund records linked to transactions

### **System Tables**
- **`audit_logs`** - Audit trail for all changes
- **`schema_migrations`** - Migration tracking

### **Relationships**
```
customers (1) → (many) orders
orders (1) → (many) transactions  
transactions (1) → (many) refunds
```

---

## 🔍 **Database API Endpoints**

### **Health & Monitoring**
- `GET /api/database/health` - Database health check
- `GET /api/database/statistics` - Database statistics
- `GET /api/database/migrations` - Migration status

### **Data Access**
- `GET /api/database/customers` - List customers (paginated)
- `GET /api/database/customers/:id` - Get customer details
- `GET /api/database/orders` - List orders (paginated, filtered)
- `GET /api/database/orders/:id` - Get order with transactions
- `GET /api/database/transactions` - List transactions (paginated, filtered)
- `GET /api/database/transactions/:id` - Get transaction with refunds

### **Query Parameters**
- **Pagination**: `page`, `limit`, `sortBy`, `sortOrder`
- **Filters**: `status`, `currency`, `customerId`, `correlationId`, `dateFrom`, `dateTo`

---

## 🧪 **Testing Database Integration**

### **1. Test Payment with Database Persistence**
```bash
curl -X POST http://localhost:3000/api/payments/purchase \
  -H "Content-Type: application/json" \
  -H "X-Correlation-ID: test-db-integration" \
  -d '{
    "amount": 100.00,
    "currency": "USD",
    "customerInfo": {
      "firstName": "Database",
      "lastName": "Test",
      "email": "db.test@example.com"
    },
    "paymentMethod": {
      "type": "credit_card",
      "cardNumber": "4111111111111111",
      "expirationDate": "1225",
      "cvv": "123"
    },
    "orderId": "DB-TEST-001",
    "description": "Database integration test"
  }'
```

### **2. Verify Data Persistence**
```bash
# Check if customer was created
curl "http://localhost:3000/api/database/customers?limit=5"

# Check if order was created
curl "http://localhost:3000/api/database/orders?limit=5"

# Check if transaction was created
curl "http://localhost:3000/api/database/transactions?limit=5"
```

### **3. Test Correlation ID Tracking**
```bash
# Search by correlation ID
curl "http://localhost:3000/api/database/orders?correlationId=test-db-integration"
curl "http://localhost:3000/api/database/transactions?correlationId=test-db-integration"
```

---

## 🛠️ **Troubleshooting**

### **Connection Issues**
```bash
# Check if PostgreSQL is running
# Windows
sc query postgresql-x64-15

# macOS/Linux
ps aux | grep postgres

# Docker
docker ps | grep postgres
```

### **Permission Issues**
```sql
-- Fix permissions
GRANT ALL PRIVILEGES ON DATABASE payment_processing TO postgres;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
```

### **Migration Issues**
```bash
# Check migration status
curl http://localhost:3000/api/database/migrations

# Force run migrations (if needed)
curl -X POST http://localhost:3000/api/database/migrations/run
```

### **Log Analysis**
```bash
# Check application logs
tail -f logs/combined.log | grep database

# Look for database-related errors
grep -i "database\|postgres\|migration" logs/error.log
```

---

## 📊 **Monitoring & Maintenance**

### **Database Performance**
- Monitor connection pool usage via `/api/database/health`
- Track slow queries in logs (>1000ms are logged as warnings)
- Monitor table sizes via `/api/database/statistics`

### **Data Retention**
- Audit logs should be archived periodically
- Consider partitioning for high-volume tables
- Implement automated backup strategies

### **Security Considerations**
- Use strong passwords in production
- Enable SSL/TLS connections
- Implement proper user roles and permissions
- Regular security updates

---

**🎯 The database integration is now complete and ready for production use!**


