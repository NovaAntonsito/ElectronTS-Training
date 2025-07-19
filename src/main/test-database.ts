// Simple test script to verify database configuration
import { databaseService } from './services/database-service'

async function testDatabase() {
  try {
    console.log('Testing database initialization...')

    // Initialize database service
    await databaseService.initialize()
    console.log('✓ Database service initialized successfully')

    // Get database manager
    const dbManager = databaseService.getDatabaseManager()
    console.log('✓ Database manager obtained')

    // Test health check
    const isHealthy = await dbManager.healthCheck()
    console.log(`✓ Database health check: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`)

    // Test database connection
    dbManager.getDatabase()
    console.log('✓ Database connection obtained')

    // Shutdown
    await databaseService.shutdown()
    console.log('✓ Database service shut down successfully')

    console.log('\n🎉 All database tests passed!')
  } catch (error) {
    console.error('❌ Database test failed:', error)
    process.exit(1)
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  testDatabase()
}

export { testDatabase }
