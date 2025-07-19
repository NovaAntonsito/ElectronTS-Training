import { Migration } from '../config/database'

export interface MigrationResult {
  success: boolean
  appliedMigrations: number
  errors: string[]
  currentVersion: number
}

import Database from 'better-sqlite3'

export class MigrationRunner {
  constructor(private db: Database.Database) {}

  async runPendingMigrations(migrations: Migration[]): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: true,
      appliedMigrations: 0,
      errors: [],
      currentVersion: 0
    }

    try {
      // Ensure migrations table exists
      await this.ensureMigrationsTable()

      // Get current version
      const currentVersion = await this.getCurrentVersion()
      result.currentVersion = currentVersion

      // Filter pending migrations
      const pendingMigrations = migrations
        .filter((migration) => migration.version > currentVersion)
        .sort((a, b) => a.version - b.version)

      console.log(`Found ${pendingMigrations.length} pending migrations`)

      // Apply each pending migration
      for (const migration of pendingMigrations) {
        try {
          await this.applyMigration(migration)
          result.appliedMigrations++
          result.currentVersion = migration.version
          console.log(`✓ Applied migration ${migration.version}: ${migration.name}`)
        } catch (error) {
          const errorMsg = `Failed to apply migration ${migration.version}: ${error instanceof Error ? error.message : String(error)}`
          result.errors.push(errorMsg)
          result.success = false
          console.error(`✗ ${errorMsg}`)
          break // Stop on first error
        }
      }

      if (result.success && result.appliedMigrations > 0) {
        console.log(
          `✓ Successfully applied ${result.appliedMigrations} migrations. Current version: ${result.currentVersion}`
        )
      } else if (result.appliedMigrations === 0) {
        console.log('✓ No pending migrations to apply')
      }
    } catch (error) {
      result.success = false
      result.errors.push(
        `Migration runner failed: ${error instanceof Error ? error.message : String(error)}`
      )
      console.error('✗ Migration runner failed:', error)
    }

    return result
  }

  async getCurrentVersion(): Promise<number> {
    try {
      const result = this.db
        .prepare('SELECT MAX(version) as version FROM schema_migrations')
        .get() as { version: number } | undefined
      return result?.version || 0
    } catch (error) {
      // If table doesn't exist, return 0
      return 0
    }
  }

  async applyMigration(migration: Migration): Promise<void> {
    console.log(`Applying migration ${migration.version}: ${migration.name}`)

    // Run migration in transaction for atomicity
    this.db.exec('BEGIN TRANSACTION')

    try {
      // Execute the migration
      await migration.up(this.db)

      // Record the migration
      this.recordMigration(migration.version, migration.name)

      // Commit transaction
      this.db.exec('COMMIT')
    } catch (error) {
      // Rollback on error
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  async rollbackMigration(migration: Migration): Promise<void> {
    console.log(`Rolling back migration ${migration.version}: ${migration.name}`)

    // Run rollback in transaction
    this.db.exec('BEGIN TRANSACTION')

    try {
      // Execute the rollback
      await migration.down(this.db)

      // Remove migration record
      this.removeMigrationRecord(migration.version)

      // Commit transaction
      this.db.exec('COMMIT')

      console.log(`✓ Rolled back migration ${migration.version}`)
    } catch (error) {
      // Rollback on error
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  async getAppliedMigrations(): Promise<
    Array<{ version: number; name: string; applied_at: string }>
  > {
    try {
      const result = this.db
        .prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version')
        .all()
      return result as Array<{ version: number; name: string; applied_at: string }>
    } catch (error) {
      // If table doesn't exist, return empty array
      return []
    }
  }

  async validateMigrations(migrations: Migration[]): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = []

    // Check for duplicate versions
    const versions = migrations.map((m) => m.version)
    const duplicates = versions.filter((v, i) => versions.indexOf(v) !== i)
    if (duplicates.length > 0) {
      errors.push(`Duplicate migration versions found: ${duplicates.join(', ')}`)
    }

    // Check for missing migrations (gaps in version sequence)
    const sortedVersions = [...new Set(versions)].sort((a, b) => a - b)
    for (let i = 1; i < sortedVersions.length; i++) {
      if (sortedVersions[i] !== sortedVersions[i - 1] + 1) {
        errors.push(
          `Gap in migration versions between ${sortedVersions[i - 1]} and ${sortedVersions[i]}`
        )
      }
    }

    // Validate each migration has required properties
    for (const migration of migrations) {
      if (!migration.version || migration.version <= 0) {
        errors.push(`Invalid version for migration: ${migration.name}`)
      }
      if (!migration.name || migration.name.trim() === '') {
        errors.push(`Missing name for migration version ${migration.version}`)
      }
      if (typeof migration.up !== 'function') {
        errors.push(`Missing or invalid 'up' function for migration ${migration.version}`)
      }
      if (typeof migration.down !== 'function') {
        errors.push(`Missing or invalid 'down' function for migration ${migration.version}`)
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  private async ensureMigrationsTable(): Promise<void> {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `
    this.db.exec(createTableSQL)
  }

  private recordMigration(version: number, name: string): void {
    this.db
      .prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
      .run(version, name)
  }

  private removeMigrationRecord(version: number): void {
    this.db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(version)
  }
}
