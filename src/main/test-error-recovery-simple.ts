import Database from 'better-sqlite3'
import { ErrorRecoveryManager } from './services/error-recovery-manager'
import { TransactionManager } from './services/transaction-manager'
import { DatabaseHealthMonitor } from './services/database-health-monitor'
import { DatabaseConfig } from './config/database'
import path from 'path'
import fs from 'fs/promises'

async function testErrorRecoverySimple() {
  console.log('🧪 Testing Error Recovery Components (Simple)...\n')

  const testDbPath = path.join(__dirname, '../../temp/test-error-recovery-simple')
  const testConfig: DatabaseConfig = {
    path: testDbPath,
    name: 'test-recovery.db',
    version: 1,
    migrations: [], // No migrations for simple test
    connectionPool: {
      min: 2,
      max: 10,
      timeout: 30000
    },
    pragmas: {
      journal_mode: 'WAL',
      synchronous: 'NORMAL',
      cache_size: -64000,
      temp_store: 'MEMORY',
      mmap_size: 268435456
    }
  }

  try {
    // Ensure test directory exists
    await fs.mkdir(testDbPath, { recursive: true })

    // Test 1: Basic Error Recovery Manager
    console.log('1️⃣ Testing ErrorRecoveryManager...')
    await testErrorRecoveryManager(testConfig)

    // Test 2: Transaction Manager with Rollback
    console.log('\n2️⃣ Testing TransactionManager with automatic rollback...')
    await testTransactionManager(testConfig)

    // Test 3: Database Health Monitor
    console.log('\n3️⃣ Testing DatabaseHealthMonitor...')
    await testHealthMonitor(testConfig)

    // Test 4: Comprehensive Recovery Scenarios
    console.log('\n4️⃣ Testing comprehensive recovery scenarios...')
    await testComprehensiveRecovery(testConfig)

    console.log('\n✅ All error recovery tests completed successfully!')
  } catch (error) {
    console.error('\n❌ Error recovery tests failed:', error)
    throw error
  } finally {
    // Cleanup
    try {
      await fs.rm(testDbPath, { recursive: true, force: true })
    } catch (error) {
      console.warn('Failed to cleanup test directory:', error)
    }
  }
}

async function testErrorRecoveryManager(config: DatabaseConfig) {
  const recoveryManager = new ErrorRecoveryManager(config, {
    maxRetries: 2,
    retryDelay: 100,
    enableAutoRepair: true,
    enableCorruptionDetection: true
  })

  // Test reconnection strategy
  let connectionAttempts = 0
  const mockConnect = async () => {
    connectionAttempts++
    if (connectionAttempts < 2) {
      throw new Error('Connection failed')
    }
    return {} as any // Mock database
  }

  const reconnectResult = await recoveryManager.attemptReconnection(mockConnect)
  console.log('   ✓ Reconnection result:', reconnectResult.success ? 'Success' : 'Failed')
  console.log('   ✓ Connection attempts:', connectionAttempts)

  // Test with real database for other operations
  const dbPath = path.join(config.path, config.name)
  const db = new Database(dbPath)

  // Create basic tables for testing
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      edad INTEGER NOT NULL,
      dni INTEGER NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Test corruption detection (on healthy database)
  const corruptionResult = await recoveryManager.detectAndRepairCorruption(db)
  console.log('   ✓ Corruption check:', corruptionResult.isCorrupted ? 'Corrupted' : 'Clean')

  // Test inconsistency verification
  const consistencyResult = await recoveryManager.verifyAndCorrectInconsistencies(db)
  console.log('   ✓ Inconsistencies found:', consistencyResult.inconsistenciesFound)
  console.log('   ✓ Inconsistencies corrected:', consistencyResult.corrected)

  db.close()
}

