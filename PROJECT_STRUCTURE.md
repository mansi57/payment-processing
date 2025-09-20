# 📁 Project Structure Guide

A comprehensive guide to the Advanced Payment Processing System's architecture, folder organization, and key modules.

---

## 🏗️ **Architecture Overview**

The project follows a **layered architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER                      │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐  │
│  │   API Routes    │ │   Middleware    │ │   Controllers   │  │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│                       BUSINESS LAYER                           │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐  │
│  │    Services     │ │  Event Emitter  │ │   Processors    │  │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                             │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐  │
│  │  Repositories   │ │   Database      │ │   Queue Store   │  │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📂 **Root Directory Structure**

```
payment-processing/
├── 📁 src/                          # Source code
├── 📁 dist/                         # Compiled JavaScript (generated)
├── 📁 node_modules/                 # Dependencies (generated)
├── 📁 postman/                      # API testing collection
├── 📁 tests/                        # Test files
├── 📁 docs/                         # Documentation
├── 📁 logs/                         # Application logs (generated)
├── 📄 package.json                  # Project dependencies & scripts
├── 📄 tsconfig.json                 # TypeScript configuration
├── 📄 .env                          # Environment variables
├── 📄 .gitignore                    # Git ignore patterns
├── 📄 README.md                     # Project documentation
├── 📄 PROJECT_STRUCTURE.md          # This file
└── 📄 ecosystem.config.js           # PM2 configuration
```

---

## 🔧 **Source Code Structure (`src/`)**

### **Core Application Files**

```
src/
├── 📄 app.ts                        # Express application setup
├── 📄 index.ts                      # Application entry point
└── 📄 server.ts                     # HTTP server configuration
```

#### **📄 `app.ts`** - *Express Application Setup*
- **Purpose**: Main Express application configuration
- **Responsibilities**:
  - Middleware registration (CORS, security, parsing)
  - Route mounting and organization
  - Error handling setup
  - Health check endpoints
  - Distributed tracing integration

#### **📄 `index.ts`** - *Application Entry Point*
- **Purpose**: Application startup and lifecycle management
- **Responsibilities**:
  - Database initialization and migrations
  - Queue system startup
  - Graceful shutdown handling
  - Environment validation
  - Server startup orchestration

---

### **Configuration (`src/config/`)**

```
src/config/
├── 📄 index.ts                      # Main configuration
├── 📄 queue.config.ts               # Queue system configuration
└── 📄 database.config.ts            # Database configuration
```

#### **📄 `config/index.ts`** - *Main Configuration Hub*
- **Purpose**: Centralized application configuration
- **Key Features**:
  - Environment variable loading
  - Configuration validation
  - Type-safe configuration objects
  - Environment-specific settings

#### **📄 `config/queue.config.ts`** - *Queue System Configuration*
- **Purpose**: Bull queue and Redis configuration
- **Key Features**:
  - Queue naming conventions
  - Job priority levels
  - Retry policies and backoff strategies
  - Redis connection settings
  - In-memory fallback configuration

---

### **Middleware (`src/middleware/`)**

```
src/middleware/
├── 📄 correlationId.ts             # Distributed tracing middleware
├── 📄 errorHandler.ts               # Global error handling
├── 📄 validation.ts                 # Request validation
├── 📄 authentication.ts             # Authentication middleware
└── 📄 rateLimiting.ts              # API rate limiting
```

#### **📄 `middleware/correlationId.ts`** - *Distributed Tracing*
- **Purpose**: Request correlation and tracing
- **Key Features**:
  - Correlation ID generation/propagation
  - Request lifecycle tracking
  - Performance monitoring
  - Tracing context management

#### **📄 `middleware/errorHandler.ts`** - *Error Management*
- **Purpose**: Centralized error handling
- **Key Features**:
  - Structured error responses
  - Error logging with correlation IDs
  - HTTP status code mapping
  - Development vs production error details

