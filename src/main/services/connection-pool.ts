import Database from 'better-sqlite3'
// Database configuration is imported when needed

export interface PoolConfig {
  min: number
  max: number
  timeout: number
}

export interface ConnectionInfo {
  id: string
  database: Database.Database
  inUse: boolean
  createdAt: Date
  lastUsed: Date
}

export class ConnectionPool {
  private connections: Map<string, ConnectionInfo> = new Map()
  private available: string[] = []
  private config: PoolConfig
  private dbPath: string
  private pragmas: Record<string, any>
  private isInitialized = false

  constructor(config: PoolConfig, dbPath: string, pragmas: Record<string, any>) {
    this.config = config
    this.dbPath = dbPath
    this.pragmas = pragmas
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    // Create minimum number of connections
    for (let i = 0; i < this.config.min; i++) {
      await this.createConnection()
    }

    this.isInitialized = true
    console.log(`ConnectionPool initialized with ${this.config.min} connections`)
  }

  async getConnection(): Promise<Database.Database> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    // Try to get an available connection
    if (this.available.length > 0) {
      const connectionId = this.available.pop()!
      const connectionInfo = this.connections.get(connectionId)!

      connectionInfo.inUse = true
      connectionInfo.lastUsed = new Date()

      return connectionInfo.database
    }

    // If no available connections and we haven't reached max, create a new one
    if (this.connections.size < this.config.max) {
      const connectionInfo = await this.createConnection()
      connectionInfo.inUse = true
      connectionInfo.lastUsed = new Date()

      return connectionInfo.database
    }

    // Wait for a connection to become available
    return this.waitForConnection()
  }

  async releaseConnection(database: Database.Database): Promise<void> {
    // Find the connection by database instance
    for (const [id, connectionInfo] of this.connections.entries()) {
      if (connectionInfo.database === database) {
        connectionInfo.inUse = false
        connectionInfo.lastUsed = new Date()
        this.available.push(id)
        return
      }
    }

    console.warn('Attempted to release unknown connection')
  }

  async closeAll(): Promise<void> {
    for (const [id, connectionInfo] of this.connections.entries()) {
      try {
        connectionInfo.database.close()
      } catch (error) {
        console.error(`Error closing connection ${id}:`, error)
      }
    }

    this.connections.clear()
    this.available.length = 0
    this.isInitialized = false

    console.log('All connections closed')
  }

  getStats(): {
    total: number
    available: number
    inUse: number
    min: number
    max: number
  } {
    const inUse = Array.from(this.connections.values()).filter((conn) => conn.inUse).length

    return {
      total: this.connections.size,
      available: this.available.length,
      inUse,
      min: this.config.min,
      max: this.config.max
    }
  }

  private async createConnection(): Promise<ConnectionInfo> {
    const id = this.generateConnectionId()
    const database = new Database(this.dbPath)

    // Apply pragmas to the new connection
    this.applyPragmas(database)

    const connectionInfo: ConnectionInfo = {
      id,
      database,
      inUse: false,
      createdAt: new Date(),
      lastUsed: new Date()
    }

    this.connections.set(id, connectionInfo)
    this.available.push(id)

    return connectionInfo
  }

  private applyPragmas(database: Database.Database): void {
    try {
      database.exec(`PRAGMA journal_mode = ${this.pragmas.journal_mode}`)
      database.exec(`PRAGMA synchronous = ${this.pragmas.synchronous}`)
      database.exec(`PRAGMA cache_size = ${this.pragmas.cache_size}`)
      database.exec(`PRAGMA temp_store = ${this.pragmas.temp_store}`)
      database.exec(`PRAGMA mmap_size = ${this.pragmas.mmap_size}`)
    } catch (error) {
      console.error('Failed to apply pragmas to connection:', error)
      throw error
    }
  }

  private async waitForConnection(): Promise<Database.Database> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now()

      const checkForConnection = () => {
        if (this.available.length > 0) {
          const connectionId = this.available.pop()!
          const connectionInfo = this.connections.get(connectionId)!

          connectionInfo.inUse = true
          connectionInfo.lastUsed = new Date()

          resolve(connectionInfo.database)
          return
        }

        if (Date.now() - startTime > this.config.timeout) {
          reject(new Error('Connection timeout: No available connections'))
          return
        }

        setTimeout(checkForConnection, 10)
      }

      checkForConnection()
    })
  }

  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}
