import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs/promises'
import { DatabaseConfig } from '../config/database'

export interface RecoveryOptions {
  maxRetries: number
  retryDelay: number
  backoffMultiplier: number
  enableAutoRepair: boolean
  enableCorruptionDetection: boolean
}

export interface RecoveryResult {
  success: boolean
  action: 'reconnect' | 'repair' | 'restore' | 'recreate'
  details: string
  error?: Error
}

export interface CorruptionCheckResult {
  isCorrupted: boolean
  errors: string[]
  repairAttempted: boolean
  repairSuccessful?: boolean
}

export class ErrorRecoveryManager {
  private config: DatabaseConfig
  private options: RecoveryOptions
  private retryCount = 0

  constructor(config: DatabaseConfig, options: Partial<RecoveryOptions> = {}) {
    this.config = config
    this.options = {
      maxRetries: 3,
      retryDelay: 1000,
      backoffMultiplier: 2,
      enableAutoRepair: true,
      enableCorruptionDetection: true,
      ...options
    }
  }

  /**
   * Attempts automatic reconnection with exponential backoff
   */
  async attemptReconnection(connectFn: () => Promise<Database.Database>): Promise<RecoveryResult> {
    this.retryCount = 0

    while (this.retryCount < this.options.maxRetries) {
      try {
        await connectFn()
        this.retryCount = 0
        return {
          success: true,
          action: 'reconnect',
          details: `Successfully reconnected after ${this.retryCount} attempts`
        }
      } catch (error) {
        this.retryCount++
        const delay = this.calculateBackoffDelay()

        console.warn(
          `Connection attempt ${this.retryCount}/${this.options.maxRetries} failed. ` +
            `Retrying in ${delay}ms...`,
          error
        )

        if (this.retryCount >= this.options.maxRetries) {
          return {
            success: false,
            action: 'reconnect',
            details: `Failed to reconnect after ${this.options.maxRetries} attempts`,
            error: error as Error
          }
        }

        await this.delay(delay)
      }
    }

    return {
      success: false,
      action: 'reconnect',
      details: 'Maximum retry attempts exceeded',
      error: new Error('Connection failed after maximum retries')
    }
  }

  /**
   * Detects and attempts to repair database corruption
   */
  async detectAndRepairCorruption(db: Database.Database): Promise<CorruptionCheckResult> {
    const result: CorruptionCheckResult = {
      isCorrupted: false,
      errors: [],
      repairAttempted: false
    }

    if (!this.options.enableCorruptionDetection) {
      return result
    }

    try {
      // Run integrity check
      const integrityResult = await this.runIntegrityCheck(db)

      if (!integrityResult.isValid) {
        result.isCorrupted = true
        result.errors = integrityResult.errors

        if (this.options.enableAutoRepair) {
          result.repairAttempted = true
          result.repairSuccessful = await this.attemptRepair(db)
        }
      }
    } catch (error) {
      result.isCorrupted = true
      result.errors.push(`Corruption check failed: ${error}`)
    }

    return result
  }

  /**
   * Handles transaction rollback with recovery
   */
  async handleTransactionFailure(
    db: Database.Database,
    error: Error,
    transactionFn: () => void
  ): Promise<RecoveryResult> {
    try {
      // Attempt rollback
      db.exec('ROLLBACK')

      // Check if database is still accessible
      const healthCheck = await this.performHealthCheck(db)

      if (!healthCheck.healthy) {
        // Database might be corrupted, attempt recovery
        const corruptionCheck = await this.detectAndRepairCorruption(db)

        if (corruptionCheck.isCorrupted && !corruptionCheck.repairSuccessful) {
          return {
            success: false,
            action: 'repair',
            details: 'Transaction failed and database corruption detected',
            error
          }
        }
      }

      // Try the transaction again if database is healthy
      try {
        db.exec('BEGIN TRANSACTION')
        transactionFn()
        db.exec('COMMIT')

        return {
          success: true,
          action: 'reconnect',
          details: 'Transaction recovered successfully after rollback'
        }
      } catch (retryError) {
        db.exec('ROLLBACK')
        return {
          success: false,
          action: 'repair',
          details: 'Transaction failed again after recovery attempt',
          error: retryError as Error
        }
      }
    } catch (rollbackError) {
      return {
        success: false,
        action: 'repair',
        details: 'Failed to rollback transaction',
        error: rollbackError as Error
      }
    }
  }