---

### **Routes (`src/routes/`)**

```
src/routes/
├── 📄 payments.ts                   # Payment processing endpoints
├── 📄 subscriptions.ts              # Subscription management
├── 📄 webhooks.ts                   # Webhook management
├── 📄 database.ts                   # Database CRUD operations
├── 📄 queues-simple.ts              # Queue management
└── 📄 tracing.ts                    # Distributed tracing endpoints
```

#### **📄 `routes/payments.ts`** - *Payment Processing API*
- **Purpose**: Core payment operations
- **Endpoints**:
  - `POST /api/payments/purchase` - Process payment
  - `POST /api/payments/authorize` - Authorize payment
  - `POST /api/payments/capture` - Capture authorized payment
  - `POST /api/payments/void` - Void payment
  - `POST /api/payments/refund` - Refund payment

#### **📄 `routes/webhooks.ts`** - *Webhook Management API*
- **Purpose**: Webhook endpoint management
- **Endpoints**:
  - `POST /api/webhooks/endpoints` - Create webhook
  - `GET /api/webhooks/endpoints` - List webhooks
  - `PUT /api/webhooks/endpoints/:id` - Update webhook
  - `DELETE /api/webhooks/endpoints/:id` - Delete webhook

#### **📄 `routes/database.ts`** - *Database Operations API*
- **Purpose**: Direct database CRUD operations
- **Endpoints**:
  - Customer management (`/api/database/customers/*`)
  - Order management (`/api/database/orders/*`)
  - Transaction management (`/api/database/transactions/*`)

#### **📄 `routes/queues-simple.ts`** - *Queue Management API*
- **Purpose**: Queue monitoring and management
- **Endpoints**:
  - `GET /api/queues/health` - Queue system health
  - `GET /api/queues/stats` - Queue statistics
  - `GET /api/queues/info` - System information

---

### **Services (`src/services/`)**

```
src/services/
├── 📄 paymentService.ts             # Payment processing logic
├── 📄 mockPaymentService.ts         # Mock payment implementation
├── 📄 authorizeNetService.ts        # Authorize.Net integration
├── 📄 webhookService.ts             # Webhook delivery logic
├── 📄 subscriptionService.ts        # Subscription management
├── 📄 databaseService.ts            # Database connection management
├── 📄 migrationService.ts           # Database migration service
├── 📄 storageService.ts             # Data storage abstraction
├── 📄 queueManager.ts               # Queue management service
├── 📄 eventEmitter.ts               # Event emission service
└── 📁 processors/                   # Background job processors
    ├── 📄 webhookProcessor.ts       # Webhook delivery processor
    └── 📄 databaseEventProcessor.ts # Database event processor
```

#### **📄 `services/paymentService.ts`** - *Payment Processing Hub*
- **Purpose**: Core payment processing logic
- **Key Features**:
  - Payment gateway abstraction
  - Transaction state management
  - Error handling and validation
  - Integration with multiple payment providers

#### **📄 `services/queueManager.ts`** - *Queue System Management*
- **Purpose**: Bull queue management and orchestration
- **Key Features**:
  - Queue creation and configuration
  - Job scheduling and processing
  - Health monitoring
  - Dead letter queue management
  - Redis/in-memory queue support

#### **📄 `services/eventEmitter.ts`** - *Event-Driven Architecture*
- **Purpose**: Business event emission and routing
- **Key Features**:
  - Database change events
  - Payment lifecycle events
  - Notification events
  - Event correlation and tracing

#### **📄 `services/processors/webhookProcessor.ts`** - *Webhook Delivery*
- **Purpose**: Asynchronous webhook delivery
- **Key Features**:
  - Exponential backoff retry logic
  - Signature generation and validation
  - Delivery status tracking
  - Failed delivery handling

