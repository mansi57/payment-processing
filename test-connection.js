const { Client } = require('pg');
require('dotenv').config();

async function testConnection() {
  console.log(' Testing connection with .env credentials...');
  console.log('Host:', process.env.DB_HOST || 'localhost');
  console.log('Port:', process.env.DB_PORT || '5432');
  console.log('Database:', process.env.DB_NAME || 'payment_processing');
  console.log('Username:', process.env.DB_USERNAME || 'postgres');
  console.log('Password:', process.env.DB_PASSWORD ? '***SET***' : '***NOT SET***');
  console.log('');

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'payment_processing'
  });

  try {
    await client.connect();
    console.log(' CONNECTION SUCCESSFUL!');
    console.log(' Ready to start the application!');
    
    const result = await client.query('SELECT NOW() as current_time');
    console.log('Database time:', result.rows[0].current_time);
  } catch (error) {
    console.log(' CONNECTION FAILED!');
    console.log('Error:', error.message);
    console.log('');
    console.log(' Fix: Update DB_PASSWORD in your .env file with the correct password');
  } finally {
    await client.end();
  }
}

testConnection();
