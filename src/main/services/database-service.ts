import { DatabaseManager } from './database-manager'
import { databaseConfig } from '../config/database'

class DatabaseService {
  private static instance: DatabaseService
  private databaseManager: DatabaseManager

  private constructor() {
    this.databaseManager = new DatabaseManager(databaseConfig)
  }

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService()
    }
    return DatabaseService.instance
  }

  async initialize(): Promise<void> {
    try {
      await this.databaseManager.initialize()
      console.log('Database service initialized successfully')
    } catch (error) {
      console.error('Failed to initialize database service:', error)
      throw error
    }
  }

  getDatabaseManager(): DatabaseManager {
    return this.databaseManager
  }

  async shutdown(): Promise<void> {
    try {
      await this.databaseManager.disconnect()
      console.log('Database service shut down successfully')
    } catch (error) {
      console.error('Error during database service shutdown:', error)
      throw error
    }
  }
}

export const databaseService = DatabaseService.getInstance()
