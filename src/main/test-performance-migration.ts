import Database from 'better-sqlite3'
import { migration_003_performance_indexes } from './migrations/003_performance_indexes'
import path from 'path'
import fs from 'fs'

async function testPerformanceMigration() {
  console.log('🔧 Testing Performance Migration...\n')

  const testDbPath = path.join(__dirname, '../../temp/test-migration.db')

  // Ensure directory exists
  const dir = path.dirname(testDbPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const testDb = new Database(testDbPath)

  try {
    // Create base schema first (simulate existing database)
    testDb.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        edad INTEGER NOT NULL,
        dni INTEGER NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    testDb.exec(`
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

    testDb.exec(`
      CREATE TABLE auth_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
      )
    `)

    console.log('✓ Base schema created')

    // Get initial index count
    const initialIndexes = testDb
      .prepare(
        `
      SELECT COUNT(*) as count FROM sqlite_master 
      WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
    `
      )
      .get() as { count: number }

    console.log(`✓ Initial indexes: ${initialIndexes.count}`)

    // Run the performance migration
    await migration_003_performance_indexes.up(testDb)
    console.log('✓ Performance migration applied')

    // Get final index count
    const finalIndexes = testDb
      .prepare(
        `
      SELECT COUNT(*) as count FROM sqlite_master 
      WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
    `
      )
      .get() as { count: number }

    console.log(`✓ Final indexes: ${finalIndexes.count}`)
    console.log(`✓ Added ${finalIndexes.count - initialIndexes.count} performance indexes`)

    // Verify specific indexes exist
    const performanceIndexes = [
      'idx_users_search_composite',
      'idx_auth_users_login_composite',
      'idx_sessions_management_composite',
      'idx_active_sessions_only',
      'idx_users_age_range',
      'idx_users_dni_range',
      'idx_auth_users_status',
      'idx_sessions_cleanup'
    ]

    for (const indexName of performanceIndexes) {
      const exists = testDb
        .prepare(
          `
        SELECT COUNT(*) as count FROM sqlite_master 
        WHERE type = 'index' AND name = ?
      `
        )
        .get(indexName) as { count: number }

      if (exists.count > 0) {
        console.log(`  ✓ ${indexName} created successfully`)
      } else {
        console.log(`  ❌ ${indexName} not found`)
      }
    }

    // Test rollback
    console.log('\n🔄 Testing migration rollback...')
    await migration_003_performance_indexes.down(testDb)
    console.log('✓ Performance migration rolled back')

    // Verify indexes were removed
    const rollbackIndexes = testDb
      .prepare(
        `
      SELECT COUNT(*) as count FROM sqlite_master 
      WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
    `
      )
      .get() as { count: number }

    console.log(`✓ Indexes after rollback: ${rollbackIndexes.count}`)

    if (rollbackIndexes.count === initialIndexes.count) {
      console.log('✅ Migration rollback successful - all performance indexes removed')
    } else {
      console.log('⚠️  Migration rollback incomplete - some indexes may remain')
    }
  } catch (error) {
    console.error('❌ Performance migration test failed:', error)
  } finally {
    testDb.close()
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath)
    }
  }
}

// Run the test
testPerformanceMigration().catch(console.error)
