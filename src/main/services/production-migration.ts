import { app } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import { databaseService } from './database-service'
import { DataMigrator } from './data-migrator'
import { UserRepository } from '../repositories/user-repository'
import { AuthRepository } from '../repositories/auth-repository'
import { UserStorageData } from '../types'

/**
 * Production migration manager for final LightDB migration
 * Handles complete migration, validation, and cleanup
 */
export class ProductionMigration {
  private userDataPath: string
  private jsonFilePath: string
  private backupJsonPath: string
  private migrationLogPath: string

  constructor() {
    this.userDataPath = app.getPath('userData')
    this.jsonFilePath = join(this.userDataPath, 'users.json')
    this.backupJsonPath = join(this.userDataPath, 'users.backup.json')
    this.migrationLogPath = join(this.userDataPath, 'production-migration.log')
  }

  /**
   * Execute complete production migration
   */
  async executeProductionMigration(): Promise<ProductionMigrationResult> {
    const startTime = Date.now()
    const log: string[] = []

    try {
      log.push(`[${new Date().toISOString()}] Starting production migration`)

      // Step 1: Initialize database
      await this.initializeDatabase()
      log.push(`[${new Date().toISOString()}] Database initialized`)

      // Step 2: Create pre-migration backup
      const backupPath = await this.createPreMigrationBackup()
      log.push(`[${new Date().toISOString()}] Pre-migration backup created: ${backupPath}`)

      // Step 3: Execute data migration
      const migrationResult = await this.executeMigration()
      log.push(
        `[${new Date().toISOString()}] Data migration completed: ${migrationResult.migratedUsers} users migrated`
      )

      // Step 4: Validate migrated data
      const validationResult = await this.validateMigratedData()
      log.push(
        `[${new Date().toISOString()}] Data validation completed: ${validationResult.isValid ? 'PASSED' : 'FAILED'}`
      )

      if (!validationResult.isValid) {
        throw new Error(`Data validation failed: ${validationResult.errors.join(', ')}`)
      }

      // Step 5: Create final backup of JSON files before cleanup
      const finalBackupPath = await this.createFinalBackup()
      log.push(`[${new Date().toISOString()}] Final JSON backup created: ${finalBackupPath}`)

      // Step 6: Remove legacy JSON files
      await this.removeLegacyFiles()
      log.push(`[${new Date().toISOString()}] Legacy JSON files removed`)

      const duration = Date.now() - startTime
      log.push(
        `[${new Date().toISOString()}] Production migration completed successfully in ${duration}ms`
      )

      // Write migration log
      await this.writeMigrationLog(log)

      return {
        success: true,
        migratedUsers: migrationResult.migratedUsers,
        validationPassed: validationResult.isValid,
        backupPath,
        finalBackupPath,
        duration,
        log
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      log.push(`[${new Date().toISOString()}] ERROR: ${errorMsg}`)

      // Write error log
      await this.writeMigrationLog(log)

      return {
        success: false,
        migratedUsers: 0,
        validationPassed: false,
        backupPath: '',
        finalBackupPath: '',
        duration: Date.now() - startTime,
        log,
        error: errorMsg
      }
    }
  }

  /**
   * Initialize database service
   */
  private async initializeDatabase(): Promise<void> {
    await databaseService.initialize()
  }

  /**
   * Create comprehensive pre-migration backup
   */
  private async createPreMigrationBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupDir = join(
      this.userDataPath,
      'production-migration-backups',
      `pre-migration-${timestamp}`
    )

    await fs.mkdir(backupDir, { recursive: true })

    // Backup JSON files if they exist
    const filesToBackup = [
      { src: this.jsonFilePath, dest: join(backupDir, 'users.json') },
      { src: this.backupJsonPath, dest: join(backupDir, 'users.backup.json') }
    ]

    for (const file of filesToBackup) {
      try {
        await fs.access(file.src)
        await fs.copyFile(file.src, file.dest)
      } catch (error) {
        // File doesn't exist, skip
      }
    }

    // Create backup manifest
    const manifest = {
      timestamp: new Date().toISOString(),
      type: 'production-pre-migration-backup',
      files: await this.getBackupFileList(backupDir)
    }

    await fs.writeFile(join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

    return backupDir
  }

  /**
   * Execute data migration using DataMigrator
   */
  private async executeMigration(): Promise<{ migratedUsers: number }> {
    const databaseManager = databaseService.getDatabaseManager()
    const dataMigrator = new DataMigrator(databaseManager)

    const result = await dataMigrator.migrateFromJSON()

    if (!result.success) {
      throw new Error(`Migration failed: ${result.errors.join(', ')}`)
    }

    return { migratedUsers: result.migratedUsers }
  }

  /**
   * Validate all migrated data integrity
   */
  private async validateMigratedData(): Promise<ValidationResult> {
    const errors: string[] = []
    let originalUserCount = 0
    let migratedUserCount = 0

    try {
      // Load original JSON data for comparison
      const originalData = await this.loadOriginalJSONData()
      originalUserCount = originalData.users.length

      // Load migrated data from LightDB
      const databaseManager = databaseService.getDatabaseManager()
      const db = await databaseManager.getDatabase()
      const userRepository = new UserRepository(db)
      const migratedUsers = await userRepository.findAll()
      migratedUserCount = migratedUsers.length

      // Validate user count matches
      if (originalUserCount !== migratedUserCount) {
        errors.push(
          `User count mismatch: original=${originalUserCount}, migrated=${migratedUserCount}`
        )
      }

      // Validate each user data integrity
      for (const originalUser of originalData.users) {
        const migratedUser = migratedUsers.find((u) => u.id === originalUser.id)

        if (!migratedUser) {
          errors.push(`User ${originalUser.id} not found in migrated data`)
          continue
        }

        // Validate user fields
        if (migratedUser.nombre !== originalUser.nombre) {
          errors.push(`User ${originalUser.id}: nombre mismatch`)
        }
        if (migratedUser.edad !== originalUser.edad) {
          errors.push(`User ${originalUser.id}: edad mismatch`)
        }
        if (migratedUser.dni !== originalUser.dni) {
          errors.push(`User ${originalUser.id}: dni mismatch`)
        }
      }

      // Validate DNI uniqueness in migrated data
      const dniCounts = new Map<number, number>()
      for (const user of migratedUsers) {
        dniCounts.set(user.dni, (dniCounts.get(user.dni) || 0) + 1)
      }

      for (const [dni, count] of dniCounts) {
        if (count > 1) {
          errors.push(`Duplicate DNI found in migrated data: ${dni} (${count} occurrences)`)
        }
      }

      // Validate auth system initialization
      const authRepository = new AuthRepository(db)
      const adminUser = await authRepository.findUserByUsername('admin')

      if (!adminUser) {
        errors.push('Default admin user not created during migration')
      }
    } catch (error) {
      errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    return {
      isValid: errors.length === 0,
      originalUserCount,
      migratedUserCount,
      errors
    }
  }

  /**
   * Create final backup before removing JSON files
   */
  private async createFinalBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupDir = join(
      this.userDataPath,
      'production-migration-backups',
      `final-json-backup-${timestamp}`
    )

    await fs.mkdir(backupDir, { recursive: true })

    // Backup JSON files if they exist
    const filesToBackup = [
      { src: this.jsonFilePath, dest: join(backupDir, 'users.json') },
      { src: this.backupJsonPath, dest: join(backupDir, 'users.backup.json') }
    ]

    for (const file of filesToBackup) {
      try {
        await fs.access(file.src)
        await fs.copyFile(file.src, file.dest)
      } catch (error) {
        // File doesn't exist, skip
      }
    }

    // Create backup manifest
    const manifest = {
      timestamp: new Date().toISOString(),
      type: 'production-final-json-backup',
      note: 'Final backup of JSON files before removal',
      files: await this.getBackupFileList(backupDir)
    }

    await fs.writeFile(join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

    return backupDir
  }

  /**
   * Remove legacy JSON files
   */
  private async removeLegacyFiles(): Promise<void> {
    const filesToRemove = [this.jsonFilePath, this.backupJsonPath]

    for (const filePath of filesToRemove) {
      try {
        await fs.access(filePath)
        await fs.unlink(filePath)
        console.log(`Removed legacy file: ${filePath}`)
      } catch (error) {
        // File doesn't exist, skip
        console.log(`Legacy file not found (already removed): ${filePath}`)
      }
    }
  }

  /**
   * Load original JSON data for validation
   */
  private async loadOriginalJSONData(): Promise<UserStorageData> {
    try {
      const fileContent = await fs.readFile(this.jsonFilePath, 'utf8')
      return JSON.parse(fileContent) as UserStorageData
    } catch (error) {
      // Try backup file
      try {
        const backupContent = await fs.readFile(this.backupJsonPath, 'utf8')
        return JSON.parse(backupContent) as UserStorageData
      } catch (backupError) {
        throw new Error('No JSON data found for validation')
      }
    }
  }

  /**
   * Get list of files in backup directory
   */
  private async getBackupFileList(backupDir: string): Promise<string[]> {
    try {
      const files = await fs.readdir(backupDir)
      return files.filter((file) => file !== 'manifest.json')
    } catch (error) {
      return []
    }
  }

  /**
   * Write migration log to file
   */
  private async writeMigrationLog(log: string[]): Promise<void> {
    const logContent = log.join('\n')
    await fs.writeFile(this.migrationLogPath, logContent, 'utf8')
  }
}

export interface ProductionMigrationResult {
  success: boolean
  migratedUsers: number
  validationPassed: boolean
  backupPath: string
  finalBackupPath: string
  duration: number
  log: string[]
  error?: string
}

interface ValidationResult {
  isValid: boolean
  originalUserCount: number
  migratedUserCount: number
  errors: string[]
}
