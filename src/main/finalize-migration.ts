#!/usr/bin/env node

/**
 * Migration Finalization Script
 *
 * This script executes the complete migration finalization process:
 * 1. Execute production migration
 * 2. Validate data integrity
 * 3. Remove legacy files
 * 4. Update configurations
 *
 * Run this script to complete Task 13 of the LightDB migration.
 */

import { app } from 'electron'
import { MigrationFinalizer } from './services/migration-finalizer'

async function main() {
  console.log('🚀 Starting LightDB Migration Finalization')
  console.log('==========================================')

  try {
    // Initialize Electron app context
    if (!app.isReady()) {
      await app.whenReady()
    }

    // Create migration finalizer
    const migrationFinalizer = new MigrationFinalizer()

    // Check if migration is already finalized
    const status = await migrationFinalizer.getMigrationStatus()

    if (status.status === 'completed') {
      console.log('✅ Migration already completed!')
      console.log(`   Completed at: ${status.completedAt}`)
      console.log(`   Storage type: ${status.storageType}`)
      console.log(`   Version: ${status.version}`)
      return
    }

    console.log('📋 Migration Status: Pending')
    console.log('🔄 Starting finalization process...')
    console.log('')

    // Execute migration finalization
    const result = await migrationFinalizer.finalizeMigration()

    if (result.success) {
      console.log('✅ Migration Finalization COMPLETED!')
      console.log('=====================================')
      console.log('')

      if (result.migrationResult) {
        console.log('📊 Migration Results:')
        console.log(`   • Users migrated: ${result.migrationResult.migratedUsers}`)
        console.log(
          `   • Validation passed: ${result.migrationResult.validationPassed ? '✅' : '❌'}`
        )
        console.log(`   • Backup created: ${result.migrationResult.backupPath ? '✅' : '❌'}`)
        console.log(`   • Duration: ${result.migrationResult.duration}ms`)
        console.log('')
      }

      if (result.cleanupResult) {
        console.log('🧹 Cleanup Results:')
        console.log(`   • Files removed: ${result.cleanupResult.removedFiles.length}`)
        console.log(`   • Errors: ${result.cleanupResult.errors.length}`)
        console.log(`   • Duration: ${result.cleanupResult.duration}ms`)
        console.log('')
      }

      if (result.summary) {
        console.log('📋 Summary:')
        console.log(`   • Storage type: ${result.summary.system.storageType}`)
        console.log(
          `   • Legacy files removed: ${result.summary.system.legacyFilesRemoved ? '✅' : '❌'}`
        )
        console.log(
          `   • Configuration updated: ${result.summary.system.configurationUpdated ? '✅' : '❌'}`
        )
        console.log(
          `   • Migration complete: ${result.summary.system.migrationComplete ? '✅' : '❌'}`
        )
        console.log('')

        console.log('📝 Next Steps:')
        result.summary.nextSteps.forEach((step, index) => {
          console.log(`   ${index + 1}. ${step}`)
        })
      }

      console.log('')
      console.log('🎉 Task 13 - Finalizar migración y limpieza: COMPLETED!')
      console.log('')
      console.log('The application now exclusively uses LightDB for data storage.')
      console.log('Legacy JSON file support has been completely removed.')
      console.log('All migration artifacts have been cleaned up.')
      console.log('')
      console.log('Log files created:')
      console.log('  • production-migration.log')
      console.log('  • migration-finalization.log')
      console.log('')
    } else {
      console.error('❌ Migration Finalization FAILED!')
      console.error('===================================')
      console.error('')
      console.error(`Error: ${result.error}`)
      console.error('')
      console.error('Check the logs for detailed error information:')
      console.error('  • production-migration.log')
      console.error('  • migration-finalization.log')
      console.error('')

      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Fatal Error during migration finalization:')
    console.error(error instanceof Error ? error.message : 'Unknown error')
    console.error('')
    process.exit(1)
  }
}

// Run the migration finalization
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}

export { main as finalizeMigration }
