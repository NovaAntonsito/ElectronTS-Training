import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs/promises'
import { DatabaseConfig } from '../config/database'
import { MigrationRunner, MigrationResult } from './migration-runner'
import { ErrorRecoveryManager, RecoveryOptions } from './error-recovery-manager'
import { TransactionManager } from './transaction-manager'
import { DatabaseHealthMonitor } from './database-health-monitor'

export class DatabaseManager {
  private db: Database.Database | null = null
  private config: DatabaseConfig
  private isInitialized = false
  private recoveryManager: ErrorRecoveryManager
  private transactionManager?: TransactionManager
  private healthMonitor?: DatabaseHealthMonitor

  constructor(config: DatabaseConfig, recoveryOptions?: Partial<RecoveryOptions>) {
    this.config = config
    this.recoveryManager = new ErrorRecoveryManager(config, recoveryOptions)
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      // Ensure database directory exists
      await this.ensureDirectoryExists()

      // Connect to database with recovery
      await this.connectWithRecovery()

      // Configure database pragmas
      await this.configurePragmas()

      // Run migrations with error handling
      await this.runMigrationsWithRecovery()

      // Initialize transaction manager
      this.transactionManager = new TransactionManager(this.db!, this.recoveryManager)

      // Initialize and start health monitoring
      this.healthMonitor = new DatabaseHealthMonitor(this.db!, this.recoveryManager)
      this.setupHealthMonitoringEvents()
      this.healthMonitor.startMonitoring()

      // Perform initial consistency check
      await this.performInitialConsistencyCheck()

      this.isInitialized = true
      console.log('DatabaseManager initialized successfully with error recovery')
    } catch (error) {
      console.error('Failed to initialize DatabaseManager:', error)

      // Attempt comprehensive recovery
      const recoveryResult = await this.recoveryManager.performComprehensiveRecovery(
        path.join(this.config.path, this.config.name),
        () => this.connect()
      )

      if (recoveryResult.success) {
        console.log('Database recovered successfully:', recoveryResult.details)
        // Retry initialization after recovery
        return this.initialize()
      } else {
        throw new Error(
          `Database initialization failed and recovery unsuccessful: ${recoveryResult.details}`
        )
      }
    }
  }

  async connect(): Promise<Database.Database> {
    if (this.db) {
      return this.db
    }

    try {
      const dbPath = path.join(this.config.path, this.config.name)
      this.db = new Database(dbPath)

      console.log(`Connected to database at: ${dbPath}`)
      return this.db
    } catch (error) {
      console.error('Failed to connect to database:', error)
      throw error
    }
  }

  async connectWithRetry(maxAttempts: number = 3): Promise<Database.Database> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.connect()
      } catch (error) {
        console.warn(`Database connection attempt ${attempt} failed:`, error)
        if (attempt === maxAttempts) {
          throw error
        }
        await this.delay(1000 * attempt)
      }
    }
    throw new Error('Failed to connect after maximum attempts')
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      try {
        this.db.close()
        this.db = null
        console.log('Database connection closed')
      } catch (error) {
        console.error('Error closing database connection:', error)
        throw error
      }
    }
  }

  async runMigrations(): Promise<MigrationResult> {
    if (!this.db) {
      throw new Error('Database not connected')
    }

    try {
      const migrationRunner = new MigrationRunner(this.db)

      // Validate migrations first
      const validation = await migrationRunner.validateMigrations(this.config.migrations)
      if (!validation.valid) {
        throw new Error(`Migration validation failed: ${validation.errors.join(', ')}`)
      }

      // Run pending migrations
      const result = await migrationRunner.runPendingMigrations(this.config.migrations)

      if (!result.success) {
        throw new Error(`Migration failed: ${result.errors.join(', ')}`)
      }

      console.log(`Migrations completed. Current version: ${result.currentVersion}`)
      return result
    } catch (error) {
      console.error('Migration failed:', error)
      throw error
    }
  }

  async backup(): Promise<string> {
    if (!this.db) {
      throw new Error('Database not connected')
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupPath = path.join(this.config.path, `backup-${timestamp}.db`)

      // Create backup using better-sqlite3's backup functionality
      this.db.backup(backupPath)

      console.log(`Database backup created at: ${backupPath}`)
      return backupPath
    } catch (error) {
      console.error('Backup failed:', error)
      throw error
    }
  }

  async restore(backupPath: string): Promise<void> {
    try {
      // Disconnect current database
      await this.disconnect()

      // Copy backup to main database location
      const mainDbPath = path.join(this.config.path, this.config.name)
      await fs.copyFile(backupPath, mainDbPath)

      // Reconnect
      await this.connect()

      console.log(`Database restored from: ${backupPath}`)
    } catch (error) {
      console.error('Restore failed:', error)
      throw error
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.db) {
        return false
      }

      // Simple query to check database health
      this.db.exec('SELECT 1')
      return true
    } catch (error) {
      console.error('Health check failed:', error)
      return false
    }
  }

  getDatabase(): Database.Database {
    if (!this.db) {
      throw new Error('Database not connected. Call initialize() first.')
    }
    return this.db
  }

  getTransactionManager(): TransactionManager {
    if (!this.transactionManager) {
      throw new Error('Transaction manager not initialized. Call initialize() first.')
    }
    return this.transactionManager
  }

  getHealthMonitor(): DatabaseHealthMonitor {
    if (!this.healthMonitor) {
      throw new Error('Health monitor not initialized. Call initialize() first.')
    }
    return this.healthMonitor
  }

  getRecoveryManager(): ErrorRecoveryManager {
    return this.recoveryManager
  }

  private async ensureDirectoryExists(): Promise<void> {
    try {
      await fs.mkdir(this.config.path, { recursive: true })
    } catch (error) {
      console.error('Failed to create database directory:', error)
      throw error
    }
  }

  private async configurePragmas(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected')
    }

    try {
      const pragmas = this.config.pragmas

      this.db.exec(`PRAGMA journal_mode = ${pragmas.journal_mode}`)
      this.db.exec(`PRAGMA synchronous = ${pragmas.synchronous}`)
      this.db.exec(`PRAGMA cache_size = ${pragmas.cache_size}`)
      this.db.exec(`PRAGMA temp_store = ${pragmas.temp_store}`)
      this.db.exec(`PRAGMA mmap_size = ${pragmas.mmap_size}`)

      console.log('Database pragmas configured')
    } catch (error) {
      console.error('Failed to configure pragmas:', error)
      throw error
    }
  }

  private async connectWithRecovery(): Promise<void> {
    const recoveryResult = await this.recoveryManager.attemptReconnection(() => this.connect())

    if (!recoveryResult.success) {
      throw new Error(`Failed to connect with recovery: ${recoveryResult.details}`)
    }
  }

  private async runMigrationsWithRecovery(): Promise<void> {
    try {
      await this.runMigrations()
    } catch (error) {
      console.error('Migration failed, attempting recovery:', error)

      // Try to detect and repair corruption first
      const corruptionResult = await this.recoveryManager.detectAndRepairCorruption(this.db!)

      if (corruptionResult.isCorrupted && corruptionResult.repairSuccessful) {
        console.log('Database corruption repaired, retrying migrations')
        await this.runMigrations()
      } else {
        throw error
      }
    }
  }

  private setupHealthMonitoringEvents(): void {
    if (!this.healthMonitor) return

    this.healthMonitor.on('health-degraded', (result) => {
      console.warn('Database health degraded:', result.issues.map((i) => i.message).join(', '))
    })

    this.healthMonitor.on('health-ok', () => {
      console.log('Database health check passed')
    })

    this.healthMonitor.on('health-check-failed', (result) => {
      console.error('Database health check failed:', result.metrics.lastError?.message)
    })

    this.healthMonitor.on('auto-recovery-success', ({ issue, recoveryResult }) => {
      console.log(`Auto-recovery successful for ${issue.type}: ${recoveryResult?.details}`)
    })

    this.healthMonitor.on('auto-recovery-failed', ({ issue, recoveryResult }) => {
      console.error(`Auto-recovery failed for ${issue.type}: ${recoveryResult?.details}`)
    })

    this.healthMonitor.on('auto-recovery-error', ({ issue, error }) => {
      console.error(`Auto-recovery error for ${issue.type}:`, error)
    })
  }

  private async performInitialConsistencyCheck(): Promise<void> {
    try {
      const consistencyResult = await this.recoveryManager.verifyAndCorrectInconsistencies(this.db!)

      if (consistencyResult.inconsistenciesFound > 0) {
        console.warn(
          `Found ${consistencyResult.inconsistenciesFound} data inconsistencies, ` +
            `corrected ${consistencyResult.corrected}`
        )
      }

      if (consistencyResult.errors.length > 0) {
        console.error('Consistency check errors:', consistencyResult.errors)
      }
    } catch (error) {
      console.warn('Initial consistency check failed:', error)
      // Don't throw here as this is not critical for initialization
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
