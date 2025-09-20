# 🐳 Docker Deployment Guide

**Advanced Payment Processing System**  
*Complete containerized deployment with Docker Compose*

---

## 🚀 **Quick Start**

### **Prerequisites**
- Docker Engine 20.10+
- Docker Compose 2.0+
- At least 4GB RAM available
- Port availability: 3000, 5432, 6379, 8080, 9090, 3001

### **1. Environment Setup**
```bash
# Copy environment template
cp env.docker.example .env

# Edit environment variables (required)
nano .env
```

### **2. Build and Start Services**
```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f payment-api
```

### **3. Verify Deployment**
```bash
# Check service status
docker-compose ps

# Test API health
curl http://localhost:3000/health

# Access admin dashboard
open http://localhost:8080
```

---

## 📊 **Services Overview**

| Service | Port | Description | Health Check |
|---------|------|-------------|--------------|
| **payment-api** | 3000 | Main payment processing API | `/health` |
| **postgres** | 5432 | PostgreSQL database | Internal |
| **redis** | 6379 | Queue and caching | Internal |
| **queue-worker** | - | Background job processor | Internal |
| **admin-dashboard** | 8080 | Web admin interface | `/health` |
| **prometheus** | 9090 | Metrics collection | `/` |
| **grafana** | 3001 | Metrics visualization | `/` |

---

## 🔧 **Configuration**

### **Environment Variables**
```bash
# Database
DB_PASSWORD=payment_secure_2024
DB_USERNAME=postgres

# Redis  
REDIS_PASSWORD=redis_secure_2024

# Security
API_KEY=your_secure_api_key_here
JWT_SECRET=your_jwt_secret_32_chars_minimum
ENCRYPTION_KEY=your_encryption_key_32_chars_long

# Payment Gateway (Sandbox)
AUTHORIZE_NET_API_LOGIN_ID=your_sandbox_login
AUTHORIZE_NET_TRANSACTION_KEY=your_sandbox_key
```

### **Production Considerations**
```bash
# Use strong passwords
DB_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)

# Generate secure keys
JWT_SECRET=$(openssl rand -base64 32)
API_KEY=$(openssl rand -base64 32)
```

---

## 🎯 **Service Details**

### **Payment API Service**
```yaml
# Main application container
payment-api:
  - Handles all API requests
  - Distributed tracing enabled
  - Health monitoring
  - Auto-restart on failure
```

### **Database Service**
```yaml
# PostgreSQL with persistence
postgres:
  - Volume: postgres_data
  - Auto-initialization
  - Health checks enabled
  - Connection pooling
```

### **Queue System**
```yaml
# Redis + Background Workers
redis:
  - Persistent storage
  - Memory optimization
  - Password protected

queue-worker:
  - Webhook processing
  - Event handling
  - Retry mechanisms
```

### **Monitoring Stack**
```yaml
# Optional monitoring services
prometheus:
  - Profile: monitoring
  - Metrics collection
  - Data retention: 200h

grafana:
  - Profile: monitoring  
  - Visualization dashboards
  - Admin user: admin
```

---

## 📝 **Common Operations**

### **Service Management**
```bash
# Start all services
docker-compose up -d

# Start specific service
docker-compose up -d payment-api

# Stop all services
docker-compose down

# Restart service
docker-compose restart payment-api

# View service logs
docker-compose logs -f payment-api

# Scale workers
docker-compose up -d --scale queue-worker=3
```

### **Data Management**
```bash
# Backup database
docker-compose exec postgres pg_dump -U postgres payment_processing > backup.sql

# Restore database
docker-compose exec -T postgres psql -U postgres payment_processing < backup.sql

# Clear Redis cache
docker-compose exec redis redis-cli -a $REDIS_PASSWORD FLUSHALL

# View database
docker-compose exec postgres psql -U postgres payment_processing
```

