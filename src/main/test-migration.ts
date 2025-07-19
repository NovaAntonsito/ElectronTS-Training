import { promises as fs } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { DataMigrator } from './services/data-migrator'
import { databaseService } from './services/database-service'
import { User, UserStorageData } from './types'

/**
 * Test the DataMigrator functionality
 */
export async function testMigration(): Promise<void> {
  console.log('🧪 Testing DataMigrator functionality...')

  try {
    // Step 1: Create test JSON data
    await createTestData()
    console.log('✅ Test data created')

    // Step 2: Get database manager from service
    const dbManager = databaseService.getDatabaseManager()

    // Step 3: Create and run data migrator
    const dataMigrator = new DataMigrator(dbManager)
    const result = await dataMigrator.migrateFromJSON()

    // Step 4: Display results
    console.log('\n📊 Migration Test Results:')
    console.log(`Success: ${result.success}`)
    console.log(`Migrated Users: ${result.migratedUsers}`)
    console.log(`Created Auth Users: ${result.createdAuthUsers}`)
    console.log(`Duration: ${result.duration}ms`)

    if (result.errors.length > 0) {
      console.log(`Errors (${result.errors.length}):`)
      result.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`)
      })
    }

    console.log('\n🔍 Validation:')
    console.log(`Valid: ${result.validationResult.isValid}`)
    console.log(`Total Users: ${result.validationResult.totalUsers}`)
    console.log(`Valid Users: ${result.validationResult.validUsers}`)

    // Step 5: Verify data in database
    await verifyData(dbManager)

    console.log('\n🎉 Migration test completed!')
  } catch (error) {
    console.error('❌ Migration test failed:', error)
    throw error
  }
}

/**
 * Create test JSON data
 */
async function createTestData(): Promise<void> {
  const userDataPath = app.getPath('userData')
  const jsonFilePath = join(userDataPath, 'users.json')

  const testUsers: User[] = [
    {
      id: uuidv4(),
      nombre: 'Test User 1',
      edad: 30,
      dni: 12345678
    },
    {
      id: uuidv4(),
      nombre: 'Test User 2',
      edad: 25,
      dni: 87654321
    }
  ]

  const testData: UserStorageData = {
    users: testUsers,
    metadata: {
      version: '1.0',
      lastModified: new Date().toISOString()
    }
  }

  await fs.writeFile(jsonFilePath, JSON.stringify(testData, null, 2), 'utf8')
}

/**
 * Verify migrated data
 */
async function verifyData(dbManager: any): Promise<void> {
  const db = await dbManager.connect()

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }
  console.log(`\n📊 Database contains ${userCount.count} users`)

  const authCount = db.prepare('SELECT COUNT(*) as count FROM auth_users').get() as {
    count: number
  }
  console.log(`📊 Database contains ${authCount.count} auth users`)
}
