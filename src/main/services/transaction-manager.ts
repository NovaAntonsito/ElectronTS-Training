import Database from 'better-sqlite3'
import { ErrorRecoveryManager, RecoveryResult } from './error-recovery-manager'

export interface TransactionOptions {
  timeout: number
  retryAttempts: number
  enableAutoRollback: boolean
  enableRecovery: boolean
}

export interface TransactionResult<T = any> {
  success: boolean
  result?: T
  error?: Error
  recoveryAttempted: boolean
  recoveryResult?: RecoveryResult
}

export class TransactionManager {
  private db: Database.Database
  private recoveryManager?: ErrorRecoveryManager
  private activeTransactions = new Set<string>()

  constructor(db: Database.Database, recoveryManager?: ErrorRecoveryManager) {
    this.db = db
    this.recoveryManager = recoveryManager
  }

  /**
   * Executes a function within a database transaction with automatic rollback
   */
  async executeTransaction<T>(
    transactionFn: (db: Database.Database) => T | Promise<T>,
    options: Partial<TransactionOptions> = {}
  ): Promise<TransactionResult<T>> {
    const opts: TransactionOptions = {
      timeout: 30000,
      retryAttempts: 3,
      enableAutoRollback: true,
      enableRecovery: true,
      ...options
    }

    const transactionId = this.generateTransactionId()
    this.activeTransactions.add(transactionId)

    let attempt = 0
    let lastError: Error | undefined

    while (attempt < opts.retryAttempts) {
      attempt++

      try {
        const result = await this.attemptTransaction(transactionFn, opts, transactionId)
        this.activeTransactions.delete(transactionId)
        return {
          success: true,
          result,
          recoveryAttempted: false
        }
      } catch (error) {
        lastError = error as Error
        console.warn(`Transaction attempt ${attempt}/${opts.retryAttempts} failed:`, error)

        // Attempt recovery if enabled and we have a recovery manager
        if (opts.enableRecovery && this.recoveryManager && attempt === opts.retryAttempts) {
          try {
            const recoveryResult = await this.recoveryManager.handleTransactionFailure(
              this.db,
              lastError,
              () => {
                // This is a simplified recovery function
                // In practice, you'd need to re-execute the transaction
              }
            )

            this.activeTransactions.delete(transactionId)
            return {
              success: recoveryResult.success,
              error: lastError,
              recoveryAttempted: true,
              recoveryResult
            }
          } catch (recoveryError) {
            console.error('Recovery attempt failed:', recoveryError)
          }
        }

        // If not the last attempt, wait before retrying
        if (attempt < opts.retryAttempts) {
          await this.delay(1000 * attempt)
        }
      }
    }

    this.activeTransactions.delete(transactionId)
    return {
      success: false,
      error: lastError,
      recoveryAttempted: false
    }
  }

  /**
   * Executes multiple operations in a single transaction
   */
  async executeBatch<T>(
    operations: Array<(db: Database.Database) => T | Promise<T>>,
    options: Partial<TransactionOptions> = {}
  ): Promise<TransactionResult<T[]>> {
    return this.executeTransaction(async (db) => {
      const results: T[] = []

      for (const operation of operations) {
        const result = await operation(db)
        results.push(result)
      }

      return results
    }, options)
  }

  /**
   * Creates a savepoint within an existing transaction
   */
  async createSavepoint(name: string): Promise<void> {
    try {
      this.db.exec(`SAVEPOINT ${name}`)
    } catch (error) {
      throw new Error(`Failed to create savepoint ${name}: ${error}`)
    }
  }

  /**
   * Rolls back to a specific savepoint
   */
  async rollbackToSavepoint(name: string): Promise<void> {
    try {
      this.db.exec(`ROLLBACK TO SAVEPOINT ${name}`)
    } catch (error) {
      throw new Error(`Failed to rollback to savepoint ${name}: ${error}`)
    }
  }

  /**
   * Releases a savepoint
   */
  async releaseSavepoint(name: string): Promise<void> {
    try {
      this.db.exec(`RELEASE SAVEPOINT ${name}`)
    } catch (error) {
      throw new Error(`Failed to release savepoint ${name}: ${error}`)
    }
  }

