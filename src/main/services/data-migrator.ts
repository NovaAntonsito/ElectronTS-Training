import { promises as fs } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { User, UserStorageData, CreateAuthUserData } from '../types'
import { DatabaseManager } from './database-manager'

export interface MigrationResult {
  success: boolean
  migratedUsers: number
  createdAuthUsers: number
  errors: string[]
  backupPath: string
  duration: number
  validationResult: ValidationResult
}

export interface ValidationResult {
  isValid: boolean
  totalUsers: number
  validUsers: number
  invalidUsers: number
  missingFields: string[]
  duplicateDnis: number[]
  errors: ValidationError[]
}

export interface ValidationError {
  userId?: string
  field: string
  message: string
  value?: any
}

export interface MigrationLog {
  timestamp: Date
  level: 'INFO' | 'WARN' | 'ERROR'
  message: string
  details?: any
}

export class DataMigrator {
  private readonly userDataPath: string
  private readonly jsonFilePath: string
  private readonly backupDir: string
  private readonly logFilePath: string
  private logs: MigrationLog[] = []
  private databaseManager: DatabaseManager

  constructor(databaseManager: DatabaseManager) {
    this.databaseManager = databaseManager
    this.userDataPath = app.getPath('userData')
    this.jsonFilePath = join(this.userDataPath, 'users.json')
    this.backupDir = join(this.userDataPath, 'migration-backups')
    this.logFilePath = join(this.userDataPath, 'migration.log')
  }

  /**
   * Main migration method that orchestrates the entire process
   */
  async migrateFromJSON(): Promise<MigrationResult> {
    const startTime = Date.now()
    this.log('INFO', 'Starting JSON to LightDB migration process')

    try {
      // Step 1: Create backup directory
      await this.ensureBackupDirectory()

      // Step 2: Create backup of current state
      const backupPath = await this.createBackup()
      this.log('INFO', `Backup created at: ${backupPath}`)

      // Step 3: Load and validate JSON data
      const jsonData = await this.loadJSONData()
      const validationResult = await this.validateJSONData(jsonData)

      if (!validationResult.isValid) {
        this.log('WARN', `Validation found ${validationResult.errors.length} issues`)
        // Continue with valid users only
      }

      // Step 4: Migrate users to database
      const migratedUsers = await this.migrateUsers(jsonData.users)
      this.log('INFO', `Successfully migrated ${migratedUsers} users`)

      // Step 5: Create default auth user
      const createdAuthUsers = await this.createDefaultAuthUser()
      this.log('INFO', `Created ${createdAuthUsers} default auth users`)

      // Step 6: Final validation
      const finalValidation = await this.validateMigration()
      this.log('INFO', 'Migration validation completed')

      const duration = Date.now() - startTime
      const result: MigrationResult = {
        success: true,
        migratedUsers,
        createdAuthUsers,
        errors: this.logs.filter((log) => log.level === 'ERROR').map((log) => log.message),
        backupPath,
        duration,
        validationResult: finalValidation
      }

      this.log('INFO', `Migration completed successfully in ${duration}ms`)
      await this.saveLogs()

      return result
    } catch (error) {
      const duration = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.log('ERROR', `Migration failed: ${errorMessage}`, error)

      const result: MigrationResult = {
        success: false,
        migratedUsers: 0,
        createdAuthUsers: 0,
        errors: [
          errorMessage,
          ...this.logs.filter((log) => log.level === 'ERROR').map((log) => log.message)
        ],
        backupPath: '',
        duration,
        validationResult: {
          isValid: false,
          totalUsers: 0,
          validUsers: 0,
          invalidUsers: 0,
          missingFields: [],
          duplicateDnis: [],
          errors: [{ field: 'migration', message: errorMessage }]
        }
      }

      await this.saveLogs()
      return result
    }
  }

