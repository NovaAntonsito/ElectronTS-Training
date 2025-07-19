import Database from 'better-sqlite3'
import { ErrorRecoveryManager, RecoveryResult } from './error-recovery-manager'
import { EventEmitter } from 'events'

export interface HealthMetrics {
  timestamp: Date
  connectionStatus: 'healthy' | 'degraded' | 'failed'
  responseTime: number
  errorCount: number
  warningCount: number
  lastError?: Error
  databaseSize: number
  activeConnections: number
  corruptionDetected: boolean
}

export interface HealthCheckResult {
  healthy: boolean
  metrics: HealthMetrics
  issues: HealthIssue[]
  recommendations: string[]
}

export interface HealthIssue {
  severity: 'low' | 'medium' | 'high' | 'critical'
  type: 'performance' | 'corruption' | 'connection' | 'consistency'
  message: string
  details?: any
}

export interface MonitorOptions {
  checkInterval: number
  enableContinuousMonitoring: boolean
  performanceThresholds: {
    responseTimeWarning: number
    responseTimeCritical: number
    errorRateWarning: number
    errorRateCritical: number
  }
  autoRecovery: boolean
}

export class DatabaseHealthMonitor extends EventEmitter {
  private db: Database.Database
  private recoveryManager?: ErrorRecoveryManager
  private options: MonitorOptions
  private monitoringInterval?: NodeJS.Timeout
  private metrics: HealthMetrics[] = []
  private maxMetricsHistory = 100
  private errorCount = 0
  private warningCount = 0
  private isMonitoring = false

  constructor(
    db: Database.Database,
    recoveryManager?: ErrorRecoveryManager,
    options: Partial<MonitorOptions> = {}
  ) {
    super()
    this.db = db
    this.recoveryManager = recoveryManager
    this.options = {
      checkInterval: 30000, // 30 seconds
      enableContinuousMonitoring: true,
      performanceThresholds: {
        responseTimeWarning: 1000, // 1 second
        responseTimeCritical: 5000, // 5 seconds
        errorRateWarning: 0.05, // 5%
        errorRateCritical: 0.1 // 10%
      },
      autoRecovery: true,
      ...options
    }
  }

