# 🚀 Advanced Payment Processing System

A comprehensive, enterprise-grade payment processing system with queue-based webhook delivery, distributed tracing, and PostgreSQL persistence.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-4.9%2B-blue.svg)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-13%2B-blue.svg)

## 📋 Features

### 💳 Payment Processing
- **Multi-Gateway Support**: Authorize.Net integration with mock service fallback
- **Payment Types**: Purchase, authorize, capture, void, refund operations
- **Recurring Billing**: Automated subscription management and billing cycles
- **Multi-Currency**: Support for various currencies and payment methods

### 🔄 Queue-Based Architecture
- **Event-Driven Processing**: Asynchronous webhook delivery with retry logic
- **5 Specialized Queues**: Webhook delivery, database events, payments, notifications, cleanup
- **Background Workers**: Concurrent job processing with exponential backoff
- **Dead Letter Queue**: Failed job recovery and analysis

### 🗄️ Data Persistence
- **PostgreSQL Database**: Robust data storage with connection pooling
- **Auto Migrations**: Automated schema versioning and updates
- **Complete CRUD**: Customer, order, and transaction management
- **Audit Logging**: Comprehensive audit trails for all operations

### 🔍 Observability
- **Distributed Tracing**: End-to-end request correlation with unique IDs
- **Structured Logging**: JSON-formatted logs with correlation context
- **Performance Monitoring**: Request duration tracking and slow query detection
- **Health Checks**: Real-time system health monitoring

## 🏗️ Architecture

```
API Gateway ──▶ Payment Processing App ──▶ Queue System ──▶ Background Workers
     │                    │                      │                │
     │                    ▼                      ▼                ▼
     │              PostgreSQL DB          Redis/Memory      Webhook Delivery
     │                    │                      │                │
     └────────────── Distributed Tracing ───────────────────────────┘
```

## 📋 Prerequisites

- **Node.js**: 16.0.0+
- **npm**: 8.0.0+
- **PostgreSQL**: 13.0+
- **Redis**: 6.0+ (optional, for production queues)

## 🗄️ Database Setup

### 1. Install PostgreSQL

**Windows:**
```bash
choco install postgresql
# Or download from: https://www.postgresql.org/download/windows/
```

**macOS:**
```bash
brew install postgresql
brew services start postgresql
```

**Linux:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### 2. Create Database

```sql
-- Connect as postgres user
psql -U postgres

-- Create database
CREATE DATABASE payment_processing;

-- Create user (optional)
CREATE USER payment_user WITH ENCRYPTED PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE payment_processing TO payment_user;

-- Exit
\q
```

### 3. Database Schema

The application automatically creates these tables on first run:
- `customers` - Customer profiles and information
- `orders` - Order details and status tracking  
- `transactions` - Payment transaction records
- `refunds` - Refund transaction records
- `audit_logs` - System audit trail
- `schema_migrations` - Database version control

## 📦 Installation & Setup

### 1. Clone and Install
```bash
git clone <repository-url>
cd payment-processing
npm install
```

### 2. Environment Configuration

Create `.env` file:
```env
# Application
NODE_ENV=development
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=payment_processing
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_SSL=false
DB_MAX_CONNECTIONS=20

# Queue System
QUEUE_DRIVER=memory  # Use 'redis' for production
REDIS_HOST=localhost
REDIS_PORT=6379

# Payment Gateway
AUTHNET_API_LOGIN_ID=your_api_login_id
AUTHNET_TRANSACTION_KEY=your_transaction_key
AUTHNET_ENVIRONMENT=sandbox

# Security
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

### 3. Build and Start

**Development:**
```bash
npm run build
npm run dev
```

**Production:**
```bash
npm run build
npm start
```

## 🚀 Running the Application

### Start Main Application
```bash
# Development with hot reload
npm run dev

# Production
npm start

# With PM2 (recommended for production)
npm install -g pm2
pm2 start ecosystem.config.js
```

### Verify Status
```bash
# Health check
curl http://localhost:3000/health

# Queue system status
curl http://localhost:3000/api/queues/health

# Database status
curl http://localhost:3000/api/database/health
```

## ⚙️ Background Workers & Queues

### Queue System
The application uses a sophisticated queue system with these queues:

- **📨 webhook-delivery** - Webhook delivery with retry logic
- **🗄️ database-events** - Database change events  
- **💳 payment-events** - Payment processing events
- **📢 notification-events** - Email, SMS, push notifications
- **🧹 cleanup-jobs** - Maintenance tasks

### Queue Configuration

**Development (In-Memory):**
```env
QUEUE_DRIVER=memory
```

**Production (Redis):**
```env
QUEUE_DRIVER=redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
```

### Queue Monitoring

```bash
# Queue health
curl http://localhost:3000/api/queues/health

# Queue statistics
curl http://localhost:3000/api/queues/stats

# System information
curl http://localhost:3000/api/queues/info
```

### Queue Management

```bash
# Pause queue
curl -X POST http://localhost:3000/api/queues/webhook-delivery/pause

