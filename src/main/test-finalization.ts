import { app } from 'electron'
import { MigrationFinalizer } from './services/migration-finalizer'

/**
 * Simple test script to verify migration finalization functionality
 */
async function testFinalization() {
  console.log('🧪 Testing Migration Finalization')
  console.log('=================================')

  try {
    // Initialize Electron app context
    if (!app.isReady()) {
      await app.whenReady()
    }

    const migrationFinalizer = new MigrationFinalizer()

    // Test 1: Check migration status
    console.log('📋 Test 1: Checking migration status...')
    const status = await migrationFinalizer.getMigrationStatus()
    console.log(`   Status: ${status.status}`)
    console.log(`   Storage: ${status.storageType}`)
    console.log(`   Completed: ${status.completedAt || 'Not completed'}`)
    console.log('')

    // Test 2: Check if already finalized
    console.log('🔍 Test 2: Checking if migration is already finalized...')
    const isFinalized = await migrationFinalizer.isMigrationFinalized()
    console.log(`   Already finalized: ${isFinalized ? '✅' : '❌'}`)
    console.log('')

    if (isFinalized) {
      console.log('✅ Migration is already completed!')
      console.log('   No further action needed.')
    } else {
      console.log('⏳ Migration is pending finalization.')
      console.log('   Run the finalization script to complete the migration.')
    }

    console.log('')
    console.log('🎯 Test completed successfully!')
  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : 'Unknown error')
    process.exit(1)
  }
}

// Run the test
if (require.main === module) {
  testFinalization().catch((error) => {
    console.error('Fatal test error:', error)
    process.exit(1)
  })
}

export { testFinalization }
