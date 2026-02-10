const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'aws-1-us-east-2.pooler.supabase.com',
  port: process.env.PGPORT || 5432,
  database: process.env.PGDATABASE || 'postgres',
  user: process.env.PGUSER || 'postgres.fvzxeyflnzpyqcdayacc',
  password: process.env.PGPASSWORD || 'P9lVFj2ZM1AscMFE',
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
    console.error("Error creating user table:", err);
  }
};

createUserTable();

module.exports = { pool };