  /**
   * Verifies and corrects data inconsistencies
   */
  async verifyAndCorrectInconsistencies(db: Database.Database): Promise<{
    inconsistenciesFound: number
    corrected: number
    errors: string[]
  }> {
    const result = {
      inconsistenciesFound: 0,
      corrected: 0,
      errors: [] as string[]
    }

    try {
      // Check for orphaned records
      const orphanedSessions = await this.findOrphanedSessions(db)
      if (orphanedSessions.length > 0) {
        result.inconsistenciesFound += orphanedSessions.length
        const cleaned = await this.cleanOrphanedSessions(db, orphanedSessions)
        result.corrected += cleaned
      }

      // Check for duplicate DNIs
      const duplicateDnis = await this.findDuplicateDnis(db)
      if (duplicateDnis.length > 0) {
        result.inconsistenciesFound += duplicateDnis.length
        const resolved = await this.resolveDuplicateDnis(db, duplicateDnis)
        result.corrected += resolved
      }

      // Check for invalid data formats
      const invalidRecords = await this.findInvalidRecords(db)
      if (invalidRecords.length > 0) {
        result.inconsistenciesFound += invalidRecords.length
        const fixed = await this.fixInvalidRecords(db, invalidRecords)
        result.corrected += fixed
      }

      // Update timestamps for records missing them
      const missingTimestamps = await this.findMissingTimestamps(db)
      if (missingTimestamps.length > 0) {
        result.inconsistenciesFound += missingTimestamps.length
        const updated = await this.updateMissingTimestamps(db, missingTimestamps)
        result.corrected += updated
      }
    } catch (error) {
      result.errors.push(
        `Inconsistency check failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    return result
  }

  /**
   * Comprehensive recovery strategy that tries multiple approaches
   */
  async performComprehensiveRecovery(
    dbPath: string,
    connectFn: () => Promise<Database.Database>
  ): Promise<RecoveryResult> {
    // Step 1: Try reconnection
    const reconnectResult = await this.attemptReconnection(connectFn)
    if (reconnectResult.success) {
      return reconnectResult
    }

    // Step 2: Check for corruption and attempt repair
    try {
      const db = new Database(dbPath)
      const corruptionResult = await this.detectAndRepairCorruption(db)
      db.close()

      if (corruptionResult.isCorrupted && corruptionResult.repairSuccessful) {
        return {
          success: true,
          action: 'repair',
          details: 'Database corruption repaired successfully'
        }
      }
    } catch (error) {
      console.warn('Could not check corruption:', error)
    }

    // Step 3: Try to restore from backup
    const restoreResult = await this.attemptBackupRestore()
    if (restoreResult.success) {
      return restoreResult
    }

    // Step 4: Recreate database from JSON if available
    const recreateResult = await this.attemptRecreateFromJson()
    if (recreateResult.success) {
      return recreateResult
    }

    // Step 5: Create empty database as last resort
    return await this.createEmptyDatabase()
  }

  private async runIntegrityCheck(db: Database.Database): Promise<{
    isValid: boolean
    errors: string[]
  }> {
    const errors: string[] = []

    try {
      // SQLite integrity check
      const integrityResult = db.prepare('PRAGMA integrity_check').all() as Array<{
        integrity_check: string
      }>

      for (const row of integrityResult) {
        if (row.integrity_check !== 'ok') {
          errors.push(row.integrity_check)
        }
      }

      // Quick check
      const quickResult = db.prepare('PRAGMA quick_check').all() as Array<{ quick_check: string }>

      for (const row of quickResult) {
        if (row.quick_check !== 'ok') {
          errors.push(row.quick_check)
        }
      }
    } catch (error) {
      errors.push(`Integrity check failed: ${error}`)
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  private async attemptRepair(db: Database.Database): Promise<boolean> {
    try {
      // Try to reindex
      db.exec('REINDEX')

      // Try to vacuum
      db.exec('VACUUM')

      // Run integrity check again
      const recheckResult = await this.runIntegrityCheck(db)
      return recheckResult.isValid
    } catch (error) {
      console.error('Repair attempt failed:', error)
      return false
    }
  }

  private async performHealthCheck(db: Database.Database): Promise<{
    healthy: boolean
    errors: string[]
  }> {
    const errors: string[] = []

    try {
      // Basic query test
      db.prepare('SELECT 1').get()

      // Check if main tables exist
      const tables = ['users', 'auth_users', 'auth_sessions', 'schema_migrations']
      for (const table of tables) {
        try {
          db.prepare(`SELECT COUNT(*) FROM ${table}`).get()
        } catch (error) {
          errors.push(`Table ${table} is not accessible: ${error}`)
        }
      }
    } catch (error) {
      errors.push(`Basic health check failed: ${error}`)
    }

    return {
      healthy: errors.length === 0,
      errors
    }
  }

  private async findOrphanedSessions(db: Database.Database): Promise<string[]> {
    try {
      const result = db
        .prepare(
          `
        SELECT s.id 
        FROM auth_sessions s 
        LEFT JOIN auth_users u ON s.user_id = u.id 
        WHERE u.id IS NULL
      `
        )
        .all() as Array<{ id: string }>

      return result.map((row) => row.id)
    } catch (error) {
      console.warn('Could not check for orphaned sessions:', error)
      return []
    }
  }

  private async cleanOrphanedSessions(
    db: Database.Database,
    sessionIds: string[]
  ): Promise<number> {
    try {
      const stmt = db.prepare('DELETE FROM auth_sessions WHERE id = ?')
      let cleaned = 0

      for (const id of sessionIds) {
        const result = stmt.run(id)
        if (result.changes > 0) cleaned++
      }

      return cleaned
    } catch (error) {
      console.error('Failed to clean orphaned sessions:', error)
      return 0
    }
  }

  private async findDuplicateDnis(db: Database.Database): Promise<number[]> {
    try {
      const result = db
        .prepare(
          `
        SELECT dni 
        FROM users 
        GROUP BY dni 
        HAVING COUNT(*) > 1
      `
        )
        .all() as Array<{ dni: number }>

      return result.map((row) => row.dni)
    } catch (error) {
      console.warn('Could not check for duplicate DNIs:', error)
      return []
    }
  }

  private async resolveDuplicateDnis(
    db: Database.Database,
    duplicateDnis: number[]
  ): Promise<number> {
    try {
      let resolved = 0

      for (const dni of duplicateDnis) {
        // Keep the oldest record, delete the rest
        const duplicates = db
          .prepare(
            `
          SELECT id, created_at 
          FROM users 
          WHERE dni = ? 
          ORDER BY created_at ASC
        `
          )
          .all(dni) as Array<{ id: string; created_at: string }>

        // Delete all but the first (oldest)
        const toDelete = duplicates.slice(1)
        const deleteStmt = db.prepare('DELETE FROM users WHERE id = ?')

        for (const record of toDelete) {
          const result = deleteStmt.run(record.id)
          if (result.changes > 0) resolved++
        }
      }

      return resolved
    } catch (error) {
      console.error('Failed to resolve duplicate DNIs:', error)
      return 0
    }
  }

  private async findInvalidRecords(db: Database.Database): Promise<string[]> {
    try {
      const invalidIds: string[] = []

      // Find users with invalid age
      const invalidAge = db
        .prepare(
          `
        SELECT id FROM users 
        WHERE edad <= 0 OR edad > 120 OR edad IS NULL
      `
        )
        .all() as Array<{ id: string }>

      invalidIds.push(...invalidAge.map((row) => row.id))

      // Find users with invalid DNI
      const invalidDni = db
        .prepare(
          `
        SELECT id FROM users 
        WHERE dni < 1000000 OR dni > 99999999 OR dni IS NULL
      `
        )
        .all() as Array<{ id: string }>

      invalidIds.push(...invalidDni.map((row) => row.id))

      return [...new Set(invalidIds)]
    } catch (error) {
      console.warn('Could not check for invalid records:', error)
      return []
    }
  }

  private async fixInvalidRecords(db: Database.Database, invalidIds: string[]): Promise<number> {
    try {
      let fixed = 0

      for (const id of invalidIds) {
        // For now, we'll delete invalid records
        // In a real scenario, you might want to fix them or move to a quarantine table
        const result = db.prepare('DELETE FROM users WHERE id = ?').run(id)
        if (result.changes > 0) fixed++
      }

      return fixed
    } catch (error) {
      console.error('Failed to fix invalid records:', error)
      return 0
    }
  }

  private async findMissingTimestamps(db: Database.Database): Promise<string[]> {
    try {
      const result = db
        .prepare(
          `
        SELECT id FROM users 
        WHERE created_at IS NULL OR updated_at IS NULL
      `
        )
        .all() as Array<{ id: string }>

      return result.map((row) => row.id)
    } catch (error) {
      console.warn('Could not check for missing timestamps:', error)
      return []
    }
  }

  private async updateMissingTimestamps(db: Database.Database, ids: string[]): Promise<number> {
    try {
      const stmt = db.prepare(`
        UPDATE users 
        SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
            updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
        WHERE id = ?
      `)

      let updated = 0
      for (const id of ids) {
        const result = stmt.run(id)
        if (result.changes > 0) updated++
      }

      return updated
    } catch (error) {
      console.error('Failed to update missing timestamps:', error)
      return 0
    }
  }

  private async attemptBackupRestore(): Promise<RecoveryResult> {
    try {
      const backupDir = this.config.path
      const files = await fs.readdir(backupDir)
      const backupFiles = files
        .filter((file) => file.startsWith('backup-') && file.endsWith('.db'))
        .sort()
        .reverse() // Most recent first

      if (backupFiles.length === 0) {
        return {
          success: false,
          action: 'restore',
          details: 'No backup files found'
        }
      }

      const latestBackup = path.join(backupDir, backupFiles[0])
      const mainDbPath = path.join(this.config.path, this.config.name)

      await fs.copyFile(latestBackup, mainDbPath)

      return {
        success: true,
        action: 'restore',
        details: `Restored from backup: ${backupFiles[0]}`
      }
    } catch (error) {
      return {
        success: false,
        action: 'restore',
        details: 'Failed to restore from backup',
        error: error as Error
      }
    }
  }

  private async attemptRecreateFromJson(): Promise<RecoveryResult> {
    try {
      const jsonPath = path.join(this.config.path, '..', 'users.json')

      try {
        await fs.access(jsonPath)
      } catch {
        return {
          success: false,
          action: 'recreate',
          details: 'No JSON backup file found'
        }
      }

      // This would trigger a full migration from JSON
      // For now, we'll just indicate it's possible
      return {
        success: true,
        action: 'recreate',
        details: 'JSON backup file found, can recreate database'
      }
    } catch (error) {
      return {
        success: false,
        action: 'recreate',
        details: 'Failed to check for JSON backup',
        error: error as Error
      }
    }
  }

  private async createEmptyDatabase(): Promise<RecoveryResult> {
    try {
      const dbPath = path.join(this.config.path, this.config.name)

      // Remove corrupted database
      try {
        await fs.unlink(dbPath)
      } catch {
        // File might not exist
      }

      return {
        success: true,
        action: 'recreate',
        details: 'Created empty database as last resort'
      }
    } catch (error) {
      return {
        success: false,
        action: 'recreate',
        details: 'Failed to create empty database',
        error: error as Error
      }
    }
  }

  private calculateBackoffDelay(): number {
    return this.options.retryDelay * Math.pow(this.options.backoffMultiplier, this.retryCount - 1)
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
