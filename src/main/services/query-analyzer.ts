import Database from 'better-sqlite3'

export interface QueryPlan {
  id: number
  parent: number
  notused: number
  detail: string
}

export interface QueryAnalysis {
  query: string
  executionTime: number
  plan: QueryPlan[]
  usesIndex: boolean
  scanCount: number
  recommendations: string[]
}

export interface QueryStats {
  totalQueries: number
  averageExecutionTime: number
  slowQueries: QueryAnalysis[]
  indexUsage: Map<string, number>
}

export class QueryAnalyzer {
  private queryHistory: QueryAnalysis[] = []
  private slowQueryThreshold = 100 // ms
  private maxHistorySize = 1000

  constructor(private database: Database.Database) {}

  async analyzeQuery(query: string, params: unknown[] = []): Promise<QueryAnalysis> {
    const startTime = performance.now()

    // Get query plan
    const plan = this.getQueryPlan(query)

    // Execute query to measure actual time
    try {
      const stmt = this.database.prepare(query)
      if (params.length > 0) {
        stmt.all(...params)
      } else {
        stmt.all()
      }
    } catch (error) {
      // Query might be DDL or have issues, continue with analysis
    }

    const executionTime = performance.now() - startTime

    // Analyze the plan
    const analysis: QueryAnalysis = {
      query,
      executionTime,
      plan,
      usesIndex: this.checkIndexUsage(plan),
      scanCount: this.countTableScans(plan),
      recommendations: this.generateRecommendations(plan, query)
    }

    // Store in history
    this.addToHistory(analysis)

    return analysis
  }

  private getQueryPlan(query: string): QueryPlan[] {
    try {
      // For parameterized queries, replace parameters with placeholder values for EXPLAIN
      const explainQuery = `EXPLAIN QUERY PLAN ${query.replace(/\?/g, "'placeholder'")}`
      const stmt = this.database.prepare(explainQuery)
      return stmt.all() as QueryPlan[]
    } catch (error) {
      console.warn('Failed to get query plan:', error)
      return []
    }
  }

  private checkIndexUsage(plan: QueryPlan[]): boolean {
    return plan.some(
      (step) =>
        step.detail.toLowerCase().includes('using index') ||
        step.detail.toLowerCase().includes('using covering index')
    )
  }

  private countTableScans(plan: QueryPlan[]): number {
    return plan.filter((step) => step.detail.toLowerCase().includes('scan table')).length
  }

  private generateRecommendations(plan: QueryPlan[], query: string): string[] {
    const recommendations: string[] = []

    // Check for table scans
    const hasTableScan = plan.some((step) => step.detail.toLowerCase().includes('scan table'))

    if (hasTableScan) {
      recommendations.push(
        'Consider adding indexes for columns used in WHERE, JOIN, or ORDER BY clauses'
      )
    }

    // Check for sorting without index
    const hasSort = plan.some((step) =>
      step.detail.toLowerCase().includes('use temp b-tree for order by')
    )

    if (hasSort) {
      recommendations.push('Consider adding an index that matches the ORDER BY clause')
    }

    // Check for complex joins
    const joinCount = plan.filter((step) => step.detail.toLowerCase().includes('join')).length

    if (joinCount > 2) {
      recommendations.push(
        'Complex joins detected - consider query optimization or denormalization'
      )
    }

    // Check for LIKE patterns
    if (query.toLowerCase().includes('like')) {
      if (query.includes("LIKE '%")) {
        recommendations.push('LIKE patterns starting with % cannot use indexes efficiently')
      }
    }

    return recommendations
  }

  private addToHistory(analysis: QueryAnalysis): void {
    this.queryHistory.push(analysis)

    // Keep history size manageable
    if (this.queryHistory.length > this.maxHistorySize) {
      this.queryHistory.shift()
    }
  }

  getStats(): QueryStats {
    const totalQueries = this.queryHistory.length
    const averageExecutionTime =
      totalQueries > 0
        ? this.queryHistory.reduce((sum, q) => sum + q.executionTime, 0) / totalQueries
        : 0

    const slowQueries = this.queryHistory
      .filter((q) => q.executionTime > this.slowQueryThreshold)
      .sort((a, b) => b.executionTime - a.executionTime)
      .slice(0, 10) // Top 10 slowest

    const indexUsage = new Map<string, number>()

    // Count index usage from query plans
    this.queryHistory.forEach((analysis) => {
      analysis.plan.forEach((step) => {
        const detail = step.detail.toLowerCase()
        if (detail.includes('using index')) {
          const indexMatch = detail.match(/using index (\w+)/)
          if (indexMatch) {
            const indexName = indexMatch[1]
            indexUsage.set(indexName, (indexUsage.get(indexName) || 0) + 1)
          }
        }
      })
    })

    return {
      totalQueries,
      averageExecutionTime,
      slowQueries,
      indexUsage
    }
  }

  getSlowQueries(threshold?: number): QueryAnalysis[] {
    const limit = threshold || this.slowQueryThreshold
    return this.queryHistory
      .filter((q) => q.executionTime > limit)
      .sort((a, b) => b.executionTime - a.executionTime)
  }

  suggestIndexes(): string[] {
    const suggestions: string[] = []
    const tableScans = new Map<string, number>()

    // Analyze query history for patterns
    this.queryHistory.forEach((analysis) => {
      analysis.plan.forEach((step) => {
        if (step.detail.toLowerCase().includes('scan table')) {
          const tableMatch = step.detail.match(/scan table (\w+)/i)
          if (tableMatch) {
            const tableName = tableMatch[1]
            tableScans.set(tableName, (tableScans.get(tableName) || 0) + 1)
          }
        }
      })
    })

    // Suggest indexes for frequently scanned tables
    for (const [table, count] of tableScans.entries()) {
      if (count > 5) {
        // Threshold for frequent scans
        suggestions.push(`Consider adding indexes to table '${table}' (scanned ${count} times)`)
      }
    }

    return suggestions
  }

  clearHistory(): void {
    this.queryHistory.length = 0
  }

  setSlowQueryThreshold(threshold: number): void {
    this.slowQueryThreshold = threshold
  }
}
