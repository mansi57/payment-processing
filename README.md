# Payment Processing Backend

A robust Node.js/TypeScript backend application for handling payment integration with Authorize.Net Sandbox API. This service supports core payment flows including purchase, refund, void, and authorize/capture operations.

## Features

- ✅ **Full Payment Flows**: Purchase, Authorization/Capture, Refund, and Void transactions
- ✅ **Authorize.Net Integration**: Sandbox and production environment support
- ✅ **TypeScript**: Full type safety and modern development experience
- ✅ **Express.js**: RESTful API with comprehensive middleware
- ✅ **Input Validation**: Joi-based request validation with detailed error messages
- ✅ **Error Handling**: Comprehensive error handling with proper HTTP status codes
- ✅ **Logging**: Winston-based structured logging
- ✅ **Security**: Helmet, CORS, and input sanitization
- ✅ **Credit Card & Bank Account**: Support for both payment methods

## Prerequisites

- Node.js 18.0 or higher
- npm or yarn
- Authorize.Net Sandbox account (for testing)

## Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd payment-processing
npm install
```

### 2. Environment Configuration

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Authorize.Net Configuration (Sandbox)
AUTHNET_API_LOGIN_ID=your_api_login_id
AUTHNET_TRANSACTION_KEY=your_transaction_key
AUTHNET_ENVIRONMENT=sandbox
AUTHNET_CLIENT_KEY=your_client_key

# Logging
LOG_LEVEL=info
LOG_FILE=logs/app.log

# Security
API_SECRET=your_api_secret_for_jwt_or_auth
```

### 3. Build and Run

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## API Documentation

### Base URL
```
http://localhost:3000/api/payments
```

### Endpoints

#### 1. Purchase Payment (Authorize + Capture)
```http
POST /api/payments/purchase
```

**Request Body:**
```json
{
  "amount": 29.99,
  "currency": "USD",
  "customerInfo": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "phone": "+1234567890",
    "address": {
      "street": "123 Main St",
      "city": "Anytown",
      "state": "CA",
      "zipCode": "12345",
      "country": "US"
    }
  },
  "paymentMethod": {
    "type": "credit_card",
    "cardNumber": "4111111111111111",
    "expirationDate": "1225",
    "cvv": "123"
  },
  "description": "Product purchase",
  "orderId": "ORDER-123",
  "metadata": {
    "productId": "PROD-456"
  }
}
```

#### 2. Authorize Payment
```http
POST /api/payments/authorize
```

**Request Body:** (Same as purchase, but only authorizes without capturing)

#### 3. Capture Payment
```http
POST /api/payments/capture/:transactionId
```

**Request Body:**
```json
{
  "amount": 29.99  // Optional: partial capture amount
}
```

#### 4. Refund Payment
```http
POST /api/payments/refund/:transactionId
```

**Request Body:**
```json
{
  "amount": 15.00,  // Optional: partial refund amount
  "reason": "Customer request"
}
```

#### 5. Void Payment
```http
POST /api/payments/void/:transactionId
```

**Request Body:**
```json
{
  "reason": "Order cancelled"
}
```

#### 6. Health Check
```http
GET /api/payments/health
```

### Response Format

**Success Response:**
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

**Error Response:**
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

## Payment Methods

### Credit Card
```json
{
  "type": "credit_card",
  "cardNumber": "4111111111111111",  // Test card number
  "expirationDate": "1225",          // MMYY format
  "cvv": "123"
}
```

### Bank Account
```json
{
  "type": "bank_account",
  "accountNumber": "123456789",
  "routingNumber": "121042882",
  "accountType": "checking"           // or "savings"
}
```

## Testing

### Test Credit Card Numbers (Authorize.Net Sandbox)

| Card Type | Number | CVV | Result |
|-----------|--------|-----|--------|
| Visa | 4111111111111111 | Any 3-4 digits | Approved |
| Visa | 4012888888881881 | Any 3-4 digits | Approved |
| Mastercard | 5555555555554444 | Any 3-4 digits | Approved |
| Mastercard | 5105105105105100 | Any 3-4 digits | Approved |
| American Express | 378282246310005 | Any 4 digits | Approved |
| Discover | 6011111111111117 | Any 3-4 digits | Approved |

### Test Bank Account (Sandbox)
- Routing Number: 121042882
- Account Number: 123456789

## Error Codes

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Invalid request data |
| `CARD_DECLINED` | Payment method declined |
| `INSUFFICIENT_FUNDS` | Insufficient funds |
| `EXPIRED_CARD` | Card has expired |
| `INVALID_CARD` | Invalid card information |
| `AUTHORIZATION_FAILED` | Authorization failed |
| `CAPTURE_FAILED` | Capture operation failed |
| `REFUND_FAILED` | Refund operation failed |
| `VOID_FAILED` | Void operation failed |
| `TRANSACTION_NOT_FOUND` | Transaction not found |
| `API_ERROR` | General API error |
| `NETWORK_ERROR` | Network communication error |

## Development

### Project Structure
```
src/
├── config/         # Configuration management
├── middleware/     # Express middleware
├── routes/         # API route definitions
├── services/       # Business logic and external integrations
├── types/          # TypeScript type definitions
├── utils/          # Utility functions and helpers
├── app.ts          # Express application setup
└── index.ts        # Application entry point
```

### Available Scripts

```bash
npm run dev         # Start development server with hot reload
npm run build       # Build TypeScript to JavaScript
npm start          # Start production server
npm run clean      # Clean build directory
npm run lint       # Run ESLint
npm run lint:fix   # Fix ESLint issues
npm test           # Run tests
npm run test:watch # Run tests in watch mode
```

### Adding New Features

1. **Types**: Add interfaces in `src/types/`
2. **Validation**: Add Joi schemas in `src/utils/validation.ts`
3. **Services**: Add business logic in `src/services/`
4. **Routes**: Add API endpoints in `src/routes/`
5. **Middleware**: Add reusable middleware in `src/middleware/`

## Production Deployment

### Environment Variables
Ensure all required environment variables are set:
- `AUTHNET_API_LOGIN_ID`
- `AUTHNET_TRANSACTION_KEY`
- `AUTHNET_ENVIRONMENT=production`
- `NODE_ENV=production`

### Security Considerations
- Use HTTPS in production
- Implement rate limiting
- Add authentication/authorization
- Use environment-specific secrets
- Monitor and log all transactions
- Implement PCI DSS compliance measures

### Docker Support
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- Create an issue in the repository
- Check Authorize.Net documentation: https://developer.authorize.net/
- Review the API logs for detailed error information

