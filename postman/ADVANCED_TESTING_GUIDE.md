# 🚀 Advanced Payment Processing API - Postman Testing Guide

This guide provides comprehensive testing instructions for the advanced payment processing system with subscriptions, webhooks, and idempotency features.

## 📋 **Setup Instructions**

### **1. Import Collections and Environment**

1. **Import the Advanced Collection:**
   - File: `Advanced-Payment-Processing-API.postman_collection.json`
   - Contains 80+ requests organized by feature area

2. **Import the Environment:**
   - File: `Advanced-Payment-API-Environment.postman_environment.json`
   - Contains all necessary variables and test data

3. **Select Environment:**
   - Choose "Advanced Payment API - Development" environment
   - Verify `base_url` points to `http://localhost:3000`

### **2. Server Setup**

Ensure your server is running with advanced features:

```bash
# Start the server with all advanced features
npm start

# Verify all services are operational
curl http://localhost:3000/health
```

---

## 🧪 **Testing Workflows**

### **🏥 1. HEALTH CHECKS**

Start with health checks to verify all services are operational:

1. **System Health Check** - Overall system status
2. **Payment Service Health** - Payment processing status
3. **Subscription Service Health** - Subscription management status
4. **Webhook Service Health** - Webhook delivery status

**Expected Result:** All services should return "operational" status.

---

### **💳 2. BASIC PAYMENT PROCESSING**

Test core payment functionality:

#### **A. Purchase Payment Flow**
1. **Purchase Payment** - Complete payment (auth + capture)
   - Amount: $49.99
   - Test card: 4111111111111111
   - **Auto-saves:** `transaction_id` for subsequent tests

#### **B. Authorization/Capture Flow**
1. **Authorize Payment** - Hold funds
   - Amount: $75.00
   - **Auto-saves:** `transaction_id`
2. **Capture Payment** - Capture authorized funds
   - Uses saved `transaction_id`
   - Amount: $75.00 (or partial)

#### **C. Refund/Void Operations**
1. **Refund Payment** - Refund captured payment
   - Partial refund: $25.00
   - Include reason for refund
2. **Void Payment** - Cancel authorized payment
   - Include cancellation reason

---

### **🔒 3. IDEMPOTENCY TESTING**

Verify safe retry mechanisms:

#### **A. Generate Idempotency Key**
1. **Generate Idempotency Key** - Creates UUID for testing
   - **Auto-generates:** `idempotency_key` variable

#### **B. Idempotency Flow**
1. **First Idempotent Request** - Initial payment with idempotency key
   - Amount: $99.99
   - **Auto-saves:** `transaction_id`
2. **Duplicate Idempotent Request** - Same request with same key
   - **Expected:** Returns cached response with same `transaction_id`

**Key Testing Points:**
- ✅ First request creates new transaction
- ✅ Duplicate request returns same transaction ID
- ✅ Response time is faster for duplicate requests

---

### **📋 4. SUBSCRIPTION PLANS**

Test subscription plan management:

#### **A. Plan Creation**
1. **Create Basic Plan** - $9.99/month with 14-day trial
   - **Auto-saves:** `plan_id`
2. **Create Premium Plan** - $49.99/month with setup fee

#### **B. Plan Management**
1. **List All Plans** - View available plans
2. **Get Specific Plan** - Retrieve plan details

**Expected Results:**
- Plans created with correct pricing and intervals
- Trial periods and setup fees properly configured
- Metadata stored correctly

---

### **🔄 5. SUBSCRIPTION MANAGEMENT**

Test complete subscription lifecycle:

#### **A. Subscription Creation**
1. **Create Subscription** - Subscribe customer to plan
   - Uses saved `plan_id`
   - 7-day trial period
   - **Auto-saves:** `subscription_id`

#### **B. Subscription Operations**
1. **Get Subscription** - Retrieve subscription details
2. **Update Subscription** - Change quantity to 3
3. **Cancel Subscription (At Period End)** - Graceful cancellation
4. **Resume Subscription** - Reactivate cancelled subscription
5. **Cancel Subscription (Immediate)** - Immediate cancellation

**Key Testing Points:**
- ✅ Subscription status progression: trialing → active → canceled
- ✅ Quantity updates affect billing
- ✅ Trial periods work correctly
- ✅ Cancellation options work as expected

---

### **📡 6. WEBHOOK MANAGEMENT**

Test webhook infrastructure:

#### **A. Webhook Endpoint Setup**
1. **Create Webhook Endpoint** - Register webhook URL
   - URL: Use webhook.site for testing
   - Events: payment.succeeded, subscription.created, etc.
   - **Auto-saves:** `webhook_endpoint_id`

#### **B. Webhook Operations**
1. **List Webhook Endpoints** - View all endpoints
2. **Get Webhook Endpoint** - Retrieve endpoint details
3. **Update Webhook Endpoint** - Modify events or description
4. **Test Webhook Endpoint** - Send test event
5. **Get Webhook Endpoint Health** - Check delivery stats
6. **Delete Webhook Endpoint** - Remove endpoint

