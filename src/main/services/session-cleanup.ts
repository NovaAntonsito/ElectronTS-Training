import { AuthRepository } from '../repositories/auth-repository'
import { DatabaseError } from '../types'

export interface SessionCleanupConfig {
  intervalMinutes: number // How often to run cleanup
  maxSessionAge: number // Maximum session age in hours
  batchSize: number // Number of sessions to process at once
}

export interface CleanupStats {
  lastRun: Date
  totalRuns: number
  totalSessionsDeleted: number
  lastRunDeletedSessions: number
  averageSessionsPerRun: number
}

export class SessionCleanupService {
  private authRepository: AuthRepository
  private config: SessionCleanupConfig
  private cleanupInterval: NodeJS.Timeout | null = null
  private stats: CleanupStats
  private isRunning = false

  constructor(authRepository: AuthRepository, config?: Partial<SessionCleanupConfig>) {
    this.authRepository = authRepository
    this.config = {
      intervalMinutes: 30, // Run every 30 minutes by default
      maxSessionAge: 24, // Sessions expire after 24 hours by default
      batchSize: 100, // Process 100 sessions at a time
      ...config
    }

    this.stats = {
      lastRun: new Date(),
      totalRuns: 0,
      totalSessionsDeleted: 0,
      lastRunDeletedSessions: 0,
      averageSessionsPerRun: 0
    }
  }

  /**
   * Start automatic session cleanup
   */
  start(): void {
    if (this.cleanupInterval) {
      console.warn('Session cleanup is already running')
      return
    }

    console.log(
      `Starting session cleanup service (interval: ${this.config.intervalMinutes} minutes)`
    )

    // Run initial cleanup
    this.runCleanup().catch((error) => {
      console.error('Initial session cleanup failed:', error)
    })

    // Schedule periodic cleanup
    this.cleanupInterval = setInterval(
      () => {
        this.runCleanup().catch((error) => {
          console.error('Scheduled session cleanup failed:', error)
        })
      },
      this.config.intervalMinutes * 60 * 1000
    )
  }

  /**
   * Stop automatic session cleanup
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
      console.log('Session cleanup service stopped')
    }
  }

  /**
   * Run cleanup manually
   */
  async runCleanup(): Promise<void> {
    if (this.isRunning) {
      console.log('Session cleanup is already running, skipping...')
      return
    }

    this.isRunning = true

    try {
      console.log('Starting session cleanup...')
      const startTime = Date.now()

      const result = await this.authRepository.deleteExpiredSessions()

      // Update statistics
      this.stats.lastRun = new Date()
      this.stats.totalRuns += 1
      this.stats.totalSessionsDeleted += result.deletedSessions
      this.stats.lastRunDeletedSessions = result.deletedSessions
      this.stats.averageSessionsPerRun = this.stats.totalSessionsDeleted / this.stats.totalRuns

      const duration = Date.now() - startTime

      console.log(
        `Session cleanup completed: ${result.deletedSessions} expired sessions deleted ` +
          `out of ${result.totalSessions} total sessions (${duration}ms)`
      )

      // Log warning if too many sessions are being deleted
      if (result.deletedSessions > this.config.batchSize) {
        console.warn(
          `High number of expired sessions detected (${result.deletedSessions}). ` +
            'Consider reducing session expiration time or increasing cleanup frequency.'
        )
      }
    } catch (error) {
      console.error('Session cleanup failed:', error)
      throw new DatabaseError(
        'Session cleanup failed',
        'CLEANUP_ERROR',
        error instanceof Error ? error : undefined
      )
    } finally {
      this.isRunning = false
    }
  }

  /**
   * Get cleanup statistics
   */
  getStats(): CleanupStats {
    return { ...this.stats }
  }

  /**
   * Update cleanup configuration
   */
  updateConfig(newConfig: Partial<SessionCleanupConfig>): void {
    const oldInterval = this.config.intervalMinutes
    this.config = { ...this.config, ...newConfig }

    // Restart if interval changed and service is running
    if (
      newConfig.intervalMinutes &&
      newConfig.intervalMinutes !== oldInterval &&
      this.cleanupInterval
    ) {
      console.log(
        `Updating cleanup interval from ${oldInterval} to ${this.config.intervalMinutes} minutes`
      )
      this.stop()
      this.start()
    }
  }

  /**
   * Force cleanup of all sessions for a specific user
   */
  async cleanupUserSessions(userId: string): Promise<void> {
    try {
      await this.authRepository.deleteUserSessions(userId)
      console.log(`All sessions for user ${userId} have been cleaned up`)
    } catch (error) {
      throw new DatabaseError(
        `Failed to cleanup sessions for user ${userId}`,
        'USER_CLEANUP_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Get current cleanup configuration
   */
  getConfig(): SessionCleanupConfig {
    return { ...this.config }
  }

  /**
   * Check if cleanup service is running
   */
  isActive(): boolean {
    return this.cleanupInterval !== null
  }

  /**
   * Get next scheduled cleanup time
   */
  getNextCleanupTime(): Date | null {
    if (!this.cleanupInterval) {
      return null
    }

    const nextRun = new Date(this.stats.lastRun.getTime() + this.config.intervalMinutes * 60 * 1000)
    return nextRun
  }
}
