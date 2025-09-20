# 📬 Postman Collections for Payment Processing API

This directory contains comprehensive Postman collections for testing the advanced payment processing system.

## 📁 **Available Collections**

### **🚀 Advanced Payment Processing API (RECOMMENDED)**
**File:** `Advanced-Payment-Processing-API.postman_collection.json`

**Complete collection with 90+ requests covering:**
- ✅ **Payment Processing** - Purchase, authorize, capture, refund, void
- ✅ **Database Operations** - Customer, order, and transaction persistence  
- ✅ **Distributed Tracing** - Correlation IDs and end-to-end request tracking
- ✅ **Subscription Management** - Plans, subscriptions, lifecycle management
- ✅ **Webhook Infrastructure** - Endpoints, events, delivery management
- ✅ **Idempotency Testing** - Safe retry mechanisms
- ✅ **Security Features** - Signature validation, authentication
- ✅ **End-to-End Testing** - Complete integration scenarios

### **📦 Payment Processing API (Legacy)**
**File:** `Payment-Processing-API.postman_collection.json`

**Basic collection with core payment flows:**
- Payment processing (purchase, authorize, capture)
- Refunds and voids
- Basic health checks

*Note: For new projects, use the Advanced collection above.*

---

## 🌍 **Environment Files**

### **Advanced Payment API Environment**
**File:** `Advanced-Payment-API-Environment.postman_environment.json`

**Contains:**
- Base URL configuration
- Test card details
- Default customer and plan IDs
- Webhook test URLs
- Environment-specific settings

### **Legacy Environment**
**File:** `Payment-API-Development.postman_environment.json`

*Basic environment for legacy collection*

---

## 🛠️ **Quick Setup**

### **1. Import Collections**
1. Open Postman
2. Click **Import**
3. Select **Advanced-Payment-Processing-API.postman_collection.json**
4. Select **Advanced-Payment-API-Environment.postman_environment.json**

### **2. Set Environment**
1. Click environment dropdown (top right)
2. Select **"Advanced Payment API - Development"**
3. Verify `base_url` is set to `http://localhost:3000`

### **3. Start Testing**
1. Ensure your server is running: `npm start`
2. Run **System Health Check** first
3. Follow the workflows in the testing guide

---

## 📖 **Testing Guide**

**Complete testing instructions:** `ADVANCED_TESTING_GUIDE.md`

**Quick Test Sequence:**
1. 🏥 **Health Checks** → Verify all services
2. 🗄️ **Database Operations** → Test customer, order & transaction persistence
3. 🔍 **Distributed Tracing** → Verify correlation ID tracking
4. 💳 **Payment Processing** → Test core payment flows
5. 🔒 **Idempotency** → Test safe retry mechanisms
6. 📋 **Subscription Plans** → Create and manage plans
7. 🔄 **Subscriptions** → Full subscription lifecycle
8. 📡 **Webhooks** → Event delivery and monitoring

---

## 🎯 **Collection Features**

### **🤖 Automated Variable Management**
- **Auto-saves IDs** from responses (customer_id, order_id, database_transaction_id, plan_id, subscription_id, webhook_endpoint_id)
- **Pre-request scripts** generate test data and correlation IDs
- **Test scripts** validate responses and save variables for chaining requests

### **📝 Comprehensive Documentation**
- **Detailed descriptions** for every request
- **Usage examples** with sample payloads
- **Expected responses** documented

### **🧪 Test Scenarios**
- **Happy path testing** - Normal operation flows
- **Error handling** - Invalid data and edge cases
- **Integration testing** - End-to-end scenarios
- **Security testing** - Authentication and validation

### **🔄 Workflow Organization**
- **Logical grouping** by feature area
- **Sequential testing** within each group
- **Cross-feature testing** for integration scenarios

---

## 💡 **Usage Tips**

### **For Developers**
- Start with health checks to verify server status
- Use the automated variable saving to chain requests
- Check test scripts for response validation examples
- Monitor webhook deliveries using webhook.site

### **For QA Testing**
- Follow the complete testing guide workflow
- Test both success and failure scenarios
- Verify webhook events are triggered correctly
- Test idempotency with duplicate requests

### **For Integration**
- Use webhook endpoints to test event handling
- Test subscription flows for recurring billing
- Verify signature validation for security
- Test error handling and retry mechanisms

---

## 🔧 **Customization**

### **Environment Variables**
Modify the environment file to match your setup:
```json
{
  "key": "base_url",
  "value": "https://your-api-domain.com"
}
```

### **Request Headers**
Add authentication headers as needed:
```json
{
  "key": "Authorization",
  "value": "Bearer {{auth_token}}"
}
```

### **Test Data**
Update test payloads in request bodies:
- Customer information
- Payment amounts
- Plan configurations
- Webhook URLs

---

## 🐛 **Troubleshooting**

### **Common Issues**

**Server Not Responding:**
```bash
# Check server status
curl http://localhost:3000/health

# Restart server
npm start
```

**Variables Not Saving:**
- Check test scripts in requests
- Verify environment is selected
- Check console for script errors

**Webhook Deliveries Failing:**
- Verify webhook URL is accessible
- Check webhook.site for fresh URL
- Monitor endpoint health status

### **Getting Help**

1. **Check Logs** - Server console output
2. **Postman Console** - View request/response details
3. **Test Results** - Check automated test outcomes
4. **Documentation** - Refer to ADVANCED_TESTING_GUIDE.md

---

## 📊 **Testing Metrics**

Track your testing progress:

### **Coverage Checklist**
- [ ] **Basic Payments** (5 requests)
- [ ] **Idempotency** (3 requests)
- [ ] **Subscription Plans** (4 requests)
- [ ] **Subscription Management** (6 requests)
- [ ] **Webhook Management** (7 requests)
- [ ] **Webhook Security** (2 requests)
- [ ] **Event Monitoring** (3 requests)
- [ ] **End-to-End** (2 requests)

### **Success Criteria**
- ✅ All health checks pass
- ✅ Payment flows complete successfully
- ✅ Idempotency prevents duplicates
- ✅ Subscriptions progress through lifecycle
- ✅ Webhooks deliver reliably
- ✅ Security validation works

---

## 🔄 **Updates and Maintenance**

### **Collection Versioning**
- **v1.0** - Basic payment flows
- **v2.0** - Advanced features (subscriptions, webhooks, idempotency)

### **Environment Updates**
- Test URLs and credentials
- New feature toggles
- Performance settings

### **Documentation**
- Keep testing guide updated
- Document new test scenarios
- Update troubleshooting sections

---

**Happy Testing! 🚀**

For detailed testing workflows, see `ADVANCED_TESTING_GUIDE.md`


