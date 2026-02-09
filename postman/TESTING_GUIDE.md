# Payment Processing API - Testing Guide

This guide will help you test all the payment flows using the provided Postman collection.

## Setup Instructions

### 1. Import Files into Postman
1. Open Postman
2. Click "Import" in the top left
3. Import these files:
   - `Payment-Processing-API.postman_collection.json`
   - `Payment-API-Development.postman_environment.json`

### 2. Select Environment
1. In the top right corner, select "Payment API - Development" environment
2. The base URL should automatically be set to `http://localhost:3000`

### 3. Start the Server
Make sure your payment processing server is running:
```bash
npm start
# or for development with hot reload
npm run dev
```

## Testing Flows

### 🏥 Health Check
**Endpoint:** `GET /api/payments/health`

Start here to verify the service is running.

**Expected Response:**
```json
{
  "success": true,
  "message": "Payment service is healthy",
  "timestamp": "2023-11-20T10:30:00.000Z",
  "environment": "development"
}
```

### 💳 Core Payment Flows

#### 1. Purchase Payment (One-Step)
**Endpoint:** `POST /api/payments/purchase`

Complete payment processing (authorize + capture in one step).

**Test Cards Available:**
- **Visa:** 4111111111111111
- **Mastercard:** 5555555555554444  
- **American Express:** 378282246310005
- **Discover:** 6011111111111117

**Example Request:**
```json
{
  "amount": 29.99,
  "currency": "USD",
  "customerInfo": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "address": {
      "street": "123 Main St",
      "city": "Anytown", 
      "state": "CA",
      "zipCode": "12345"
    }
  },
  "paymentMethod": {
    "type": "credit_card",
    "cardNumber": "4111111111111111",
    "expirationDate": "1225",
    "cvv": "123"
  },
  "description": "Product purchase",
  "orderId": "ORDER-12345"
}
```

#### 2. Two-Step Process (Authorize → Capture)

**Step A: Authorize Payment**
**Endpoint:** `POST /api/payments/authorize`

This holds funds without capturing them.

- Use the "Authorize Payment Only" request
- The collection automatically saves the transaction ID for the next step
- Check the Console log to see the saved transaction ID

**Step B: Capture Payment**
**Endpoint:** `POST /api/payments/capture/:transactionId`

This captures the previously authorized funds.

- Use the "Capture Authorized Payment" request
- The transaction ID is automatically populated from the authorize step
- You can specify a partial amount or leave empty for full capture

#### 3. Refund Flows

**Full Refund:**
**Endpoint:** `POST /api/payments/refund/:transactionId`

```json
{
  "reason": "Customer requested refund"
}
```

**Partial Refund:**
```json
{
  "amount": 15.00,
  "reason": "Partial refund for damaged item"  
}
```

#### 4. Void Payment
**Endpoint:** `POST /api/payments/void/:transactionId`

Cancels a payment before settlement (same day).

```json
{
  "reason": "Order cancelled by customer"
}
```

### 🏦 Bank Account (ACH) Testing

**Test Bank Account Details:**
- **Routing Number:** 121042882
- **Account Number:** 123456789
- **Account Type:** checking or savings

**Example Request:**
```json
{
  "amount": 75.50,
  "customerInfo": {
    "firstName": "Robert",
    "lastName": "Johnson",
    "email": "robert.johnson@example.com"
  },
  "paymentMethod": {
    "type": "bank_account",
    "accountNumber": "123456789",
    "routingNumber": "121042882", 
    "accountType": "checking"
  }
}
```

## Testing Scenarios

### ✅ Happy Path Testing
1. **Health Check** - Verify service is running
2. **Purchase Payment** - Complete one-step payment
3. **Authorize → Capture** - Two-step payment process
4. **Refund** - Refund the captured payment
5. **Void** - Test voiding an unsettled transaction

### ❌ Error Testing
1. **Invalid Card Number** - Test error handling
2. **Missing Required Fields** - Test validation
3. **Invalid Transaction ID** - Test not-found scenarios

### 🔄 Workflow Testing

**Complete E-commerce Flow:**
1. Customer places order → **Purchase Payment**
2. Need to adjust order → **Partial Refund**  
3. Customer cancels → **Void Payment**

**Authorization Flow:**
1. Reserve inventory → **Authorize Payment**
2. Ship product → **Capture Payment**
3. Product defective → **Refund Payment**

## Expected Response Formats

### Success Response
```json
{
  "success": true,
  "message": "Payment processed successfully",
  "data": {
    "success": true,
    "transactionId": "12345678",
    "authCode": "ABC123", 
    "amount": 29.99,
    "message": "This transaction has been approved.",
    "responseCode": "1",
    "timestamp": "2023-11-20T10:30:00.000Z"
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid payment data provided", 
    "timestamp": "2023-11-20T10:30:00.000Z"
  }
}
```

## Common Response Codes

| Response Code | Meaning |
|---------------|---------|
| 1 | Approved |
| 2 | Declined |
| 3 | Error |
| 4 | Held for Review |

## Troubleshooting

### Common Issues

**1. "Cannot connect" errors**
- Ensure the server is running on port 3000
- Check the base_url in your environment

**2. "Transaction not found" errors**  
- Verify you're using valid transaction IDs
- Check that the original transaction was successful

**3. "Invalid card" errors**
- Use only the provided test card numbers
- Ensure expiration dates are in the future (MMYY format)

**4. Validation errors**
- Check that all required fields are provided
- Verify field formats (email, phone, zip codes)

### Tips for Testing
- Use the Console tab to see detailed logs
- Save successful transaction IDs for refund/void testing
- Test both credit cards and bank accounts
- Try different amounts and currencies
- Test partial operations (partial refunds, partial captures)

## Production Testing
When ready for production:
1. Update environment variables to production endpoints
2. Use real Authorize.Net credentials (not sandbox)
3. Test with small amounts first
4. Implement proper error handling in your client application

## Need Help?
- Check the application logs for detailed error information
- Review the API documentation in the README.md
- Verify your Authorize.Net sandbox credentials are correct






