import { promises as fs } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { User, UserStorageData, StorageError, ValidationError } from '../types'

export class UserStorageService {
  private readonly filePath: string
  private readonly backupPath: string

  constructor() {
    const userDataPath = app.getPath('userData')
    this.filePath = join(userDataPath, 'users.json')
    this.backupPath = join(userDataPath, 'users.backup.json')
  }

  /**
   * Load all users from storage
   */
  async loadUsers(): Promise<User[]> {
    try {
      const data = await this.readStorageFile()
      return data.users
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        // File doesn't exist, return empty array
        return []
      }
      throw new StorageError(
        `Error loading users: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'LOAD_ERROR'
      )
    }
  }

  /**
   * Save users array to storage
   */
  async saveUsers(users: User[]): Promise<void> {
    try {
      // Validate all users before saving
      users.forEach((user) => this.validateUser(user))

      // Create backup before saving
      await this.createBackup()

      const data: UserStorageData = {
        users,
        metadata: {
          version: '1.0',
          lastModified: new Date().toISOString()
        }
      }

      await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf8')
    } catch (error) {
      throw new StorageError(
        `Error saving users: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SAVE_ERROR'
      )
    }
  }

  /**
   * Add a new user
   */
  async addUser(userData: Omit<User, 'id'>): Promise<User> {
    try {
      // Validate user data
      this.validateUserData(userData)

      // Load existing users
      const users = await this.loadUsers()

      // Check for duplicate DNI
      const existingUser = users.find((user) => user.dni === userData.dni)
      if (existingUser) {
        throw new ValidationError(
          `El DNI ${userData.dni} ya está registrado para el usuario "${existingUser.nombre}"`,
          'dni'
        )
      }

      // Create new user with ID
      const newUser: User = {
        id: uuidv4(),
        ...userData
      }

      // Add to users array and save
      users.push(newUser)
      await this.saveUsers(users)

      return newUser
    } catch (error) {
      if (error instanceof ValidationError || error instanceof StorageError) {
        throw error
      }
      throw new StorageError(
        `Error adding user: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'ADD_ERROR'
      )
    }
  }

  /**
   * Update an existing user
   */
  async updateUser(id: string, userData: Omit<User, 'id'>): Promise<User> {
    try {
      // Validate user data
      this.validateUserData(userData)

      // Load existing users
      const users = await this.loadUsers()

      // Find user to update
      const userIndex = users.findIndex((user) => user.id === id)
      if (userIndex === -1) {
        throw new ValidationError('User not found', 'id')
      }

      // Check for duplicate DNI (excluding current user)
      const existingUser = users.find((user) => user.id !== id && user.dni === userData.dni)
      if (existingUser) {
        throw new ValidationError(
          `El DNI ${userData.dni} ya está registrado para el usuario "${existingUser.nombre}"`,
          'dni'
        )
      }

      // Update user
      const updatedUser: User = {
        id,
        ...userData
      }

      users[userIndex] = updatedUser
      await this.saveUsers(users)

      return updatedUser
    } catch (error) {
      if (error instanceof ValidationError || error instanceof StorageError) {
        throw error
      }
      throw new StorageError(
        `Error updating user: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'UPDATE_ERROR'
      )
    }
  }

  /**
   * Delete a user by ID
   */
  async deleteUser(id: string): Promise<void> {
    try {
      // Load existing users
      const users = await this.loadUsers()

      // Find user to delete
      const userIndex = users.findIndex((user) => user.id === id)
      if (userIndex === -1) {
        throw new ValidationError('User not found', 'id')
      }

      // Remove user and save
      users.splice(userIndex, 1)
      await this.saveUsers(users)
    } catch (error) {
      if (error instanceof ValidationError || error instanceof StorageError) {
        throw error
      }
      throw new StorageError(
        `Error deleting user: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DELETE_ERROR'
      )
    }
  }

  /**
   * Read and parse storage file with recovery mechanism
   */
  private async readStorageFile(): Promise<UserStorageData> {
    try {
      const fileContent = await fs.readFile(this.filePath, 'utf8')
      const data = JSON.parse(fileContent) as UserStorageData

      // Validate file structure
      if (!data.users || !Array.isArray(data.users)) {
        throw new StorageError('Invalid storage file format', 'INVALID_FORMAT')
      }

      // Validate each user in the data
      data.users.forEach((user, index) => {
        try {
          this.validateUser(user)
        } catch (validationError) {
          throw new StorageError(
            `Invalid user data at index ${index}: ${validationError instanceof Error ? validationError.message : 'Unknown error'}`,
            'INVALID_USER_DATA'
          )
        }
      })

      return data
    } catch (error) {
      if (error instanceof SyntaxError) {
        // Try to recover from backup if main file is corrupted
        return await this.recoverFromBackup()
      }
      throw error
    }
  }

  /**
   * Attempt to recover data from backup file
   */
  private async recoverFromBackup(): Promise<UserStorageData> {
    try {
      console.warn('Main storage file corrupted, attempting recovery from backup...')
      const backupContent = await fs.readFile(this.backupPath, 'utf8')
      const backupData = JSON.parse(backupContent) as UserStorageData

      // Validate backup file structure
      if (!backupData.users || !Array.isArray(backupData.users)) {
        throw new StorageError('Backup file also corrupted', 'BACKUP_CORRUPTED')
      }

      // Restore main file from backup
      await fs.writeFile(this.filePath, backupContent, 'utf8')
      console.log('Successfully recovered from backup file')

      return backupData
    } catch (backupError) {
      if (backupError instanceof Error && 'code' in backupError && backupError.code === 'ENOENT') {
        // No backup exists, return empty data structure
        console.warn('No backup file found, initializing with empty data')
        return {
          users: [],
          metadata: {
            version: '1.0',
            lastModified: new Date().toISOString()
          }
        }
      }
      throw new StorageError(
        'Failed to recover from backup and main file is corrupted',
        'RECOVERY_FAILED'
      )
    }
  }

  /**
   * Create backup of current storage file
   */
  private async createBackup(): Promise<void> {
    try {
      await fs.access(this.filePath)
      await fs.copyFile(this.filePath, this.backupPath)
    } catch (error) {
      // If original file doesn't exist, no backup needed
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return
      }
      throw new StorageError('Failed to create backup', 'BACKUP_ERROR')
    }
  }

  /**
   * Validate user data with enhanced error messages
   */
  private validateUserData(userData: Omit<User, 'id'>): void {
    // Validate nombre
    if (!userData.nombre || typeof userData.nombre !== 'string') {
      throw new ValidationError('El nombre es requerido y debe ser texto válido', 'nombre')
    }

    const trimmedName = userData.nombre.trim()
    if (trimmedName.length === 0) {
      throw new ValidationError('El nombre no puede estar vacío', 'nombre')
    }
    if (trimmedName.length < 2) {
      throw new ValidationError('El nombre debe tener al menos 2 caracteres', 'nombre')
    }
    if (trimmedName.length > 100) {
      throw new ValidationError('El nombre no puede exceder 100 caracteres', 'nombre')
    }
    if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(trimmedName)) {
      throw new ValidationError('El nombre solo puede contener letras y espacios', 'nombre')
    }

    // Validate edad
    if (typeof userData.edad !== 'number' || !Number.isInteger(userData.edad)) {
      throw new ValidationError('La edad debe ser un número entero válido', 'edad')
    }
    if (userData.edad < 1) {
      throw new ValidationError('La edad debe ser mayor a 0', 'edad')
    }
    if (userData.edad > 120) {
      throw new ValidationError('La edad no puede ser mayor a 120 años', 'edad')
    }

    // Validate DNI with enhanced checks
    if (typeof userData.dni !== 'number' || !Number.isInteger(userData.dni)) {
      throw new ValidationError('El DNI debe ser un número entero válido', 'dni')
    }
    if (userData.dni <= 0) {
      throw new ValidationError('El DNI debe ser un número positivo', 'dni')
    }
    if (userData.dni < 1000000) {
      throw new ValidationError('El DNI debe tener al menos 7 dígitos', 'dni')
    }
    if (userData.dni > 99999999) {
      throw new ValidationError('El DNI no puede tener más de 8 dígitos', 'dni')
    }
  }

  /**
   * Validate complete user object
   */
  private validateUser(user: User): void {
    if (!user.id || typeof user.id !== 'string') {
      throw new ValidationError('User ID is required and must be a string', 'id')
    }
    this.validateUserData(user)
  }
}
