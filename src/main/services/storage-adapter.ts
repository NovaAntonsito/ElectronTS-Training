import { User } from '../types'
import { UserStorageLightDBService } from './user-storage-lightdb'

/**
 * Storage adapter - now exclusively uses LightDB after migration completion
 * Legacy JSON support has been removed after successful production migration
 */
export class StorageAdapter {
  private lightdbStorage: UserStorageLightDBService | null = null

  constructor() {
    // Initialize storage lazily to avoid database connection issues
  }

  /**
   * Get or create the LightDB storage service
   */
  private getLightDBStorage(): UserStorageLightDBService {
    if (!this.lightdbStorage) {
      this.lightdbStorage = new UserStorageLightDBService()
    }
    return this.lightdbStorage
  }

  /**
   * Check which storage system is currently active (always LightDB after migration)
   */
  isUsingLightDB(): boolean {
    return true
  }

  /**
   * Load all users from LightDB
   */
  async loadUsers(): Promise<User[]> {
    try {
      return await this.getLightDBStorage().loadUsers()
    } catch (error) {
      console.error('Error loading users from storage adapter:', error)
      throw error
    }
  }

  /**
   * Save users array
   */
  async saveUsers(users: User[]): Promise<void> {
    try {
      await this.getLightDBStorage().saveUsers(users)
    } catch (error) {
      console.error('Error saving users from storage adapter:', error)
      throw error
    }
  }

  /**
   * Add a new user
   */
  async addUser(userData: Omit<User, 'id'>): Promise<User> {
    try {
      return await this.getLightDBStorage().addUser(userData)
    } catch (error) {
      console.error('Error adding user from storage adapter:', error)
      throw error
    }
  }

  /**
   * Update an existing user
   */
  async updateUser(id: string, userData: Omit<User, 'id'>): Promise<User> {
    try {
      return await this.getLightDBStorage().updateUser(id, userData)
    } catch (error) {
      console.error('Error updating user from storage adapter:', error)
      throw error
    }
  }

  /**
   * Delete a user by ID
   */
  async deleteUser(id: string): Promise<void> {
    try {
      await this.getLightDBStorage().deleteUser(id)
    } catch (error) {
      console.error('Error deleting user from storage adapter:', error)
      throw error
    }
  }

  /**
   * Find user by DNI
   */
  async findUserByDni(dni: number): Promise<User | null> {
    try {
      return await this.getLightDBStorage().findUserByDni(dni)
    } catch (error) {
      console.error('Error finding user by DNI from storage adapter:', error)
      throw error
    }
  }

  /**
   * Find user by ID
   */
  async findUserById(id: string): Promise<User | null> {
    try {
      return await this.getLightDBStorage().findUserById(id)
    } catch (error) {
      console.error('Error finding user by ID from storage adapter:', error)
      throw error
    }
  }

  /**
   * Search users
   */
  async searchUsers(
    query: string,
    options?: {
      limit?: number
      offset?: number
      orderBy?: string
      orderDirection?: 'ASC' | 'DESC'
    }
  ): Promise<User[]> {
    try {
      return await this.getLightDBStorage().searchUsers(query, options)
    } catch (error) {
      console.error('Error searching users from storage adapter:', error)
      throw error
    }
  }

  /**
   * Get users with pagination
   */
  async getUsersWithPagination(options?: {
    limit?: number
    offset?: number
    orderBy?: string
    orderDirection?: 'ASC' | 'DESC'
    searchTerm?: string
  }): Promise<{
    users: User[]
    pagination: {
      total: number
      limit: number
      offset: number
      hasMore: boolean
      totalPages: number
      currentPage: number
    }
  }> {
    try {
      return await this.getLightDBStorage().getUsersWithPagination(options)
    } catch (error) {
      console.error('Error getting paginated users from storage adapter:', error)
      throw error
    }
  }

  /**
   * Get user statistics
   */
  async getStats(): Promise<{
    totalUsers: number
    ageStats: {
      min: number
      max: number
      average: number
    }
  }> {
    try {
      return await this.getLightDBStorage().getStats()
    } catch (error) {
      console.error('Error getting stats from storage adapter:', error)
      throw error
    }
  }

  /**
   * Check if DNI is available
   */
  async isDniAvailable(dni: number): Promise<boolean> {
    try {
      return await this.getLightDBStorage().isDniAvailable(dni)
    } catch (error) {
      console.error('Error checking DNI availability from storage adapter:', error)
      throw error
    }
  }
}