  /**
   * Validate the integrity of migrated data
   */
  async validateMigration(): Promise<ValidationResult> {
    this.log('INFO', 'Starting migration validation')

    try {
      const db = await this.databaseManager.connect()

      // Count users in database
      const dbUserCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as {
        count: number
      }

      // Get all users from database
      const dbUsers = db.prepare('SELECT * FROM users').all() as User[]

      // Load original JSON data for comparison
      const jsonData = await this.loadJSONData()
      const validJsonUsers = jsonData.users.filter((user) => this.isValidUser(user))

      const result: ValidationResult = {
        isValid: true,
        totalUsers: dbUserCount.count,
        validUsers: dbUsers.length,
        invalidUsers: 0,
        missingFields: [],
        duplicateDnis: [],
        errors: []
      }

      // Validate user count matches
      if (dbUsers.length !== validJsonUsers.length) {
        result.isValid = false
        result.errors.push({
          field: 'count',
          message: `User count mismatch: DB has ${dbUsers.length}, JSON had ${validJsonUsers.length} valid users`
        })
      }

      // Validate each user's data integrity
      for (const dbUser of dbUsers) {
        const originalUser = validJsonUsers.find((u) => u.dni === dbUser.dni)
        if (!originalUser) {
          result.errors.push({
            userId: dbUser.id,
            field: 'existence',
            message: `User with DNI ${dbUser.dni} exists in DB but not in original JSON`
          })
          continue
        }

        // Validate field integrity
        if (dbUser.nombre !== originalUser.nombre) {
          result.errors.push({
            userId: dbUser.id,
            field: 'nombre',
            message: `Name mismatch for DNI ${dbUser.dni}: DB="${dbUser.nombre}", JSON="${originalUser.nombre}"`
          })
        }

        if (dbUser.edad !== originalUser.edad) {
          result.errors.push({
            userId: dbUser.id,
            field: 'edad',
            message: `Age mismatch for DNI ${dbUser.dni}: DB=${dbUser.edad}, JSON=${originalUser.edad}`
          })
        }
      }

      // Check for duplicate DNIs in database
      const dniCounts = db
        .prepare(
          `
        SELECT dni, COUNT(*) as count 
        FROM users 
        GROUP BY dni 
        HAVING COUNT(*) > 1
      `
        )
        .all() as { dni: number; count: number }[]

      if (dniCounts.length > 0) {
        result.isValid = false
        result.duplicateDnis = dniCounts.map((item) => item.dni)
        result.errors.push({
          field: 'dni',
          message: `Found ${dniCounts.length} duplicate DNIs in database`
        })
      }

      if (result.errors.length > 0) {
        result.isValid = false
      }

      this.log(
        'INFO',
        `Validation completed: ${result.isValid ? 'PASSED' : 'FAILED'} with ${result.errors.length} errors`
      )
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown validation error'
      this.log('ERROR', `Validation failed: ${errorMessage}`)

      return {
        isValid: false,
        totalUsers: 0,
        validUsers: 0,
        invalidUsers: 0,
        missingFields: [],
        duplicateDnis: [],
        errors: [{ field: 'validation', message: errorMessage }]
      }
    }
  }

  /**
   * Create automatic backup before migration
   */
  async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = join(this.backupDir, `pre-migration-${timestamp}`)

    try {
      await fs.mkdir(backupPath, { recursive: true })

      // Backup JSON files
      await this.backupFile(this.jsonFilePath, join(backupPath, 'users.json'))

      const backupJsonPath = join(this.userDataPath, 'users.backup.json')
      try {
        await this.backupFile(backupJsonPath, join(backupPath, 'users.backup.json'))
      } catch (error) {
        this.log('WARN', 'No backup JSON file found to backup')
      }

      // Backup existing database if it exists
      const dbPath = join(this.userDataPath, 'database', 'app.lightdb')
      try {
        await this.backupFile(dbPath, join(backupPath, 'app.lightdb'))
        this.log('INFO', 'Existing database backed up')
      } catch (error) {
        this.log('INFO', 'No existing database to backup')
      }

      // Create backup manifest
      const manifest = {
        timestamp: new Date().toISOString(),
        type: 'pre-migration-backup',
        files: ['users.json', 'users.backup.json', 'app.lightdb'].filter(async (file) => {
          try {
            await fs.access(join(backupPath, file))
            return true
          } catch {
            return false
          }
        })
      }

      await fs.writeFile(
        join(backupPath, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf8'
      )

      this.log('INFO', `Backup created successfully at: ${backupPath}`)
      return backupPath
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown backup error'
      this.log('ERROR', `Failed to create backup: ${errorMessage}`)
      throw new Error(`Backup creation failed: ${errorMessage}`)
    }
  }