  /**
   * Starts continuous health monitoring
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      return
    }

    this.isMonitoring = true

    if (this.options.enableContinuousMonitoring) {
      this.monitoringInterval = setInterval(
        () => this.performHealthCheck(),
        this.options.checkInterval
      )
    }

    this.emit('monitoring-started')
    console.log('Database health monitoring started')
  }

  /**
   * Stops continuous health monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return
    }

    this.isMonitoring = false

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = undefined
    }

    this.emit('monitoring-stopped')
    console.log('Database health monitoring stopped')
  }

  /**
   * Performs a comprehensive health check
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now()
    const issues: HealthIssue[] = []
    const recommendations: string[] = []

    try {
      // Basic connectivity check
      const connectivityResult = await this.checkConnectivity()
      if (!connectivityResult.success) {
        issues.push({
          severity: 'critical',
          type: 'connection',
          message: 'Database connectivity failed',
          details: connectivityResult.error
        })
      }

      // Performance check
      const performanceResult = await this.checkPerformance()
      if (
        performanceResult.responseTime > this.options.performanceThresholds.responseTimeCritical
      ) {
        issues.push({
          severity: 'critical',
          type: 'performance',
          message: `Response time critical: ${performanceResult.responseTime}ms`,
          details: performanceResult
        })
        recommendations.push('Consider optimizing queries or increasing system resources')
      } else if (
        performanceResult.responseTime > this.options.performanceThresholds.responseTimeWarning
      ) {
        issues.push({
          severity: 'medium',
          type: 'performance',
          message: `Response time elevated: ${performanceResult.responseTime}ms`,
          details: performanceResult
        })
      }

      // Corruption check
      let corruptionDetected = false
      if (this.recoveryManager) {
        const corruptionResult = await this.recoveryManager.detectAndRepairCorruption(this.db)
        corruptionDetected = corruptionResult.isCorrupted

        if (corruptionResult.isCorrupted) {
          issues.push({
            severity: 'critical',
            type: 'corruption',
            message: 'Database corruption detected',
            details: corruptionResult
          })

          if (corruptionResult.repairSuccessful) {
            recommendations.push(
              'Corruption was automatically repaired, but consider investigating the root cause'
            )
          } else {
            recommendations.push('Manual intervention required to repair database corruption')
          }
        }
      }

      // Consistency check
      const consistencyResult = await this.checkDataConsistency()
      if (consistencyResult.inconsistenciesFound > 0) {
        const severity = consistencyResult.inconsistenciesFound > 10 ? 'high' : 'medium'
        issues.push({
          severity,
          type: 'consistency',
          message: `Data inconsistencies found: ${consistencyResult.inconsistenciesFound}`,
          details: consistencyResult
        })

        if (consistencyResult.corrected > 0) {
          recommendations.push(
            `${consistencyResult.corrected} inconsistencies were automatically corrected`
          )
        }
      }

      // Calculate error rate
      const recentMetrics = this.metrics.slice(-10)
      const errorRate =
        recentMetrics.length > 0
          ? recentMetrics.filter((m) => m.errorCount > 0).length / recentMetrics.length
          : 0

      if (errorRate > this.options.performanceThresholds.errorRateCritical) {
        issues.push({
          severity: 'critical',
          type: 'performance',
          message: `High error rate: ${(errorRate * 100).toFixed(1)}%`,
          details: { errorRate, recentMetrics: recentMetrics.length }
        })
      } else if (errorRate > this.options.performanceThresholds.errorRateWarning) {
        issues.push({
          severity: 'medium',
          type: 'performance',
          message: `Elevated error rate: ${(errorRate * 100).toFixed(1)}%`,
          details: { errorRate, recentMetrics: recentMetrics.length }
        })
      }

      // Create metrics
      const responseTime = Date.now() - startTime
      const metrics: HealthMetrics = {
        timestamp: new Date(),
        connectionStatus: connectivityResult.success ? 'healthy' : 'failed',
        responseTime,
        errorCount: this.errorCount,
        warningCount: this.warningCount,
        databaseSize: await this.getDatabaseSize(),
        activeConnections: 1, // Better-sqlite3 is single-connection
        corruptionDetected
      }

      // Store metrics
      this.addMetrics(metrics)

      // Determine overall health
      const criticalIssues = issues.filter((i) => i.severity === 'critical')
      const healthy = criticalIssues.length === 0

      const result: HealthCheckResult = {
        healthy,
        metrics,
        issues,
        recommendations
      }

      // Emit events
      if (!healthy) {
        this.emit('health-degraded', result)

        // Attempt auto-recovery if enabled
        if (this.options.autoRecovery && this.recoveryManager) {
          await this.attemptAutoRecovery(issues)
        }
      } else {
        this.emit('health-ok', result)
      }

      return result
    } catch (error) {
      this.errorCount++
      const errorResult: HealthCheckResult = {
        healthy: false,
        metrics: {
          timestamp: new Date(),
          connectionStatus: 'failed',
          responseTime: Date.now() - startTime,
          errorCount: this.errorCount,
          warningCount: this.warningCount,
          lastError: error as Error,
          databaseSize: 0,
          activeConnections: 0,
          corruptionDetected: false
        },
        issues: [
          {
            severity: 'critical',
            type: 'connection',
            message: 'Health check failed',
            details: error
          }
        ],
        recommendations: ['Check database connectivity and system resources']
      }

      this.emit('health-check-failed', errorResult)
      return errorResult
    }
  }

  /**
   * Gets recent health metrics
   */
  getRecentMetrics(count: number = 10): HealthMetrics[] {
    return this.metrics.slice(-count)
  }