**Key Testing Points:**
- ✅ Webhooks are created with proper event subscriptions
- ✅ Test events are delivered successfully
- ✅ Health monitoring shows delivery statistics
- ✅ Updates modify endpoint configuration

---

### **🔐 7. WEBHOOK SECURITY**

Test webhook signature validation:

#### **A. Signature Generation**
1. **Generate Test Signature** - Create HMAC signature
   - Payload: Test event data
   - **Returns:** Signature and secret for validation

#### **B. Signature Validation**
1. **Validate Webhook Signature** - Verify signature authenticity
   - Use generated signature from previous step
   - **Expected:** Valid signature confirmation

**Security Features:**
- ✅ HMAC-SHA256 signature generation
- ✅ Timestamp validation (5-minute tolerance)
- ✅ Signature verification prevents replay attacks

---

### **📊 8. WEBHOOK EVENTS & DELIVERIES**

Monitor webhook system:

1. **List Webhook Events** - View generated events
2. **Get Webhook Deliveries** - Check delivery history
3. **Webhook Analytics** - Delivery statistics

**Monitoring Points:**
- ✅ Events are generated for all subscription/payment actions
- ✅ Delivery attempts are tracked
- ✅ Failed deliveries are retried automatically
- ✅ Analytics provide success rates

---

### **🧪 9. END-TO-END TESTING**

Complete integration tests:

#### **A. Complete Payment Flow**
1. **Complete Payment Flow** - Full payment with webhooks
   - Amount: $149.99
   - **Triggers:** payment.succeeded webhook

#### **B. Complete Subscription Flow**
1. **Complete Subscription Flow** - Full subscription lifecycle
   - Creates subscription
   - **Triggers:** subscription.created webhook
   - **Triggers:** subscription.trial_will_end (if trial expires)

---

## 📈 **Advanced Testing Scenarios**

### **🔄 Recurring Billing Testing**

The system processes recurring payments every 5 minutes. To test:

1. Create subscription with short trial (1-2 days)
2. Wait for trial to expire
3. Monitor webhook events for:
   - `subscription.trial_will_end`
   - `subscription.payment_succeeded`
   - `invoice.payment_succeeded`

### **⚡ Webhook Delivery Testing**

1. **Set up webhook.site URL**
   - Visit https://webhook.site
   - Copy your unique URL
   - Update webhook endpoint with this URL

2. **Monitor deliveries:**
   - Perform payment/subscription actions
   - Check webhook.site for delivered events
   - Verify signature headers

### **🛡️ Error Handling Testing**

Test various error scenarios:

1. **Invalid payment data:** Missing required fields
2. **Invalid idempotency:** Reuse key with different request
3. **Invalid webhook URL:** Use non-existent domain
4. **Invalid plan/subscription IDs:** Use non-existent IDs

---

## 🔧 **Troubleshooting**

### **Common Issues:**

1. **Server Not Responding:**
   ```bash
   # Check if server is running
   curl http://localhost:3000/health
   
   # Restart server
   npm start
   ```

2. **Webhook Deliveries Failing:**
   - Check webhook URL is accessible
   - Verify webhook.site URL is current
   - Check endpoint status in collection

3. **Variables Not Saving:**
   - Ensure you're using the correct environment
   - Check test scripts in requests
   - Verify collection variables are set

### **Test Data Reset:**

To reset test data, restart the server:
```bash
# This clears in-memory storage
npm start
```

---

## 📝 **Testing Checklist**

### **✅ Basic Functionality**
- [ ] Health checks pass for all services
- [ ] Purchase payments process successfully
- [ ] Authorization and capture flow works
- [ ] Refunds and voids process correctly

### **✅ Advanced Features**
- [ ] Idempotency prevents duplicate processing
- [ ] Subscription plans create successfully
- [ ] Subscriptions progress through lifecycle
- [ ] Webhooks deliver events reliably
- [ ] Webhook signatures validate correctly

### **✅ Integration Testing**
- [ ] Payment webhooks trigger on transactions
- [ ] Subscription webhooks trigger on status changes
- [ ] Webhook delivery retries work
- [ ] Recurring billing processes automatically

### **✅ Error Handling**
- [ ] Invalid requests return proper error messages
- [ ] Failed webhooks are retried with exponential backoff
- [ ] Subscription payment failures are handled gracefully
- [ ] Idempotency key conflicts are detected

---

## 🎯 **Success Criteria**

A successful test run should demonstrate:

1. **🟢 100% Health Check Success** - All services operational
2. **🟢 Payment Processing** - All payment flows working
3. **🟢 Idempotency** - Duplicate prevention functional
4. **🟢 Subscription Management** - Complete lifecycle working
5. **🟢 Webhook Delivery** - Events delivered reliably
6. **🟢 Security** - Signature validation working

---

## 🔄 **Continuous Testing**

For ongoing development:

1. **Run health checks** before each test session
2. **Test new features** with relevant endpoint groups
3. **Monitor webhook deliveries** for integration issues
4. **Verify error handling** with invalid data
5. **Check logs** for any errors or warnings

**Happy Testing! 🚀**




