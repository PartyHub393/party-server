const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'aws-1-us-east-2.pooler.supabase.com',
  database: process.env.PGDATABASE || 'postgres',
  user: process.env.PGUSER || 'postgres.fvzxeyflnzpyqcdayacc',
  password: process.env.PGPASSWORD || 'P9lVFj2ZM1AscMFE',
  port: Number(process.env.PGPORT) || 5432,
  // Supabase and other managed Postgres providers require SSL
  ssl: process.env.PGHOST
    ? { rejectUnauthorized: false }
    : false,
});

const createUserTable = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'player',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS groups (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(100) NOT NULL,
      description TEXT,
      code VARCHAR(50) UNIQUE,
      is_locked BOOLEAN NOT NULL DEFAULT FALSE,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS group_members (
      group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      role VARCHAR(20) DEFAULT 'member',
      PRIMARY KEY (group_id, user_id)
    );
  `;
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await pool.query(queryText);

    // Backfill columns for existing databases created before these fields existed.
    await pool.query('ALTER TABLE groups ADD COLUMN IF NOT EXISTS code VARCHAR(50) UNIQUE');

    await pool.query(
      "ALTER TABLE groups ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE"
    );

    await pool.query(
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'player'"
    );

    console.log("Group and users table is ready.");
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