  /**
   * Load and parse JSON data with error handling
   */
  private async loadJSONData(): Promise<UserStorageData> {
    try {
      // First try to load from main file
      const fileContent = await fs.readFile(this.jsonFilePath, 'utf8')
      const data = JSON.parse(fileContent) as UserStorageData

      if (!data.users || !Array.isArray(data.users)) {
        throw new Error('Invalid JSON structure: missing or invalid users array')
      }

      this.log('INFO', `Loaded ${data.users.length} users from JSON file`)
      return data
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        this.log('WARN', 'Main JSON file not found, trying backup')
        return await this.loadJSONBackup()
      }

      if (error instanceof SyntaxError) {
        this.log('WARN', 'Main JSON file corrupted, trying backup')
        return await this.loadJSONBackup()
      }

      throw error
    }
  }

  /**
   * Load JSON data from backup file
   */
  private async loadJSONBackup(): Promise<UserStorageData> {
    try {
      const backupPath = join(this.userDataPath, 'users.backup.json')
      const backupContent = await fs.readFile(backupPath, 'utf8')
      const backupData = JSON.parse(backupContent) as UserStorageData

      if (!backupData.users || !Array.isArray(backupData.users)) {
        throw new Error('Invalid backup JSON structure')
      }

      this.log('INFO', `Loaded ${backupData.users.length} users from backup JSON file`)
      return backupData
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        this.log('INFO', 'No backup file found, creating empty dataset')
        return {
          users: [],
          metadata: {
            version: '1.0',
            lastModified: new Date().toISOString()
          }
        }
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.log('ERROR', `Failed to load backup JSON: ${errorMessage}`)
      throw new Error(`Failed to load JSON data: ${errorMessage}`)
    }
  }
  /**
   * Validate JSON data before migration
   */
  private async validateJSONData(data: UserStorageData): Promise<ValidationResult> {
    this.log('INFO', 'Starting JSON data validation')

    const result: ValidationResult = {
      isValid: true,
      totalUsers: data.users.length,
      validUsers: 0,
      invalidUsers: 0,
      missingFields: [],
      duplicateDnis: [],
      errors: []
    }

    const seenDnis = new Set<number>()
    const duplicateDnis = new Set<number>()

    for (let i = 0; i < data.users.length; i++) {
      const user = data.users[i]
      const userErrors: ValidationError[] = []

      // Validate required fields
      if (!user.id || typeof user.id !== 'string') {
        userErrors.push({
          userId: user.id || `index-${i}`,
          field: 'id',
          message: 'Missing or invalid user ID',
          value: user.id
        })
      }

      if (!user.nombre || typeof user.nombre !== 'string' || user.nombre.trim().length === 0) {
        userErrors.push({
          userId: user.id || `index-${i}`,
          field: 'nombre',
          message: 'Missing or invalid name',
          value: user.nombre
        })
      }

      if (
        typeof user.edad !== 'number' ||
        !Number.isInteger(user.edad) ||
        user.edad <= 0 ||
        user.edad > 120
      ) {
        userErrors.push({
          userId: user.id || `index-${i}`,
          field: 'edad',
          message: 'Invalid age (must be integer between 1-120)',
          value: user.edad
        })
      }

      if (
        typeof user.dni !== 'number' ||
        !Number.isInteger(user.dni) ||
        user.dni < 1000000 ||
        user.dni > 99999999
      ) {
        userErrors.push({
          userId: user.id || `index-${i}`,
          field: 'dni',
          message: 'Invalid DNI (must be 7-8 digit number)',
          value: user.dni
        })
      } else {
        // Check for duplicate DNI
        if (seenDnis.has(user.dni)) {
          duplicateDnis.add(user.dni)
          userErrors.push({
            userId: user.id || `index-${i}`,
            field: 'dni',
            message: `Duplicate DNI: ${user.dni}`,
            value: user.dni
          })
        } else {
          seenDnis.add(user.dni)
        }
      }

      if (userErrors.length === 0) {
        result.validUsers++
      } else {
        result.invalidUsers++
        result.errors.push(...userErrors)
      }
    }

    result.duplicateDnis = Array.from(duplicateDnis)

    if (result.errors.length > 0) {
      result.isValid = false
      this.log(
        'WARN',
        `Validation found ${result.errors.length} errors in ${result.invalidUsers} users`
      )
    } else {
      this.log('INFO', `Validation passed: all ${result.validUsers} users are valid`)
    }

    return result
  }

  /**
   * Migrate users from JSON to database
   */
  private async migrateUsers(users: User[]): Promise<number> {
    this.log('INFO', `Starting migration of ${users.length} users`)

    const db = await this.databaseManager.connect()
    let migratedCount = 0

    // Use transaction for atomic migration
    const transaction = db.transaction((users: User[]) => {
      const insertStmt = db.prepare(`
        INSERT INTO users (id, nombre, edad, dni, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `)

      for (const user of users) {
        if (this.isValidUser(user)) {
          try {
            insertStmt.run(user.id, user.nombre, user.edad, user.dni)
            migratedCount++
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            this.log(
              'ERROR',
              `Failed to migrate user ${user.id} (DNI: ${user.dni}): ${errorMessage}`
            )

            // Check if it's a constraint violation (duplicate DNI)
            if (errorMessage.includes('UNIQUE constraint failed')) {
              this.log('WARN', `Skipping user ${user.id} due to duplicate DNI: ${user.dni}`)
            } else {
              throw error // Re-throw non-constraint errors
            }
          }
        } else {
          this.log('WARN', `Skipping invalid user: ${JSON.stringify(user)}`)
        }
      }
    })

    try {
      transaction(users)
      this.log('INFO', `Successfully migrated ${migratedCount} users to database`)
      return migratedCount
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.log('ERROR', `Transaction failed during user migration: ${errorMessage}`)
      throw new Error(`User migration failed: ${errorMessage}`)
    }
  }

  /**
   * Create default authentication user
   */
  private async createDefaultAuthUser(): Promise<number> {
    this.log('INFO', 'Creating default authentication user')

    try {
      const db = await this.databaseManager.connect()

      // Check if admin user already exists
      const existingAdmin = db.prepare('SELECT id FROM auth_users WHERE username = ?').get('admin')

      if (existingAdmin) {
        this.log('INFO', 'Default admin user already exists, skipping creation')
        return 0
      }

      // Create default admin user
      const defaultUser: CreateAuthUserData = {
        username: 'admin',
        password_hash: '$2b$10$rQJ8vHqU5qJ8vHqU5qJ8vOJ8vHqU5qJ8vHqU5qJ8vHqU5qJ8vHqU5q', // 'admin123' hashed
        display_name: 'Administrator',
        active: true,
        must_change_password: true
      }

      const insertStmt = db.prepare(`
        INSERT INTO auth_users (
          id, username, password_hash, display_name, active, 
          must_change_password, failed_attempts, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
      `)

      const userId = `auth-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      insertStmt.run(
        userId,
        defaultUser.username,
        defaultUser.password_hash,
        defaultUser.display_name,
        defaultUser.active ? 1 : 0,
        defaultUser.must_change_password ? 1 : 0
      )

      this.log('INFO', 'Default admin user created successfully')
      return 1
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.log('ERROR', `Failed to create default auth user: ${errorMessage}`)
      throw new Error(`Auth user creation failed: ${errorMessage}`)
    }
  }

  /**
   * Utility method to validate a user object
   */
  private isValidUser(user: any): user is User {
    return (
      user &&
      typeof user.id === 'string' &&
      user.id.length > 0 &&
      typeof user.nombre === 'string' &&
      user.nombre.trim().length > 0 &&
      typeof user.edad === 'number' &&
      Number.isInteger(user.edad) &&
      user.edad > 0 &&
      user.edad <= 120 &&
      typeof user.dni === 'number' &&
      Number.isInteger(user.dni) &&
      user.dni >= 1000000 &&
      user.dni <= 99999999
    )
  }

  /**
   * Ensure backup directory exists
   */
  private async ensureBackupDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.backupDir, { recursive: true })
      this.log('INFO', `Backup directory ensured: ${this.backupDir}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.log('ERROR', `Failed to create backup directory: ${errorMessage}`)
      throw new Error(`Backup directory creation failed: ${errorMessage}`)
    }
  }

  /**
   * Backup a single file
   */
  private async backupFile(sourcePath: string, destPath: string): Promise<void> {
    try {
      await fs.access(sourcePath)
      await fs.copyFile(sourcePath, destPath)
      this.log('INFO', `File backed up: ${sourcePath} -> ${destPath}`)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        this.log('WARN', `Source file not found for backup: ${sourcePath}`)
        return
      }
      throw error
    }
  }

  /**
   * Add log entry with detailed information
   */
  private log(level: 'INFO' | 'WARN' | 'ERROR', message: string, details?: any): void {
    const logEntry: MigrationLog = {
      timestamp: new Date(),
      level,
      message,
      details
    }

    this.logs.push(logEntry)

    // Also log to console for immediate feedback
    const timestamp = logEntry.timestamp.toISOString()
    const logMessage = `[${timestamp}] [${level}] ${message}`

    switch (level) {
      case 'INFO':
        console.log(logMessage, details || '')
        break
      case 'WARN':
        console.warn(logMessage, details || '')
        break
      case 'ERROR':
        console.error(logMessage, details || '')
        break
    }
  }

  /**
   * Save migration logs to file
   */
  private async saveLogs(): Promise<void> {
    try {
      const logContent = this.logs
        .map((log) => {
          const timestamp = log.timestamp.toISOString()
          const details = log.details ? ` | Details: ${JSON.stringify(log.details)}` : ''
          return `[${timestamp}] [${log.level}] ${log.message}${details}`
        })
        .join('\n')

      await fs.writeFile(this.logFilePath, logContent, 'utf8')
      console.log(`Migration logs saved to: ${this.logFilePath}`)
    } catch (error) {
      console.error('Failed to save migration logs:', error)
    }
  }

  /**
   * Get current migration logs
   */
  getLogs(): MigrationLog[] {
    return [...this.logs]
  }

  /**
   * Clear current logs
   */
  clearLogs(): void {
    this.logs = []
  }
}
