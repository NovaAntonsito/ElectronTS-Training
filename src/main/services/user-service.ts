import { UserRepository, UserSearchOptions } from '../repositories/user-repository'
import { User } from '../types'
import { DatabaseManager } from './database-manager'

export class UserService {
  private userRepository: UserRepository

  constructor(databaseManager: DatabaseManager) {
    this.userRepository = new UserRepository(databaseManager.getDatabase())
  }

  /**
   * Get all users with optional search and pagination
   */
  async getUsers(options: UserSearchOptions = {}) {
    try {
      return await this.userRepository.findWithPagination(options)
    } catch (error) {
      console.error('Error getting users:', error)
      throw error
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string): Promise<User | null> {
    try {
      return await this.userRepository.findById(id)
    } catch (error) {
      console.error(`Error getting user by ID ${id}:`, error)
      throw error
    }
  }

  /**
   * Get user by DNI (optimized with index)
   */
  async getUserByDni(dni: number): Promise<User | null> {
    try {
      return await this.userRepository.findByDni(dni)
    } catch (error) {
      console.error(`Error getting user by DNI ${dni}:`, error)
      throw error
    }
  }

  /**
   * Create a new user
   */
  async createUser(userData: Omit<User, 'id'>): Promise<User> {
    try {
      // Additional business logic can be added here
      return await this.userRepository.create(userData)
    } catch (error) {
      console.error('Error creating user:', error)
      throw error
    }
  }

  /**
   * Update an existing user
   */
  async updateUser(id: string, userData: Partial<Omit<User, 'id'>>): Promise<User> {
    try {
      return await this.userRepository.update(id, userData)
    } catch (error) {
      console.error(`Error updating user ${id}:`, error)
      throw error
    }
  }

  /**
   * Delete a user
   */
  async deleteUser(id: string): Promise<void> {
    try {
      await this.userRepository.delete(id)
    } catch (error) {
      console.error(`Error deleting user ${id}:`, error)
      throw error
    }
  }

  /**
   * Search users with advanced options
   */
  async searchUsers(query: string, options: UserSearchOptions = {}) {
    try {
      return await this.userRepository.search(query, options)
    } catch (error) {
      console.error('Error searching users:', error)
      throw error
    }
  }

  /**
   * Check if DNI is available
   */
  async isDniAvailable(dni: number): Promise<boolean> {
    try {
      const exists = await this.userRepository.dniExists(dni)
      return !exists
    } catch (error) {
      console.error(`Error checking DNI availability ${dni}:`, error)
      throw error
    }
  }

  /**
   * Get repository statistics
   */
  async getStats() {
    try {
      return await this.userRepository.getStats()
    } catch (error) {
      console.error('Error getting user stats:', error)
      throw error
    }
  }

  /**
   * Bulk create users (for data import scenarios)
   */
  async bulkCreateUsers(usersData: Omit<User, 'id'>[]): Promise<User[]> {
    try {
      return await this.userRepository.bulkCreate(usersData)
    } catch (error) {
      console.error('Error bulk creating users:', error)
      throw error
    }
  }

  /**
   * Advanced search with multiple filters
   */
  async advancedSearch(options: {
    searchTerm?: string
    ageRange?: { min?: number; max?: number }
    limit?: number
    offset?: number
    orderBy?: string
    orderDirection?: 'ASC' | 'DESC'
  }) {
    try {
      const searchOptions: UserSearchOptions = {
        searchTerm: options.searchTerm,
        searchFields: ['nombre', 'dni'],
        ageRange: options.ageRange,
        limit: options.limit || 10,
        offset: options.offset || 0,
        orderBy: options.orderBy || 'nombre',
        orderDirection: options.orderDirection || 'ASC'
      }

      return await this.userRepository.findWithPagination(searchOptions)
    } catch (error) {
      console.error('Error in advanced search:', error)
      throw error
    }
  }
}
