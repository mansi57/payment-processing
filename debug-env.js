require('dotenv').config();
console.log('=== ENVIRONMENT VARIABLES ===');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_USERNAME:', process.env.DB_USERNAME);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? `***${process.env.DB_PASSWORD.length} chars***` : 'UNDEFINED');
console.log('DB_SSL:', process.env.DB_SSL);

console.log('\n=== CONFIG OBJECT ===');
const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'payment_processing',
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  ssl: process.env.DB_SSL === 'true' || false,
};
console.log('Config:', {
  ...config,
  password: config.password ? `***${config.password.length} chars***` : 'FALLBACK-PASSWORD'
});
