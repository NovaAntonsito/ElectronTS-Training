import { promises as fs } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { DataMigrator } from './services/data-migrator'
import { DatabaseManager } from './services/database-manager'
import { databaseConfig } from './config/database'
import { User, UserStorageData } from './types'

/**
 * Test script for DataMigrator functionality
 */
export async function testDataMigrator(): Promise<void> {
  console.log('🧪 Starting DataMigrator test...')

  try {
    // Step 1: Create test JSON data
    await createTestJSONData()
    console.log('✅ Test JSON data created')

    // Step 2: Initialize database manager
    const dbManager = new DatabaseManager(databaseConfig)
    await dbManager.initialize()
    console.log('✅ Database manager initialized')

    // Step 3: Create and run data migrator
    const dataMigrator = new DataMigrator(dbManager)
    const result = await dataMigrator.migrateFromJSON()

    // Step 4: Display results
    console.log('\n📊 Migration Results:')
    console.log(`Success: ${result.success}`)
    console.log(`Migrated Users: ${result.migratedUsers}`)
    console.log(`Created Auth Users: ${result.createdAuthUsers}`)
    console.log(`Duration: ${result.duration}ms`)
    console.log(`Backup Path: ${result.backupPath}`)

    if (result.errors.length > 0) {
      console.log(`Errors: ${result.errors.length}`)
      result.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`)
      })
    }

    console.log('\n🔍 Validation Results:')
    console.log(`Valid: ${result.validationResult.isValid}`)
    console.log(`Total Users: ${result.validationResult.totalUsers}`)
    console.log(`Valid Users: ${result.validationResult.validUsers}`)
    console.log(`Invalid Users: ${result.validationResult.invalidUsers}`)

    if (result.validationResult.duplicateDnis.length > 0) {
      console.log(`Duplicate DNIs: ${result.validationResult.duplicateDnis.join(', ')}`)
    }

    // Step 5: Verify data in database
    await verifyMigratedData(dbManager)

    // Step 6: Cleanup
    await dbManager.disconnect()
    console.log('✅ Database connection closed')

    console.log('\n🎉 DataMigrator test completed successfully!')
  } catch (error) {
    console.error('❌ DataMigrator test failed:', error)
    throw error
  }
}

/**
 * Create test JSON data for migration testing
 */
async function createTestJSONData(): Promise<void> {
  const userDataPath = app.getPath('userData')
  const jsonFilePath = join(userDataPath, 'users.json')

  // Create sample users
  const testUsers: User[] = [
    {
      id: uuidv4(),
      nombre: 'Juan Pérez',
      edad: 30,
      dni: 12345678
    },
    {
      id: uuidv4(),
      nombre: 'María García',
      edad: 25,
      dni: 87654321
    },
    {
      id: uuidv4(),
      nombre: 'Carlos López',
      edad: 45,
      dni: 11223344
    },
    {
      id: uuidv4(),
      nombre: 'Ana Martínez',
      edad: 35,
      dni: 44332211
    },
    {
      id: uuidv4(),
      nombre: 'Luis Rodríguez',
      edad: 28,
      dni: 55667788
    }
  ]

  const testData: UserStorageData = {
    users: testUsers,
    metadata: {
      version: '1.0',
      lastModified: new Date().toISOString()
    }
  }

  // Write test data to JSON file
  await fs.writeFile(jsonFilePath, JSON.stringify(testData, null, 2), 'utf8')
  console.log(`Test JSON data written to: ${jsonFilePath}`)
}

/**
 * Verify that data was correctly migrated to the database
 */
async function verifyMigratedData(dbManager: DatabaseManager): Promise<void> {
  console.log('\n🔍 Verifying migrated data...')

  const db = await dbManager.connect()

  // Check users table
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }
  console.log(`Users in database: ${userCount.count}`)

  const users = db.prepare('SELECT * FROM users ORDER BY nombre').all() as User[]
  console.log('Users:')
  users.forEach((user, index) => {
    console.log(`  ${index + 1}. ${user.nombre} (${user.edad} años, DNI: ${user.dni})`)
  })

  // Check auth_users table
  const authUserCount = db.prepare('SELECT COUNT(*) as count FROM auth_users').get() as {
    count: number
  }
  console.log(`\nAuth users in database: ${authUserCount.count}`)

  const authUsers = db.prepare('SELECT username, display_name, active FROM auth_users').all()
  console.log('Auth users:')
  authUsers.forEach((authUser: any, index) => {
    console.log(
      `  ${index + 1}. ${authUser.username} (${authUser.display_name}) - Active: ${authUser.active}`
    )
  })

  // Verify data integrity
  const expectedUserNames = [
    'Ana Martínez',
    'Carlos López',
    'Juan Pérez',
    'Luis Rodríguez',
    'María García'
  ]
  const actualUserNames = users.map((u) => u.nombre).sort()

  const namesMatch = JSON.stringify(expectedUserNames) === JSON.stringify(actualUserNames)
  console.log(`\nData integrity check: ${namesMatch ? '✅ PASSED' : '❌ FAILED'}`)

  if (!namesMatch) {
    console.log('Expected:', expectedUserNames)
    console.log('Actual:', actualUserNames)
  }
}

/**
 * Clean up test data (optional)
 */
export async function cleanupTestData(): Promise<void> {
  try {
    const userDataPath = app.getPath('userData')
    const jsonFilePath = join(userDataPath, 'users.json')
    const backupJsonPath = join(userDataPath, 'users.backup.json')

    // Remove test JSON files
    try {
      await fs.unlink(jsonFilePath)
      console.log('✅ Test JSON file removed')
    } catch (error) {
      // File might not exist, ignore
    }

    try {
      await fs.unlink(backupJsonPath)
      console.log('✅ Backup JSON file removed')
    } catch (error) {
      // File might not exist, ignore
    }

    console.log('🧹 Test data cleanup completed')
  } catch (error) {
    console.error('❌ Failed to cleanup test data:', error)
  }
}
