import { Migration } from '../config/database'
import Database from 'better-sqlite3'

export const migration_003_performance_indexes: Migration = {
  version: 3,
  name: 'add_performance_indexes',
  up: async (db: Database.Database) => {
    console.log('Adding performance optimization indexes...')

    // Composite index for user searches with case-insensitive name search
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_search_composite 
      ON users(nombre COLLATE NOCASE, edad DESC)
    `)

    // Composite index for auth user login operations
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_auth_users_login_composite 
      ON auth_users(username, active, failed_attempts)
    `)

    // Composite index for session management operations
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_management_composite 
      ON auth_sessions(user_id, expires_at DESC, token)
    `)

    // Partial index for active sessions only (more efficient than full table scan)
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_active_sessions_only 
      ON auth_sessions(user_id, token) 
      WHERE expires_at > datetime('now')
    `)

    // Index for user age range queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_age_range 
      ON users(edad, nombre)
    `)

    // Index for DNI range searches (useful for bulk operations)
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_dni_range 
      ON users(dni, id)
    `)

    // Composite index for auth user status queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_auth_users_status 
      ON auth_users(active, locked_until, last_login)
    `)

    // Index for session cleanup operations
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_cleanup 
      ON auth_sessions(expires_at, created_at)
    `)

    // Update table statistics for query optimizer
    db.exec('ANALYZE')

    console.log('Performance optimization indexes created successfully')
  },

  down: async (db: Database.Database) => {
    console.log('Removing performance optimization indexes...')

    // Drop all performance indexes
    db.exec('DROP INDEX IF EXISTS idx_sessions_cleanup')
    db.exec('DROP INDEX IF EXISTS idx_auth_users_status')
    db.exec('DROP INDEX IF EXISTS idx_users_dni_range')
    db.exec('DROP INDEX IF EXISTS idx_users_age_range')
    db.exec('DROP INDEX IF EXISTS idx_active_sessions_only')
    db.exec('DROP INDEX IF EXISTS idx_sessions_management_composite')
    db.exec('DROP INDEX IF EXISTS idx_auth_users_login_composite')
    db.exec('DROP INDEX IF EXISTS idx_users_search_composite')

    console.log('Performance optimization indexes removed successfully')
  }
}
