import { Migration } from '../config/database'
import Database from 'better-sqlite3'

export const migration_001_initial: Migration = {
  version: 1,
  name: 'create_initial_tables',
  up: async (db: Database.Database) => {
    // Create users table (migrated from JSON)
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        edad INTEGER NOT NULL CHECK (edad > 0 AND edad <= 120),
        dni INTEGER NOT NULL UNIQUE CHECK (dni >= 1000000 AND dni <= 99999999),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create auth_users table for authentication
    db.exec(`
      CREATE TABLE auth_users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        active BOOLEAN DEFAULT TRUE,
        must_change_password BOOLEAN DEFAULT FALSE,
        last_login DATETIME,
        failed_attempts INTEGER DEFAULT 0,
        locked_until DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create auth_sessions table for session management
    db.exec(`
      CREATE TABLE auth_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
      )
    `)

    // Create indexes for optimization
    db.exec('CREATE INDEX idx_users_dni ON users(dni)')
    db.exec('CREATE INDEX idx_users_nombre ON users(nombre)')
    db.exec('CREATE INDEX idx_users_nombre_edad ON users(nombre, edad)')

    db.exec('CREATE INDEX idx_auth_users_username ON auth_users(username)')
    db.exec('CREATE INDEX idx_auth_users_active_username ON auth_users(active, username)')

    db.exec('CREATE INDEX idx_auth_sessions_token ON auth_sessions(token)')
    db.exec('CREATE INDEX idx_auth_sessions_expires ON auth_sessions(expires_at)')
    db.exec('CREATE INDEX idx_auth_sessions_user_id ON auth_sessions(user_id)')

    // Regular index for active sessions (partial index with datetime('now') is non-deterministic)
    db.exec('CREATE INDEX idx_active_sessions ON auth_sessions(user_id, expires_at)')

    // Update statistics for query optimization
    db.exec('ANALYZE')

    console.log('Initial database schema created successfully')
  },

  down: async (db: Database.Database) => {
    // Drop indexes first
    db.exec('DROP INDEX IF EXISTS idx_active_sessions')
    db.exec('DROP INDEX IF EXISTS idx_auth_sessions_user_id')
    db.exec('DROP INDEX IF EXISTS idx_auth_sessions_expires')
    db.exec('DROP INDEX IF EXISTS idx_auth_sessions_token')
    db.exec('DROP INDEX IF EXISTS idx_auth_users_active_username')
    db.exec('DROP INDEX IF EXISTS idx_auth_users_username')
    db.exec('DROP INDEX IF EXISTS idx_users_nombre_edad')
    db.exec('DROP INDEX IF EXISTS idx_users_nombre')
    db.exec('DROP INDEX IF EXISTS idx_users_dni')

    // Drop tables
    db.exec('DROP TABLE IF EXISTS auth_sessions')
    db.exec('DROP TABLE IF EXISTS auth_users')
    db.exec('DROP TABLE IF EXISTS users')

    console.log('Initial database schema dropped successfully')
  }
}
