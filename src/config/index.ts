import dotenv from 'dotenv';

dotenv.config();

export interface Config {
  port: number;
  nodeEnv: string;
  payment: {
    useMockService: boolean;
  };
  authNet: {
    apiLoginId: string;
    transactionKey: string;
    environment: 'sandbox' | 'production';
    clientKey: string;
  };
  logging: {
    level: string;
    file: string;
  };
  security: {
    apiSecret: string;
  };
}

const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  payment: {
    useMockService: process.env.USE_MOCK_PAYMENT_SERVICE === 'true' || true, // Default to mock for testing
  },
  authNet: {
    apiLoginId: process.env.AUTHNET_API_LOGIN_ID || 'test_api_login_id',
    transactionKey: process.env.AUTHNET_TRANSACTION_KEY || 'test_transaction_key',
    environment: (process.env.AUTHNET_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
    clientKey: process.env.AUTHNET_CLIENT_KEY || 'test_client_key',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log',
  },
  security: {
    apiSecret: process.env.API_SECRET || 'default-secret-change-in-production',
  },
};

// Validate required configuration
const validateConfig = (): void => {
  const requiredFields = [
    'authNet.apiLoginId',
    'authNet.transactionKey',
  ];

  for (const field of requiredFields) {
    const keys = field.split('.');
    let value: any = config;
    
    for (const key of keys) {
      value = value[key];
    }
    
    if (!value) {
      throw new Error(`Missing required configuration: ${field}`);
    }
  }
};

if (config.nodeEnv !== 'test') {
  validateConfig();
}

export default config;