#### **📄 `services/processors/databaseEventProcessor.ts`** - *Database Events*
- **Purpose**: Database change event processing
- **Key Features**:
  - Entity lifecycle event handling
  - Webhook trigger logic
  - Business rule processing
  - Event correlation

---

### **Repositories (`src/repositories/`)**

```
src/repositories/
├── 📄 customerRepository.ts         # Customer data access
├── 📄 orderRepository.ts            # Order data access
├── 📄 transactionRepository.ts      # Transaction data access
└── 📄 refundRepository.ts           # Refund data access
```

#### **Repository Pattern Implementation**
- **Purpose**: Data access abstraction layer
- **Key Features**:
  - Database query abstraction
  - Entity mapping
  - Transaction management
  - Connection pooling integration

---

### **Types (`src/types/`)**

```
src/types/
├── 📄 payment.types.ts              # Payment-related types
├── 📄 subscription.types.ts         # Subscription types
├── 📄 webhook.types.ts              # Webhook types
├── 📄 database.types.ts             # Database entity types
├── 📄 queue.types.ts                # Queue and event types
└── 📄 tracing.types.ts              # Distributed tracing types
```

#### **Type System Organization**
- **Purpose**: TypeScript type definitions and interfaces
- **Key Features**:
  - Strong typing for all entities
  - API request/response types
  - Event payload definitions
  - Configuration interfaces

---

### **Utilities (`src/utils/`)**

```
src/utils/
├── 📄 logger.ts                     # Basic logging utility
├── 📄 tracingLogger.ts              # Distributed tracing logger
├── 📄 validation.ts                 # Input validation helpers
├── 📄 advancedValidation.ts         # Advanced validation schemas
├── 📄 encryption.ts                 # Encryption utilities
└── 📄 helpers.ts                    # General helper functions
```

#### **📄 `utils/tracingLogger.ts`** - *Enhanced Logging*
- **Purpose**: Distributed tracing-aware logging
- **Key Features**:
  - Automatic correlation ID inclusion
  - Structured JSON logging
  - Performance metrics
  - Service call tracking

---

### **Database Migrations (`src/migrations/`)**

```
src/migrations/
└── 📄 001_initial_schema.sql        # Initial database schema
```

#### **Migration System**
- **Purpose**: Database schema version control
- **Key Features**:
  - Automated schema deployment
  - Version tracking
  - Rollback capabilities
  - Environment-specific migrations

---

## 📁 **Supporting Directories**

### **Postman Collection (`postman/`)**

```
postman/
├── 📄 Advanced-Payment-Processing-API.postman_collection.json
├── 📄 Advanced-Payment-API-Environment.postman_environment.json
├── 📄 README.md                     # Collection usage guide
└── 📄 ADVANCED_TESTING_GUIDE.md     # Testing methodology
```

#### **Purpose**: Comprehensive API testing suite
- **90+ pre-configured requests**
- **Automated variable management**
- **Complete workflow testing**
- **Environment configurations**

### **Tests (`tests/`)**

```
tests/
├── 📁 unit/                         # Unit tests
├── 📁 integration/                  # Integration tests
├── 📁 e2e/                         # End-to-end tests
└── 📁 load/                        # Load testing scripts
```

### **Documentation (`docs/`)**

```
docs/
├── 📄 DISTRIBUTED_TRACING_SUMMARY.md
├── 📄 QUEUE_BASED_WEBHOOK_SUMMARY.md
├── 📄 COMPREHENSIVE_DATABASE_TEST_SUMMARY.md
├── 📄 DATABASE_SETUP.md
└── 📄 API_DOCUMENTATION.md
```

---

## 🔄 **Data Flow Architecture**

### **Request Processing Flow**

```
1. HTTP Request
   ↓
2. Correlation Middleware (ID generation)
   ↓
3. Authentication & Validation
   ↓
4. Route Handler
   ↓
5. Service Layer (Business Logic)
   ↓
6. Repository Layer (Data Access)
   ↓
7. Event Emission (Background Processing)
   ↓
8. Response with Correlation ID
```

