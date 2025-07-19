import { promises as fs } from 'fs'
import { join } from 'path'
import { app } from 'electron'

/**
 * Legacy cleanup service for removing old JSON-based storage files
 * and temporary migration files after successful LightDB migration
 */
export class LegacyCleanup {
  private userDataPath: string

  constructor() {
    this.userDataPath = app.getPath('userData')
  }

  /**
   * Execute complete legacy cleanup
   */
  async executeCleanup(): Promise<CleanupResult> {
    const startTime = Date.now()
    const log: string[] = []
    const removedFiles: string[] = []
    const errors: string[] = []

    try {
      log.push(`[${new Date().toISOString()}] Starting legacy cleanup`)

      // Remove legacy JSON files from user data directory
      await this.removeLegacyJSONFiles(removedFiles, errors, log)

      // Remove temporary migration files
      await this.removeTemporaryFiles(removedFiles, errors, log)

      // Remove test files
      await this.removeTestFiles(removedFiles, errors, log)

      const duration = Date.now() - startTime
      log.push(`[${new Date().toISOString()}] Legacy cleanup completed in ${duration}ms`)
      log.push(
        `[${new Date().toISOString()}] Removed ${removedFiles.length} files, ${errors.length} errors`
      )

      return {
        success: errors.length === 0,
        removedFiles,
        errors,
        duration,
        log
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      log.push(`[${new Date().toISOString()}] ERROR: ${errorMsg}`)
      errors.push(errorMsg)

      return {
        success: false,
        removedFiles,
        errors,
        duration: Date.now() - startTime,
        log
      }
    }
  }

  /**
   * Remove legacy JSON files from user data directory
   */
  private async removeLegacyJSONFiles(
    removedFiles: string[],
    errors: string[],
    log: string[]
  ): Promise<void> {
    const jsonFiles = [
      join(this.userDataPath, 'users.json'),
      join(this.userDataPath, 'users.backup.json')
    ]

    for (const filePath of jsonFiles) {
      try {
        await fs.access(filePath)
        await fs.unlink(filePath)
        removedFiles.push(filePath)
        log.push(`[${new Date().toISOString()}] Removed legacy JSON file: ${filePath}`)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          const errorMsg = `Failed to remove ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`
          errors.push(errorMsg)
          log.push(`[${new Date().toISOString()}] ERROR: ${errorMsg}`)
        } else {
          log.push(
            `[${new Date().toISOString()}] Legacy file not found (already removed): ${filePath}`
          )
        }
      }
    }
  }

  /**
   * Remove temporary migration files
   */
  private async removeTemporaryFiles(
    removedFiles: string[],
    errors: string[],
    log: string[]
  ): Promise<void> {
    const tempDirs = [
      'temp',
      join(this.userDataPath, 'migration-backups'),
      join(this.userDataPath, 'test-backups')
    ]

    for (const dirPath of tempDirs) {
      try {
        await this.removeDirectoryRecursive(dirPath, removedFiles, log)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          const errorMsg = `Failed to remove temp directory ${dirPath}: ${error instanceof Error ? error.message : 'Unknown error'}`
          errors.push(errorMsg)
          log.push(`[${new Date().toISOString()}] ERROR: ${errorMsg}`)
        } else {
          log.push(`[${new Date().toISOString()}] Temp directory not found: ${dirPath}`)
        }
      }
    }
  }

  /**
   * Remove test files from main directory
   */
  private async removeTestFiles(
    removedFiles: string[],
    errors: string[],
    log: string[]
  ): Promise<void> {
    const testFiles = [
      'src/main/test-migration.ts',
      'src/main/test-data-migrator.ts',
      'src/main/test-database.ts',
      'src/main/test-auth-repository.ts',
      'src/main/test-schema.ts',
      'src/main/test-updated-services.ts',
      'src/main/test-performance-migration.ts',
      'src/main/test-performance-optimization.ts',
      'src/main/test-error-recovery.ts',
      'src/main/test-error-recovery-simple.ts'
    ]

    for (const filePath of testFiles) {
      try {
        await fs.access(filePath)
        await fs.unlink(filePath)
        removedFiles.push(filePath)
        log.push(`[${new Date().toISOString()}] Removed test file: ${filePath}`)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          const errorMsg = `Failed to remove test file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`
          errors.push(errorMsg)
          log.push(`[${new Date().toISOString()}] ERROR: ${errorMsg}`)
        } else {
          log.push(`[${new Date().toISOString()}] Test file not found: ${filePath}`)
        }
      }
    }
  }

  /**
   * Remove directory and all its contents recursively
   */
  private async removeDirectoryRecursive(
    dirPath: string,
    removedFiles: string[],
    log: string[]
  ): Promise<void> {
    try {
      const stats = await fs.stat(dirPath)

      if (stats.isDirectory()) {
        const files = await fs.readdir(dirPath)

        // Remove all files and subdirectories
        for (const file of files) {
          const filePath = join(dirPath, file)
          await this.removeDirectoryRecursive(filePath, removedFiles, log)
        }

        // Remove the empty directory
        await fs.rmdir(dirPath)
        removedFiles.push(dirPath)
        log.push(`[${new Date().toISOString()}] Removed directory: ${dirPath}`)
      } else {
        // Remove file
        await fs.unlink(dirPath)
        removedFiles.push(dirPath)
        log.push(`[${new Date().toISOString()}] Removed file: ${dirPath}`)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }

  /**
   * Remove legacy UserStorageService file (to be done manually after verification)
   */
  async removeLegacyStorageService(): Promise<void> {
    const legacyFiles = ['src/main/services/user-storage.ts']

    for (const filePath of legacyFiles) {
      try {
        await fs.access(filePath)
        console.log(`Legacy file found: ${filePath}`)
        console.log(
          'This file should be removed manually after verifying all functionality works with LightDB'
        )
      } catch (error) {
        console.log(`Legacy file not found: ${filePath}`)
      }
    }
  }
}

export interface CleanupResult {
  success: boolean
  removedFiles: string[]
  errors: string[]
  duration: number
  log: string[]
}