async function testTransactionManager(config: DatabaseConfig) {
  const dbPath = path.join(config.path, config.name)
  const db = new Database(dbPath)

  // Create basic table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      edad INTEGER NOT NULL,
      dni INTEGER NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const recoveryManager = new ErrorRecoveryManager(config)
  const transactionManager = new TransactionManager(db, recoveryManager)

  // Test successful transaction
  const successResult = await transactionManager.executeTransaction(async (db) => {
    db.prepare('INSERT INTO users (id, nombre, edad, dni) VALUES (?, ?, ?, ?)').run(
      'test-tx-1',
      'Test User',
      25,
      12345678
    )
    return 'success'
  })
  console.log('   ✓ Successful transaction:', successResult.success)

  // Test transaction with rollback
  const failureResult = await transactionManager.executeTransaction(async (db) => {
    db.prepare('INSERT INTO users (id, nombre, edad, dni) VALUES (?, ?, ?, ?)').run(
      'test-tx-2',
      'Test User 2',
      30,
      87654321
    )
    // Simulate error
    throw new Error('Simulated transaction error')
  })
  console.log('   ✓ Failed transaction handled:', !failureResult.success)

  // Verify rollback worked (second user should not exist)
  const userCount = db
    .prepare('SELECT COUNT(*) as count FROM users WHERE id LIKE ?')
    .get('test-tx-%') as { count: number }
  console.log('   ✓ Users after rollback:', userCount.count, '(should be 1)')

  // Test batch operations
  const batchResult = await transactionManager.executeBatch([
    (db) =>
      db
        .prepare('INSERT INTO users (id, nombre, edad, dni) VALUES (?, ?, ?, ?)')
        .run('batch-1', 'Batch User 1', 28, 11111111),
    (db) =>
      db
        .prepare('INSERT INTO users (id, nombre, edad, dni) VALUES (?, ?, ?, ?)')
        .run('batch-2', 'Batch User 2', 32, 22222222)
  ])
  console.log('   ✓ Batch transaction:', batchResult.success)

  // Test nested transactions with savepoints
  const nestedResult = await transactionManager.executeNestedTransaction([
    {
      name: 'savepoint1',
      operation: (db) =>
        db
          .prepare('INSERT INTO users (id, nombre, edad, dni) VALUES (?, ?, ?, ?)')
          .run('nested-1', 'Nested User 1', 35, 33333333)
    },
    {
      name: 'savepoint2',
      operation: (db) => {
        db.prepare('INSERT INTO users (id, nombre, edad, dni) VALUES (?, ?, ?, ?)').run(
          'nested-2',
          'Nested User 2',
          40,
          44444444
        )
        // This will cause rollback to savepoint2, but savepoint1 should remain
        throw new Error('Nested operation error')
      },
      onError: 'continue'
    }
  ])
  console.log('   ✓ Nested transaction with partial rollback:', nestedResult.success)

  db.close()
}

async function testHealthMonitor(config: DatabaseConfig) {
  const dbPath = path.join(config.path, config.name)
  const db = new Database(dbPath)

  // Create basic tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      edad INTEGER NOT NULL,
      dni INTEGER NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const recoveryManager = new ErrorRecoveryManager(config)
  const healthMonitor = new DatabaseHealthMonitor(db, recoveryManager, {
    checkInterval: 1000,
    enableContinuousMonitoring: false // Disable for testing
  })

  // Perform health check
  const healthResult = await healthMonitor.performHealthCheck()
  console.log('   ✓ Health check result:', healthResult.healthy ? 'Healthy' : 'Unhealthy')
  console.log('   ✓ Response time:', healthResult.metrics.responseTime + 'ms')
  console.log('   ✓ Issues found:', healthResult.issues.length)

  // Test health trends (need some metrics first)
  await healthMonitor.performHealthCheck()
  await new Promise((resolve) => setTimeout(resolve, 100))
  await healthMonitor.performHealthCheck()

  const trends = healthMonitor.getHealthTrends()
  console.log('   ✓ Average response time:', trends.averageResponseTime.toFixed(2) + 'ms')
  console.log('   ✓ Healthy percentage:', (trends.healthyPercentage * 100).toFixed(1) + '%')

  // Test event handling
  let eventReceived = false
  healthMonitor.once('health-ok', () => {
    eventReceived = true
  })

  await healthMonitor.performHealthCheck()
  console.log('   ✓ Health event received:', eventReceived)

  db.close()
}

async function testComprehensiveRecovery(config: DatabaseConfig) {
  const recoveryManager = new ErrorRecoveryManager(config)

  // Test comprehensive recovery on non-existent database
  const dbPath = path.join(config.path, 'non-existent.db')
  const recoveryResult = await recoveryManager.performComprehensiveRecovery(dbPath, async () => {
    throw new Error('Database not found')
  })

  console.log('   ✓ Comprehensive recovery action:', recoveryResult.action)
  console.log('   ✓ Recovery success:', recoveryResult.success)
  console.log('   ✓ Recovery details:', recoveryResult.details)
}

// Run the tests
if (require.main === module) {
  testErrorRecoverySimple().catch(console.error)
}

export { testErrorRecoverySimple }