### **Monitoring**
```bash
# System status
docker-compose ps
docker-compose top

# Resource usage
docker stats

# Health checks
curl http://localhost:3000/health
curl http://localhost:8080/health
```

---

## 🔍 **Troubleshooting**

### **Common Issues**

#### **Database Connection Failed**
```bash
# Check PostgreSQL status
docker-compose logs postgres

# Verify environment variables
docker-compose config

# Reset database
docker-compose down
docker volume rm payment_processing_postgres_data
docker-compose up -d postgres
```

#### **API Not Responding**
```bash
# Check application logs
docker-compose logs -f payment-api

# Verify dependencies
docker-compose ps

# Restart with fresh build
docker-compose down
docker-compose build --no-cache payment-api
docker-compose up -d
```

#### **Queue Worker Issues**
```bash
# Check worker logs
docker-compose logs -f queue-worker

# Verify Redis connection
docker-compose exec redis redis-cli -a $REDIS_PASSWORD ping

# Restart workers
docker-compose restart queue-worker
```

#### **Port Conflicts**
```bash
# Check port usage
netstat -tulpn | grep :3000

# Modify docker-compose.yml ports
# Change "3000:3000" to "3001:3000"
```

---

## 🔒 **Security**

### **Production Security**
```yaml
# Network isolation
networks:
  payment_network:
    internal: true  # Disable external access

# Non-root users
user: "1001:1001"

# Secret management
secrets:
  db_password:
    file: ./secrets/db_password.txt
```

### **SSL/TLS Setup**
```bash
# Add SSL certificates
volumes:
  - ./certs:/etc/ssl/certs:ro

# Configure nginx SSL
# Update nginx.conf with SSL settings
```

---

## 📈 **Monitoring Setup**

### **Enable Monitoring Stack**
```bash
# Start with monitoring
docker-compose --profile monitoring up -d

# Access dashboards
open http://localhost:9090  # Prometheus
open http://localhost:3001  # Grafana (admin:admin_2024)
```

### **Custom Dashboards**
```bash
# Grafana dashboards in:
./grafana/dashboards/

# Prometheus alerts in:  
./prometheus/alerts/
```

---

## 🧪 **Testing**

### **API Testing**
```bash
# Health check
curl -X GET http://localhost:3000/health

# Database health  
curl -X GET http://localhost:3000/api/database/health

# Queue status
curl -X GET http://localhost:3000/api/queues/health

# Test payment (requires API key)
curl -X POST http://localhost:3000/api/payments/purchase \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key" \
  -d '{"amount": 99.99, "currency": "USD"}'
```

### **Load Testing**
```bash
# Install k6 (optional)
docker run --rm -i grafana/k6 run - <script.js

# Basic load test
for i in {1..100}; do
  curl -s http://localhost:3000/health > /dev/null &
done
```

---

## 🔄 **Updates & Maintenance**

### **Application Updates**
```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose build --no-cache
docker-compose up -d

# Check deployment
curl http://localhost:3000/health
```

### **Database Migrations**
```bash
# Migrations run automatically on startup
# Check migration status
curl http://localhost:3000/api/database/migrations
```

### **Backup Strategy**
```bash
# Automated backups (cron job)
0 2 * * * docker-compose exec postgres pg_dump -U postgres payment_processing > /backups/$(date +%Y%m%d).sql
```

---

## 📞 **Support**

### **Logs Location**
```bash
# Application logs
docker-compose logs payment-api

# Database logs  
docker-compose logs postgres

# All services
docker-compose logs
```

### **Health Check URLs**
- **API Health**: http://localhost:3000/health
- **Database Health**: http://localhost:3000/api/database/health
- **Queue Health**: http://localhost:3000/api/queues/health
- **Admin Dashboard**: http://localhost:8080

### **Metrics & Monitoring**
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001
- **API Metrics**: http://localhost:3000/metrics

---

**🎉 Your Advanced Payment Processing System is now fully containerized and ready for production deployment!**
