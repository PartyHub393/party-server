const { Pool } = require('pg');

const pool = new Pool({
  //host: process.env.PGHOST || 'aws-1-us-east-2.pooler.supabase.com',
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5432,
  //database: process.env.PGDATABASE || 'postgres',
  database: process.env.PGDATABASE || 'postgres-discovercase',
  //user: process.env.PGUSER || 'postgres.fvzxeyflnzpyqcdayacc',
  user: process.env.PGUSER || 'postgres',
  //password: process.env.PGPASSWORD || 'P9lVFj2ZM1AscMFE',
  password: process.env.PGPASSWORD || 'postgres',
  pool: process.env.POOLMODE || 'session'
});

const createUserTable = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await pool.query(queryText);
    console.log("User table is ready.");
  } catch (err) {
    console.error("Error creating user table:", err.message || err);
    console.log("Server will continue without database. Room/player features will work, but user auth requires DB.");
  }
};

// Initialize table asynchronously without blocking server startup
createUserTable().catch(() => {
  // Error already logged in createUserTable
});

module.exports = { pool };