  /**
   * Executes a transaction with nested savepoints for complex operations
   */
  async executeNestedTransaction<T>(
    operations: Array<{
      name: string
      operation: (db: Database.Database) => T | Promise<T>
      onError?: 'rollback' | 'continue'
    }>,
    options: Partial<TransactionOptions> = {}
  ): Promise<TransactionResult<T[]>> {
    return this.executeTransaction(async (db) => {
      const results: T[] = []

      for (const { name, operation, onError = 'rollback' } of operations) {
        await this.createSavepoint(name)

        try {
          const result = await operation(db)
          results.push(result)
          await this.releaseSavepoint(name)
        } catch (error) {
          console.error(`Operation ${name} failed:`, error)

          if (onError === 'rollback') {
            await this.rollbackToSavepoint(name)
            throw error
          } else {
            // Continue with next operation
            await this.rollbackToSavepoint(name)
            await this.releaseSavepoint(name)
          }
        }
      }

      return results
    }, options)
  }

  /**
   * Checks if there are any active transactions
   */
  hasActiveTransactions(): boolean {
    return this.activeTransactions.size > 0
  }

  /**
   * Gets the count of active transactions
   */
  getActiveTransactionCount(): number {
    return this.activeTransactions.size
  }

  /**
   * Forces rollback of all active transactions (emergency use)
   */
  async forceRollbackAll(): Promise<void> {
    try {
      this.db.exec('ROLLBACK')
      this.activeTransactions.clear()
      console.warn('Forced rollback of all active transactions')
    } catch (error) {
      console.error('Failed to force rollback:', error)
    }
  }

  private async attemptTransaction<T>(
    transactionFn: (db: Database.Database) => T | Promise<T>,
    options: TransactionOptions,
    transactionId: string
  ): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | undefined

    try {
      // Set up timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`Transaction ${transactionId} timed out after ${options.timeout}ms`))
        }, options.timeout)
      })

      // Execute transaction with timeout
      const transactionPromise = this.executeWithRollback(transactionFn, transactionId)

      const result = await Promise.race([transactionPromise, timeoutPromise])

      if (timeoutHandle) {
        clearTimeout(timeoutHandle)
      }

      return result
    } catch (error) {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle)
      }

      // Ensure rollback on any error
      if (options.enableAutoRollback) {
        await this.safeRollback(transactionId)
      }

      throw error
    }
  }

  private async executeWithRollback<T>(
    transactionFn: (db: Database.Database) => T | Promise<T>,
    transactionId: string
  ): Promise<T> {
    // Begin transaction
    this.db.exec('BEGIN TRANSACTION')

    try {
      // Execute the transaction function
      const result = await transactionFn(this.db)

      // Commit if successful
      this.db.exec('COMMIT')

      return result
    } catch (error) {
      // Rollback on error
      await this.safeRollback(transactionId)
      throw error
    }
  }

  private async safeRollback(transactionId: string): Promise<void> {
    try {
      // Check if there's an active transaction before attempting rollback
      const inTransaction = this.db.inTransaction
      if (inTransaction) {
        this.db.exec('ROLLBACK')
      }
    } catch (rollbackError) {
      console.error(`Failed to rollback transaction ${transactionId}:`, rollbackError)

      // If rollback fails, the database might be in an inconsistent state
      // This is a critical error that might require recovery
      if (this.recoveryManager) {
        try {
          await this.recoveryManager.detectAndRepairCorruption(this.db)
        } catch (recoveryError) {
          console.error('Recovery after failed rollback also failed:', recoveryError)
        }
      }
    }
  }

  private generateTransactionId(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

/**
 * Utility function to create a transaction manager with recovery
 */
export function createTransactionManager(
  db: Database.Database,
  recoveryManager?: ErrorRecoveryManager
): TransactionManager {
  return new TransactionManager(db, recoveryManager)
}

/**
 * Decorator for automatic transaction handling
 */
export function withTransaction<T extends any[], R>(
  transactionManager: TransactionManager,
  options?: Partial<TransactionOptions>
) {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: TypedPropertyDescriptor<(...args: T) => Promise<R>>
  ) {
    const originalMethod = descriptor.value!

    descriptor.value = async function (...args: T): Promise<R> {
      const result = await transactionManager.executeTransaction(
        async () => originalMethod.apply(this, args),
        options
      )

      if (!result.success) {
        throw result.error || new Error('Transaction failed')
      }

      return result.result!
    }

    return descriptor
  }
}
