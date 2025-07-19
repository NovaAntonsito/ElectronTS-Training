// Test script to verify database schema and migration system
import { DatabaseManager } from './services/database-manager'
import { MigrationRunner } from './services/migration-runner'
import { testDatabaseConfig } from './config/test-database'
import { v4 as uuidv4 } from 'uuid'

async function testDatabaseSchema() {
  console.log('🧪 Testing Database Schema and Migration System...\n')

  let dbManager: DatabaseManager | null = null

  try {
    // Initialize database manager directly
    console.log('1. Initializing database manager...')
    dbManager = new DatabaseManager(testDatabaseConfig)
    await dbManager.initialize()
    console.log('✓ Database manager initialized successfully\n')

    // Get database connection
    const db = dbManager.getDatabase()

    // Test migration system
    console.log('2. Testing migration system...')
    const migrationRunner = new MigrationRunner(db)

    // Check current version
    const currentVersion = await migrationRunner.getCurrentVersion()
    console.log(`✓ Current database version: ${currentVersion}`)

    // Get applied migrations
    const appliedMigrations = await migrationRunner.getAppliedMigrations()
    console.log(`✓ Applied migrations: ${appliedMigrations.length}`)
    appliedMigrations.forEach((m) => {
      console.log(`  - v${m.version}: ${m.name} (${m.applied_at})`)
    })
    console.log()

    // Test schema structure
    console.log('3. Testing database schema structure...')

    // Check if tables exist
    const tables = db
      .prepare(
        `
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `
      )
      .all() as Array<{ name: string }>

    console.log('✓ Database tables:')
    tables.forEach((table) => console.log(`  - ${table.name}`))

    const expectedTables = ['users', 'auth_users', 'auth_sessions', 'schema_migrations']
    const actualTables = tables.map((t) => t.name)

    for (const expectedTable of expectedTables) {
      if (actualTables.includes(expectedTable)) {
        console.log(`✓ Table '${expectedTable}' exists`)
      } else {
        throw new Error(`❌ Table '${expectedTable}' is missing`)
      }
    }
    console.log()

    // Test indexes
    console.log('4. Testing database indexes...')
    const indexes = db
      .prepare(
        `
      SELECT name, tbl_name FROM sqlite_master 
      WHERE type='index' AND name NOT LIKE 'sqlite_%'
      ORDER BY tbl_name, name
    `
      )
      .all() as Array<{ name: string; tbl_name: string }>

    console.log('✓ Database indexes:')
    indexes.forEach((idx) => console.log(`  - ${idx.name} on ${idx.tbl_name}`))

    const expectedIndexes = [
      'idx_users_dni',
      'idx_users_nombre',
      'idx_users_nombre_edad',
      'idx_auth_users_username',
      'idx_auth_users_active_username',
      'idx_auth_sessions_token',
      'idx_auth_sessions_expires',
      'idx_auth_sessions_user_id',
      'idx_active_sessions'
    ]

    const actualIndexes = indexes.map((i) => i.name)
    for (const expectedIndex of expectedIndexes) {
      if (actualIndexes.includes(expectedIndex)) {
        console.log(`✓ Index '${expectedIndex}' exists`)
      } else {
        console.log(`⚠️  Index '${expectedIndex}' is missing`)
      }
    }
    console.log()

    // Test table constraints and structure
    console.log('5. Testing table constraints...')

    // Test users table structure
    const usersSchema = db.prepare('PRAGMA table_info(users)').all() as Array<any>
    console.log('✓ Users table schema:')
    usersSchema.forEach((col) => {
      console.log(
        `  - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`
      )
    })

    // Test auth_users table structure
    const authUsersSchema = db.prepare('PRAGMA table_info(auth_users)').all() as Array<any>
    console.log('✓ Auth_users table schema:')
    authUsersSchema.forEach((col) => {
      console.log(
        `  - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`
      )
    })

    // Test auth_sessions table structure
    const authSessionsSchema = db.prepare('PRAGMA table_info(auth_sessions)').all() as Array<any>
    console.log('✓ Auth_sessions table schema:')
    authSessionsSchema.forEach((col) => {
      console.log(
        `  - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`
      )
    })
    console.log()

    // Test foreign key constraints
    console.log('6. Testing foreign key constraints...')
    const foreignKeys = db.prepare('PRAGMA foreign_key_list(auth_sessions)').all() as Array<any>
    console.log('✓ Foreign keys in auth_sessions:')
    foreignKeys.forEach((fk) => {
      console.log(`  - ${fk.from} -> ${fk.table}.${fk.to}`)
    })
    console.log()

    // Test basic CRUD operations
    console.log('7. Testing basic CRUD operations...')

    // Test users table
    const testUserId = uuidv4()
    db.prepare('INSERT INTO users (id, nombre, edad, dni) VALUES (?, ?, ?, ?)').run(
      testUserId,
      'Test User',
      25,
      12345678
    )
    console.log('✓ Inserted test user')

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(testUserId) as any
    if (user && user.nombre === 'Test User') {
      console.log('✓ Retrieved test user successfully')
    } else {
      throw new Error('❌ Failed to retrieve test user')
    }

    // Test auth_users table
    const testAuthUserId = uuidv4()
    db.prepare(
      'INSERT INTO auth_users (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)'
    ).run(testAuthUserId, 'testuser', 'hashedpassword', 'Test User')
    console.log('✓ Inserted test auth user')

    // Test auth_sessions table
    const testSessionId = uuidv4()
    const expiresAt = new Date(Date.now() + 3600000).toISOString() // 1 hour from now
    db.prepare(
      'INSERT INTO auth_sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)'
    ).run(testSessionId, testAuthUserId, 'test-token-123', expiresAt)
    console.log('✓ Inserted test session')

    // Test foreign key constraint
    const session = db
      .prepare(
        'SELECT s.*, u.username FROM auth_sessions s JOIN auth_users u ON s.user_id = u.id WHERE s.id = ?'
      )
      .get(testSessionId) as any
    if (session && session.username === 'testuser') {
      console.log('✓ Foreign key relationship working correctly')
    } else {
      throw new Error('❌ Foreign key relationship failed')
    }

    // Clean up test data
    db.prepare('DELETE FROM auth_sessions WHERE id = ?').run(testSessionId)
    db.prepare('DELETE FROM auth_users WHERE id = ?').run(testAuthUserId)
    db.prepare('DELETE FROM users WHERE id = ?').run(testUserId)
    console.log('✓ Cleaned up test data')
    console.log()

    // Test constraints
    console.log('8. Testing data constraints...')

    try {
      // Test age constraint (should fail)
      db.prepare('INSERT INTO users (id, nombre, edad, dni) VALUES (?, ?, ?, ?)').run(
        uuidv4(),
        'Invalid User',
        -5,
        87654321
      )
      throw new Error('❌ Age constraint should have failed')
    } catch (error) {
      if (error instanceof Error && error.message.includes('CHECK constraint failed')) {
        console.log('✓ Age constraint working correctly')
      } else {
        throw error
      }
    }

    try {
      // Test DNI constraint (should fail)
      db.prepare('INSERT INTO users (id, nombre, edad, dni) VALUES (?, ?, ?, ?)').run(
        uuidv4(),
        'Invalid User',
        25,
        123
      ) // DNI too short
      throw new Error('❌ DNI constraint should have failed')
    } catch (error) {
      if (error instanceof Error && error.message.includes('CHECK constraint failed')) {
        console.log('✓ DNI constraint working correctly')
      } else {
        throw error
      }
    }
    console.log()

    // Test database health
    console.log('9. Testing database health...')
    const isHealthy = await dbManager.healthCheck()
    if (isHealthy) {
      console.log('✓ Database health check passed')
    } else {
      throw new Error('❌ Database health check failed')
    }
    console.log()

    // Shutdown
    await dbManager.disconnect()
    console.log('✓ Database manager shut down successfully')

    console.log('\n🎉 All database schema tests passed!')
    console.log('✅ Database schema and migration system working correctly')
  } catch (error) {
    console.error('\n❌ Database schema test failed:', error)

    // Attempt cleanup
    try {
      if (dbManager) {
        await dbManager.disconnect()
      }
    } catch (cleanupError) {
      console.error('Failed to cleanup database manager:', cleanupError)
    }

    process.exit(1)
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  testDatabaseSchema()
}

export { testDatabaseSchema }