  /**
   * Gets health trends over time
   */
  getHealthTrends(): {
    averageResponseTime: number
    errorRate: number
    healthyPercentage: number
    trends: {
      responseTime: 'improving' | 'stable' | 'degrading'
      errors: 'improving' | 'stable' | 'degrading'
    }
  } {
    const recentMetrics = this.getRecentMetrics(20)

    if (recentMetrics.length === 0) {
      return {
        averageResponseTime: 0,
        errorRate: 0,
        healthyPercentage: 0,
        trends: { responseTime: 'stable', errors: 'stable' }
      }
    }

    const averageResponseTime =
      recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length
    const errorRate = recentMetrics.filter((m) => m.errorCount > 0).length / recentMetrics.length
    const healthyPercentage =
      recentMetrics.filter((m) => m.connectionStatus === 'healthy').length / recentMetrics.length

    // Calculate trends
    const half = Math.floor(recentMetrics.length / 2)
    const firstHalf = recentMetrics.slice(0, half)
    const secondHalf = recentMetrics.slice(half)

    const firstHalfAvgResponse =
      firstHalf.reduce((sum, m) => sum + m.responseTime, 0) / firstHalf.length
    const secondHalfAvgResponse =
      secondHalf.reduce((sum, m) => sum + m.responseTime, 0) / secondHalf.length

    const firstHalfErrorRate = firstHalf.filter((m) => m.errorCount > 0).length / firstHalf.length
    const secondHalfErrorRate =
      secondHalf.filter((m) => m.errorCount > 0).length / secondHalf.length

    const responseTimeTrend =
      secondHalfAvgResponse < firstHalfAvgResponse * 0.9
        ? 'improving'
        : secondHalfAvgResponse > firstHalfAvgResponse * 1.1
          ? 'degrading'
          : 'stable'

    const errorTrend =
      secondHalfErrorRate < firstHalfErrorRate * 0.9
        ? 'improving'
        : secondHalfErrorRate > firstHalfErrorRate * 1.1
          ? 'degrading'
          : 'stable'

    return {
      averageResponseTime,
      errorRate,
      healthyPercentage,
      trends: {
        responseTime: responseTimeTrend,
        errors: errorTrend
      }
    }
  }

  private async checkConnectivity(): Promise<{ success: boolean; error?: Error }> {
    try {
      this.db.prepare('SELECT 1').get()
      return { success: true }
    } catch (error) {
      return { success: false, error: error as Error }
    }
  }

  private async checkPerformance(): Promise<{ responseTime: number; queryCount: number }> {
    const startTime = Date.now()
    let queryCount = 0

    try {
      // Test basic queries
      this.db.prepare('SELECT COUNT(*) FROM users').get()
      queryCount++

      this.db.prepare('SELECT COUNT(*) FROM auth_users').get()
      queryCount++

      this.db.prepare('SELECT COUNT(*) FROM auth_sessions').get()
      queryCount++

      const responseTime = Date.now() - startTime
      return { responseTime, queryCount }
    } catch (error) {
      const responseTime = Date.now() - startTime
      return { responseTime, queryCount }
    }
  }

  private async checkDataConsistency(): Promise<{
    inconsistenciesFound: number
    corrected: number
    errors: string[]
  }> {
    if (!this.recoveryManager) {
      return { inconsistenciesFound: 0, corrected: 0, errors: [] }
    }

    try {
      return await this.recoveryManager.verifyAndCorrectInconsistencies(this.db)
    } catch (error) {
      return {
        inconsistenciesFound: 0,
        corrected: 0,
        errors: [`Consistency check failed: ${error}`]
      }
    }
  }

  private async getDatabaseSize(): Promise<number> {
    try {
      const result = this.db.prepare('PRAGMA page_count').get() as { page_count: number }
      const pageSize = this.db.prepare('PRAGMA page_size').get() as { page_size: number }
      return result.page_count * pageSize.page_size
    } catch (error) {
      return 0
    }
  }

  private addMetrics(metrics: HealthMetrics): void {
    this.metrics.push(metrics)

    // Keep only recent metrics
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory)
    }
  }

  private async attemptAutoRecovery(issues: HealthIssue[]): Promise<void> {
    if (!this.recoveryManager) {
      return
    }

    const criticalIssues = issues.filter((i) => i.severity === 'critical')

    for (const issue of criticalIssues) {
      try {
        let recoveryResult: RecoveryResult | undefined

        switch (issue.type) {
          case 'connection':
            recoveryResult = await this.recoveryManager.attemptReconnection(async () => this.db)
            break

          case 'corruption':
            await this.recoveryManager.detectAndRepairCorruption(this.db)
            break

          case 'consistency':
            await this.recoveryManager.verifyAndCorrectInconsistencies(this.db)
            break
        }

        if (recoveryResult?.success) {
          this.emit('auto-recovery-success', { issue, recoveryResult })
        } else if (recoveryResult) {
          this.emit('auto-recovery-failed', { issue, recoveryResult })
        }
      } catch (error) {
        this.emit('auto-recovery-error', { issue, error })
      }
    }
  }
}
