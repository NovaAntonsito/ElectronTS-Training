import { Migration } from '../config/database'
import Database from 'better-sqlite3'
import { DataMigrator } from '../services/data-migrator'
import { DatabaseManager } from '../services/database-manager'

export const migration_002_migrate_json: Migration = {
  version: 2,
  name: 'migrate_json_data',
  up: async (db: Database.Database) => {
    console.log('Starting JSON data migration...')

    try {
      // Create a temporary DatabaseManager instance for the migrator
      // We need to pass the current db connection to avoid conflicts
      const tempDbManager = new DatabaseManager({
        path: '',
        name: '',
        version: 2,
        migrations: [],
        connectionPool: { min: 1, max: 1, timeout: 30000 },
        pragmas: {
          journal_mode: 'WAL',
          synchronous: 'NORMAL',
          cache_size: -64000,
          temp_store: 'MEMORY',
          mmap_size: 268435456
        }
      })

      // Override the connect method to return the current db instance
      tempDbManager.connect = async () => db

      // Create and run the data migrator
      const dataMigrator = new DataMigrator(tempDbManager)
      const result = await dataMigrator.migrateFromJSON()

      if (!result.success) {
        throw new Error(`JSON migration failed: ${result.errors.join(', ')}`)
      }

      console.log(`JSON migration completed successfully:`)
      console.log(`- Migrated users: ${result.migratedUsers}`)
      console.log(`- Created auth users: ${result.createdAuthUsers}`)
      console.log(`- Duration: ${result.duration}ms`)
      console.log(`- Backup created at: ${result.backupPath}`)

      if (result.errors.length > 0) {
        console.warn(`Migration completed with warnings: ${result.errors.join(', ')}`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`JSON migration failed: ${errorMessage}`)
      throw new Error(`JSON data migration failed: ${errorMessage}`)
    }
  },

  down: async (db: Database.Database) => {
    console.log('Rolling back JSON data migration...')

    try {
      // Clear all migrated data
      db.exec('DELETE FROM auth_sessions')
      db.exec('DELETE FROM auth_users')
      db.exec('DELETE FROM users')

      // Reset auto-increment counters if any
      db.exec('DELETE FROM sqlite_sequence WHERE name IN ("users", "auth_users", "auth_sessions")')

      console.log('JSON data migration rolled back successfully')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`Failed to rollback JSON migration: ${errorMessage}`)
      throw new Error(`JSON migration rollback failed: ${errorMessage}`)
    }
  }
}
