import { ProductionMigration, ProductionMigrationResult } from './production-migration'
import { LegacyCleanup, CleanupResult } from './legacy-cleanup'
import { promises as fs } from 'fs'
import { join } from 'path'
import { app } from 'electron'

/**
 * Migration finalizer that orchestrates the complete migration finalization process
 * Executes production migration, validates data, and cleans up legacy files
 */
export class MigrationFinalizer {
  private userDataPath: string
  private finalizationLogPath: string

  constructor() {
    this.userDataPath = app.getPath('userData')
    this.finalizationLogPath = join(this.userDataPath, 'migration-finalization.log')
  }

  /**
   * Execute complete migration finalization
   */
  async finalizeMigration(): Promise<FinalizationResult> {
    const startTime = Date.now()
    const log: string[] = []

    try {
      log.push(`[${new Date().toISOString()}] Starting migration finalization`)
      log.push(`[${new Date().toISOString()}] User data path: ${this.userDataPath}`)

      // Step 1: Execute production migration
      log.push(`[${new Date().toISOString()}] Step 1: Executing production migration`)
      const productionMigration = new ProductionMigration()
      const migrationResult = await productionMigration.executeProductionMigration()

      if (!migrationResult.success) {
        throw new Error(`Production migration failed: ${migrationResult.error}`)
      }

      log.push(`[${new Date().toISOString()}] Production migration completed successfully`)
      log.push(`[${new Date().toISOString()}] - Migrated users: ${migrationResult.migratedUsers}`)
      log.push(
        `[${new Date().toISOString()}] - Validation passed: ${migrationResult.validationPassed}`
      )
      log.push(`[${new Date().toISOString()}] - Backup path: ${migrationResult.backupPath}`)

      // Step 2: Execute legacy cleanup
      log.push(`[${new Date().toISOString()}] Step 2: Executing legacy cleanup`)
      const legacyCleanup = new LegacyCleanup()
      const cleanupResult = await legacyCleanup.executeCleanup()

      if (!cleanupResult.success) {
        log.push(
          `[${new Date().toISOString()}] WARNING: Legacy cleanup had errors: ${cleanupResult.errors.join(', ')}`
        )
      } else {
        log.push(`[${new Date().toISOString()}] Legacy cleanup completed successfully`)
      }

      log.push(
        `[${new Date().toISOString()}] - Removed files: ${cleanupResult.removedFiles.length}`
      )

      // Step 3: Update configuration files
      log.push(`[${new Date().toISOString()}] Step 3: Updating configuration files`)
      await this.updateConfigurationFiles()
      log.push(`[${new Date().toISOString()}] Configuration files updated`)

      // Step 4: Create finalization summary
      const summary = await this.createFinalizationSummary(migrationResult, cleanupResult)
      log.push(`[${new Date().toISOString()}] Finalization summary created`)

      const duration = Date.now() - startTime
      log.push(
        `[${new Date().toISOString()}] Migration finalization completed successfully in ${duration}ms`
      )

      // Write finalization log
      await this.writeFinalizationLog(log)

      return {
        success: true,
        migrationResult,
        cleanupResult,
        summary,
        duration,
        log
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      log.push(`[${new Date().toISOString()}] ERROR: ${errorMsg}`)

      // Write error log
      await this.writeFinalizationLog(log)

      return {
        success: false,
        migrationResult: null,
        cleanupResult: null,
        summary: null,
        duration: Date.now() - startTime,
        log,
        error: errorMsg
      }
    }
  }

  /**
   * Update configuration files to reflect LightDB-only setup
   */
  private async updateConfigurationFiles(): Promise<void> {
    // Update package.json scripts if needed
    await this.updatePackageJsonScripts()

    // Create migration completion marker
    await this.createMigrationCompletionMarker()
  }

  /**
   * Update package.json scripts to remove migration-related scripts
   */
  private async updatePackageJsonScripts(): Promise<void> {
    try {
      const packageJsonPath = 'package.json'
      const packageContent = await fs.readFile(packageJsonPath, 'utf8')
      const packageJson = JSON.parse(packageContent)

      // Remove migration-related scripts if they exist
      if (packageJson.scripts) {
        delete packageJson.scripts['migrate:json-to-lightdb']
        delete packageJson.scripts['migrate:test']
        delete packageJson.scripts['migrate:rollback']
      }

      // Add production-ready scripts
      if (!packageJson.scripts['db:backup']) {
        packageJson.scripts['db:backup'] = 'electron . --db-backup'
      }

      await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2))
    } catch (error) {
      console.warn('Could not update package.json scripts:', error)
    }
  }

  /**
   * Create migration completion marker file
   */
  private async createMigrationCompletionMarker(): Promise<void> {
    const markerPath = join(this.userDataPath, '.lightdb-migration-complete')
    const markerData = {
      completedAt: new Date().toISOString(),
      version: '1.0.0',
      storageType: 'LightDB',
      migrationFinalized: true
    }

    await fs.writeFile(markerPath, JSON.stringify(markerData, null, 2))
  }

  /**
   * Create comprehensive finalization summary
   */
  private async createFinalizationSummary(
    migrationResult: ProductionMigrationResult,
    cleanupResult: CleanupResult
  ): Promise<FinalizationSummary> {
    return {
      timestamp: new Date().toISOString(),
      migration: {
        success: migrationResult.success,
        migratedUsers: migrationResult.migratedUsers,
        validationPassed: migrationResult.validationPassed,
        backupCreated: !!migrationResult.backupPath,
        duration: migrationResult.duration
      },
      cleanup: {
        success: cleanupResult.success,
        removedFiles: cleanupResult.removedFiles.length,
        errors: cleanupResult.errors.length,
        duration: cleanupResult.duration
      },
      system: {
        storageType: 'LightDB',
        legacyFilesRemoved: true,
        configurationUpdated: true,
        migrationComplete: true
      },
      nextSteps: [
        'Verify application functionality with LightDB',
        'Monitor database performance',
        'Set up regular backup schedule',
        'Remove any remaining test files manually if needed'
      ]
    }
  }

  /**
   * Write finalization log to file
   */
  private async writeFinalizationLog(log: string[]): Promise<void> {
    const logContent = log.join('\n')
    await fs.writeFile(this.finalizationLogPath, logContent, 'utf8')
  }

  /**
   * Check if migration has already been finalized
   */
  async isMigrationFinalized(): Promise<boolean> {
    try {
      const markerPath = join(this.userDataPath, '.lightdb-migration-complete')
      await fs.access(markerPath)
      return true
    } catch (error) {
      return false
    }
  }

  /**
   * Get migration status
   */
  async getMigrationStatus(): Promise<MigrationStatus> {
    const isFinalized = await this.isMigrationFinalized()

    if (isFinalized) {
      try {
        const markerPath = join(this.userDataPath, '.lightdb-migration-complete')
        const markerContent = await fs.readFile(markerPath, 'utf8')
        const markerData = JSON.parse(markerContent)

        return {
          status: 'completed',
          completedAt: markerData.completedAt,
          storageType: markerData.storageType,
          version: markerData.version
        }
      } catch (error) {
        return {
          status: 'completed',
          completedAt: 'unknown',
          storageType: 'LightDB',
          version: 'unknown'
        }
      }
    }

    return {
      status: 'pending',
      completedAt: null,
      storageType: 'transitioning',
      version: null
    }
  }
}

export interface FinalizationResult {
  success: boolean
  migrationResult: ProductionMigrationResult | null
  cleanupResult: CleanupResult | null
  summary: FinalizationSummary | null
  duration: number
  log: string[]
  error?: string
}

export interface FinalizationSummary {
  timestamp: string
  migration: {
    success: boolean
    migratedUsers: number
    validationPassed: boolean
    backupCreated: boolean
    duration: number
  }
  cleanup: {
    success: boolean
    removedFiles: number
    errors: number
    duration: number
  }
  system: {
    storageType: string
    legacyFilesRemoved: boolean
    configurationUpdated: boolean
    migrationComplete: boolean
  }
  nextSteps: string[]
}

export interface MigrationStatus {
  status: 'pending' | 'completed'
  completedAt: string | null
  storageType: string
  version: string | null
}