### **Background Processing Flow**

```
1. Event Emission
   ↓
2. Queue Assignment
   ↓
3. Background Worker Processing
   ↓
4. Webhook Delivery (if applicable)
   ↓
5. Status Updates & Logging
```

---

## 🎯 **Key Design Patterns**

### **1. Repository Pattern**
- **Location**: `src/repositories/`
- **Purpose**: Data access abstraction
- **Benefits**: Database agnostic, testable, maintainable

### **2. Service Layer Pattern**
- **Location**: `src/services/`
- **Purpose**: Business logic encapsulation
- **Benefits**: Reusable, testable, separation of concerns

### **3. Event-Driven Architecture**
- **Location**: `src/services/eventEmitter.ts`
- **Purpose**: Decoupled, scalable processing
- **Benefits**: Asynchronous, fault-tolerant, scalable

### **4. Queue Pattern**
- **Location**: `src/services/queueManager.ts`
- **Purpose**: Background job processing
- **Benefits**: Reliable, scalable, fault-tolerant

### **5. Middleware Pattern**
- **Location**: `src/middleware/`
- **Purpose**: Cross-cutting concerns
- **Benefits**: Reusable, composable, maintainable

---

## 📊 **Configuration Management**

### **Environment-Based Configuration**

```
Development:
├── In-memory queues
├── Debug logging
├── Mock payment services
└── Development database

Production:
├── Redis queues
├── Error-only logging
├── Real payment gateways
└── Production database
```

### **Configuration Files**
- **`.env`** - Environment variables
- **`src/config/index.ts`** - Configuration validation
- **`ecosystem.config.js`** - PM2 process management

---

## 🚀 **Scalability Features**

### **Horizontal Scaling**
- **Queue Workers**: Multiple concurrent workers
- **Database Pooling**: Connection pool management
- **Load Balancing**: Multiple app instances
- **Event Distribution**: Queue-based event processing

### **Performance Optimization**
- **Connection Pooling**: Efficient database connections
- **Background Processing**: Asynchronous operations
- **Caching Strategy**: In-memory and distributed caching
- **Query Optimization**: Indexed database queries

---

## 🔒 **Security Architecture**

### **Security Layers**
- **Authentication**: Token-based authentication
- **Authorization**: Role-based access control
- **Input Validation**: Comprehensive request validation
- **Rate Limiting**: API rate limiting
- **Encryption**: Data encryption at rest and in transit

### **Security Files**
- **`src/middleware/authentication.ts`** - Auth middleware
- **`src/utils/encryption.ts`** - Encryption utilities
- **`src/middleware/rateLimiting.ts`** - Rate limiting

---

## 📈 **Monitoring & Observability**

### **Distributed Tracing**
- **Correlation IDs**: End-to-end request tracking
- **Performance Metrics**: Request duration monitoring
- **Service Call Tracking**: Inter-service communication logging

### **Logging Strategy**
- **Structured Logging**: JSON-formatted logs
- **Log Levels**: Error, warn, info, debug
- **Correlation Context**: Automatic ID propagation

### **Health Monitoring**
- **Application Health**: `/health` endpoint
- **Database Health**: Connection and query monitoring
- **Queue Health**: Queue status and performance metrics

---

## 🛠️ **Development Workflow**

### **Build Process**
1. **TypeScript Compilation**: `src/` → `dist/`
2. **Dependency Resolution**: Package management
3. **Environment Validation**: Configuration checking
4. **Database Migrations**: Schema updates

### **Testing Strategy**
1. **Unit Tests**: Individual component testing
2. **Integration Tests**: Component interaction testing
3. **End-to-End Tests**: Complete workflow testing
4. **Load Tests**: Performance and scalability testing

---

**🎉 This modular architecture ensures scalability, maintainability, and enterprise-grade reliability for your payment processing system!**
