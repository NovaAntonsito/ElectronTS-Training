import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs/promises'
import { DatabaseConfig } from '../config/database'
import { MigrationRunner, MigrationResult } from './migration-runner'
import { ConnectionPool } from './connection-pool'
import { QueryAnalyzer, QueryAnalysis } from './query-analyzer'

export class OptimizedDatabaseManager {
  private connectionPool: ConnectionPool | null = null
  private queryAnalyzer: QueryAnalyzer | null = null
  private config: DatabaseConfig
  private isInitialized = false
  private mainConnection: Database.Database | null = null

  constructor(config: DatabaseConfig) {
    this.config = config
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      // Ensure database directory exists
      await this.ensureDirectoryExists()

      // Create main connection for setup
      await this.createMainConnection()

      // Configure database pragmas and optimizations
      await this.configureOptimizations()

      // Run migrations
      await this.runMigrations()

      // Initialize connection pool
      await this.initializeConnectionPool()

      // Initialize query analyzer
      this.initializeQueryAnalyzer()

      // Run initial analysis and optimization
      await this.runInitialOptimizations()

      this.isInitialized = true
      console.log('OptimizedDatabaseManager initialized successfully')
    } catch (error) {
      console.error('Failed to initialize OptimizedDatabaseManager:', error)
      throw error
    }
  }

  async getConnection(): Promise<Database.Database> {
    if (!this.connectionPool) {
      throw new Error('Connection pool not initialized')
    }

    return this.connectionPool.getConnection()
  }

  async releaseConnection(connection: Database.Database): Promise<void> {
    if (!this.connectionPool) {
      throw new Error('Connection pool not initialized')
    }

    await this.connectionPool.releaseConnection(connection)
  }

  async executeWithAnalysis<T>(
    query: string,
    params: any[] = [],
    operation: (db: Database.Database) => T
  ): Promise<{ result: T; analysis: QueryAnalysis }> {
    const connection = await this.getConnection()

    try {
      // Analyze the query
      const analysis = await this.queryAnalyzer!.analyzeQuery(query, params)

      // Execute the operation
      const result = operation(connection)

      return { result, analysis }
    } finally {
      await this.releaseConnection(connection)
    }
  }

  async optimizeDatabase(): Promise<void> {
    if (!this.mainConnection) {
      throw new Error('Main connection not available')
    }

    console.log('Starting database optimization...')

    try {
      // Update table statistics
      this.mainConnection.exec('ANALYZE')

      // Optimize database file
      this.mainConnection.exec('VACUUM')

      // Rebuild indexes if needed
      await this.rebuildIndexes()

      // Check for missing indexes based on query analysis
      await this.suggestOptimizations()

      console.log('Database optimization completed')
    } catch (error) {
      console.error('Database optimization failed:', error)
      throw error
    }
  }

  async getPerformanceStats(): Promise<{
    connectionPool: any
    queryStats: any
    databaseSize: number
    indexStats: any[]
  }> {
    if (!this.connectionPool || !this.queryAnalyzer || !this.mainConnection) {
      throw new Error('Manager not fully initialized')
    }

    const dbPath = path.join(this.config.path, this.config.name)
    const stats = await fs.stat(dbPath)

    // Get index statistics
    const indexStats = this.mainConnection
      .prepare(
        `
      SELECT 
        name,
        tbl_name,
        sql
      FROM sqlite_master 
      WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
      ORDER BY tbl_name, name
    `
      )
      .all()

    return {
      connectionPool: this.connectionPool.getStats(),
      queryStats: this.queryAnalyzer.getStats(),
      databaseSize: stats.size,
      indexStats
    }
  }

  async shutdown(): Promise<void> {
    try {
      if (this.connectionPool) {
        await this.connectionPool.closeAll()
      }

      if (this.mainConnection) {
        this.mainConnection.close()
        this.mainConnection = null
      }

      this.isInitialized = false
      console.log('OptimizedDatabaseManager shutdown completed')
    } catch (error) {
      console.error('Error during shutdown:', error)
      throw error
    }
  }

  private async createMainConnection(): Promise<void> {
    const dbPath = path.join(this.config.path, this.config.name)
    this.mainConnection = new Database(dbPath)
    console.log(`Main connection established to: ${dbPath}`)
  }

  private async configureOptimizations(): Promise<void> {
    if (!this.mainConnection) {
      throw new Error('Main connection not available')
    }

    try {
      const pragmas = this.config.pragmas

      // Basic performance pragmas
      this.mainConnection.exec(`PRAGMA journal_mode = ${pragmas.journal_mode}`)
      this.mainConnection.exec(`PRAGMA synchronous = ${pragmas.synchronous}`)
      this.mainConnection.exec(`PRAGMA cache_size = ${pragmas.cache_size}`)
      this.mainConnection.exec(`PRAGMA temp_store = ${pragmas.temp_store}`)
      this.mainConnection.exec(`PRAGMA mmap_size = ${pragmas.mmap_size}`)

      // Additional optimization pragmas
      this.mainConnection.exec('PRAGMA optimize')
      this.mainConnection.exec('PRAGMA auto_vacuum = INCREMENTAL')
      this.mainConnection.exec('PRAGMA page_size = 4096')
      this.mainConnection.exec('PRAGMA foreign_keys = ON')

      // Query optimization settings
      this.mainConnection.exec('PRAGMA query_only = OFF')
      this.mainConnection.exec('PRAGMA threads = 4')

      console.log('Database optimizations configured')
    } catch (error) {
      console.error('Failed to configure optimizations:', error)
      throw error
    }
  }

  private async initializeConnectionPool(): Promise<void> {
    const dbPath = path.join(this.config.path, this.config.name)

    this.connectionPool = new ConnectionPool(
      this.config.connectionPool,
      dbPath,
      this.config.pragmas
    )

    await this.connectionPool.initialize()
  }

  private initializeQueryAnalyzer(): void {
    if (!this.mainConnection) {
      throw new Error('Main connection not available')
    }

    this.queryAnalyzer = new QueryAnalyzer(this.mainConnection)
  }

  private async runInitialOptimizations(): Promise<void> {
    if (!this.mainConnection) {
      throw new Error('Main connection not available')
    }

    // Create additional composite indexes for common query patterns
    try {
      // Composite index for user searches (nombre + edad)
      this.mainConnection.exec(`
        CREATE INDEX IF NOT EXISTS idx_users_search_composite 
        ON users(nombre COLLATE NOCASE, edad DESC)
      `)

      // Composite index for auth user lookups
      this.mainConnection.exec(`
        CREATE INDEX IF NOT EXISTS idx_auth_users_login_composite 
        ON auth_users(username, active, failed_attempts)
      `)

      // Composite index for session management
      this.mainConnection.exec(`
        CREATE INDEX IF NOT EXISTS idx_sessions_management_composite 
        ON auth_sessions(user_id, expires_at DESC, token)
      `)

      // Partial index for active sessions only
      this.mainConnection.exec(`
        CREATE INDEX IF NOT EXISTS idx_active_sessions_only 
        ON auth_sessions(user_id, token) 
        WHERE expires_at > datetime('now')
      `)

      // Update statistics after creating indexes
      this.mainConnection.exec('ANALYZE')

      console.log('Initial database optimizations applied')
    } catch (error) {
      console.error('Failed to apply initial optimizations:', error)
      // Don't throw - these are optimizations, not critical
    }
  }

  private async rebuildIndexes(): Promise<void> {
    if (!this.mainConnection) {
      throw new Error('Main connection not available')
    }

    try {
      // Get all user-created indexes
      const indexes = this.mainConnection
        .prepare(
          `
        SELECT name FROM sqlite_master 
        WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
      `
        )
        .all() as { name: string }[]

      // Rebuild each index
      for (const index of indexes) {
        this.mainConnection.exec(`REINDEX ${index.name}`)
      }

      console.log(`Rebuilt ${indexes.length} indexes`)
    } catch (error) {
      console.error('Failed to rebuild indexes:', error)
      throw error
    }
  }

  private async suggestOptimizations(): Promise<void> {
    if (!this.queryAnalyzer) {
      return
    }

    const suggestions = this.queryAnalyzer.suggestIndexes()
    const slowQueries = this.queryAnalyzer.getSlowQueries(50) // Queries slower than 50ms

    if (suggestions.length > 0) {
      console.log('Index suggestions:')
      suggestions.forEach((suggestion) => console.log(`  - ${suggestion}`))
    }

    if (slowQueries.length > 0) {
      console.log(`Found ${slowQueries.length} slow queries:`)
      slowQueries.slice(0, 5).forEach((query) => {
        console.log(`  - ${query.executionTime.toFixed(2)}ms: ${query.query.substring(0, 100)}...`)
      })
    }
  }

  private async ensureDirectoryExists(): Promise<void> {
    try {
      await fs.mkdir(this.config.path, { recursive: true })
    } catch (error) {
      console.error('Failed to create database directory:', error)
      throw error
    }
  }

  private async runMigrations(): Promise<MigrationResult> {
    if (!this.mainConnection) {
      throw new Error('Main connection not available')
    }

    try {
      const migrationRunner = new MigrationRunner(this.mainConnection)

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
}
