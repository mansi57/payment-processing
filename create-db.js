const { Client } = require('pg');
require('dotenv').config();

async function createDatabase() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    database: 'postgres' // Connect to default postgres database first
  });

  try {
    await client.connect();
    console.log(' Connected to PostgreSQL');
    
    // Check if database exists
    const result = await client.query("SELECT 1 FROM pg_database WHERE datname = 'payment_processing'");
    
    if (result.rows.length === 0) {
      await client.query('CREATE DATABASE payment_processing');
      console.log(' Database payment_processing created successfully');
    } else {
      console.log(' Database payment_processing already exists');
    }
  } catch (error) {
    console.error(' Error:', error.message);
  } finally {
    await client.end();
  }
}

createDatabase();