# Resume queue  
curl -X POST http://localhost:3000/api/queues/webhook-delivery/resume

# Clear queue
curl -X DELETE http://localhost:3000/api/queues/webhook-delivery/clear
```

## 📚 API Documentation

### Base URL
```
Development: http://localhost:3000
Production: https://api.yourcompany.com
```

### Core Endpoints

#### Health & Monitoring
```http
GET  /health                    # Application health status
GET  /api/queues/health        # Queue system health
GET  /api/database/health      # Database health
GET  /api/tracing/stats        # Distributed tracing stats
```

#### Payment Processing
```http
POST /api/payments/purchase     # Process payment
POST /api/payments/authorize    # Authorize payment
POST /api/payments/capture      # Capture payment
POST /api/payments/void         # Void payment
POST /api/payments/refund       # Refund payment
```

#### Database Operations
```http
# Customers
POST /api/database/customers    # Create customer
GET  /api/database/customers    # List customers
GET  /api/database/customers/:id # Get customer

# Orders  
POST /api/database/orders       # Create order
GET  /api/database/orders       # List orders
GET  /api/database/orders/:id   # Get order

# Transactions
POST /api/database/transactions # Create transaction
GET  /api/database/transactions # List transactions
GET  /api/database/transactions/:id # Get transaction
```

#### Webhook Management
```http
POST /api/webhooks/endpoints    # Create webhook endpoint
GET  /api/webhooks/endpoints    # List endpoints
PUT  /api/webhooks/endpoints/:id # Update endpoint
DELETE /api/webhooks/endpoints/:id # Delete endpoint
```

### Request Headers
```http
Content-Type: application/json
X-Correlation-ID: unique-request-id
X-Source: your-application-name
Idempotency-Key: unique-operation-key (for payments)
```

### Response Format
```json
{
  "success": true,
  "data": {},
  "correlationId": "req_123456",
  "timestamp": "2025-09-20T10:30:00Z"
}
```

## 🧪 Testing

### Postman Collection
Import the included Postman collection:
```
postman/Advanced-Payment-Processing-API.postman_collection.json
postman/Advanced-Payment-API-Environment.postman_environment.json
```

Features:
- 90+ pre-configured requests
- Automated variable management  
- Complete workflow testing
- Environment configurations

### Running Tests
```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# End-to-end tests
npm run test:e2e
```

## 📊 Monitoring & Debugging

### Application Logs
```bash
# View logs
tail -f logs/app.log

# View error logs  
tail -f logs/error.log

# Search by correlation ID
grep "correlation-id" logs/app.log
```

### Performance Monitoring
```bash
# Tracing statistics
curl http://localhost:3000/api/tracing/stats

# Queue performance
curl http://localhost:3000/api/queues/stats

# Database statistics  
curl http://localhost:3000/api/database/statistics
```

### Debug Mode
```env
LOG_LEVEL=debug
NODE_ENV=development
```

## 🚀 Production Deployment

### Server Setup
```bash
# Install dependencies
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs postgresql redis-server

# Install PM2
npm install -g pm2
```

### Application Deployment
```bash
# Clone and build
git clone <repository-url>
cd payment-processing
npm ci --only=production
npm run build

# Configure environment
cp .env.example .env
# Edit .env with production values

# Start with PM2
pm2 start ecosystem.config.js --env production
```

### Environment Variables (Production)
```env
NODE_ENV=production
QUEUE_DRIVER=redis
DB_SSL=true
LOG_LEVEL=info
AUTHNET_ENVIRONMENT=production
```

## 🔧 Troubleshooting

### Common Issues

**Database Connection:**
```bash
# Check PostgreSQL
sudo systemctl status postgresql
psql -U postgres -h localhost -d payment_processing

# Check connection health
curl http://localhost:3000/api/database/health
```

**Queue Processing:**
```bash
# Check Redis (if using)
redis-cli ping

# Check queue health
curl http://localhost:3000/api/queues/health
```

**Application Startup:**
```bash
# Check build
npm run build

# Check logs
tail -f logs/error.log

# Verify environment
node -e "console.log(process.env.NODE_ENV)"
```

### Performance Issues

**Slow Queries:**
```sql
-- Enable query logging
ALTER SYSTEM SET log_statement = 'all';
SELECT pg_reload_conf();
```

**Memory Issues:**
```bash
# Monitor with PM2
pm2 monit

# Check Node.js memory
node --inspect dist/index.js
```

## 🛠️ Development

### Project Structure
```
src/
├── config/         # Configuration files
├── middleware/     # Express middleware  
├── routes/         # API routes
├── services/       # Business logic
├── types/          # TypeScript types
├── utils/          # Utility functions
└── app.ts         # Express app setup
```

### Development Commands
```bash
npm run dev         # Start with hot reload
npm run build:watch # Build with watch mode
npm run lint        # Lint code
npm run format      # Format code
npm test           # Run tests
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 📞 Support

- **Issues**: GitHub Issues
- **Documentation**: See `/docs` directory
- **Email**: support@yourcompany.com

---

**🎉 Your scalable payment processing system is ready for enterprise-level transactions!**