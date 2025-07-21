import * as fs from 'fs/promises'
import * as path from 'path'
import { app } from 'electron'

/**
 * Internal user data structure for credential storage
 */
interface StoredUser {
  id: string
  username: string
  passwordHash: string
  displayName: string
  active: boolean
  mustChangePassword: boolean
  lastLogin: string | null
  failedAttempts: number
  lockedUntil: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Credential storage data structure
 */
interface CredentialData {
  users: StoredUser[]
  metadata: {
    version: string
    lastModified: string
  }
}

/**
 * User data for external consumption
 */
export interface UserData {
  id: string
  username: string
  passwordHash: string
  displayName: string
  active: boolean
  mustChangePassword: boolean
  lastLogin: Date | null
  failedAttempts: number
  lockedUntil: Date | null
  createdAt: Date
  updatedAt: Date
}

/**
 * CredentialStore handles secure storage of user credentials
 * Uses JSON file storage with proper file permissions
 */
export class CredentialStore {
  private credentialsPath: string
  private data: CredentialData | null = null

  constructor() {
    // Store credentials in app's user data directory
    const userDataPath = app.getPath('userData')
    this.credentialsPath = path.join(userDataPath, 'credentials.json')
  }

  /**
   * Initialize the credential store
   */
  async initialize(): Promise<void> {
    try {
      await this.loadCredentials()
    } catch (error) {
      console.error('Error initializing credential store:', error)
      throw error
    }
  }

  /**
   * Create a new user
   */
  async createUser(userData: UserData): Promise<void> {
    await this.ensureLoaded()
    
    // Check if username already exists
    const existingUser = this.data!.users.find(u => u.username === userData.username)
    if (existingUser) {
      throw new Error('Username already exists')
    }

    const storedUser: StoredUser = {
      id: userData.id,
      username: userData.username,
      passwordHash: userData.passwordHash,
      displayName: userData.displayName,
      active: userData.active,
      mustChangePassword: userData.mustChangePassword,
      lastLogin: userData.lastLogin?.toISOString() || null,
      failedAttempts: userData.failedAttempts,
      lockedUntil: userData.lockedUntil?.toISOString() || null,
      createdAt: userData.createdAt.toISOString(),
      updatedAt: userData.updatedAt.toISOString()
    }

    this.data!.users.push(storedUser)
    await this.saveCredentials()
  }

  /**
   * Find user by username
   */
  async findUserByUsername(username: string): Promise<UserData | null> {
    await this.ensureLoaded()
    
    const storedUser = this.data!.users.find(u => u.username === username)
    if (!storedUser) {
      return null
    }

    return this.convertToUserData(storedUser)
  }

  /**
   * Find user by ID
   */
  async findUserById(id: string): Promise<UserData | null> {
    await this.ensureLoaded()
    
    const storedUser = this.data!.users.find(u => u.id === id)
    if (!storedUser) {
      return null
    }

    return this.convertToUserData(storedUser)
  }

  /**
   * Update user data
   */
  async updateUser(id: string, updates: Partial<UserData>): Promise<void> {
    await this.ensureLoaded()
    
    const userIndex = this.data!.users.findIndex(u => u.id === id)
    if (userIndex === -1) {
      throw new Error('User not found')
    }

    const currentUser = this.data!.users[userIndex]
    
    // Apply updates
    if (updates.passwordHash !== undefined) currentUser.passwordHash = updates.passwordHash
    if (updates.displayName !== undefined) currentUser.displayName = updates.displayName
    if (updates.active !== undefined) currentUser.active = updates.active
    if (updates.mustChangePassword !== undefined) currentUser.mustChangePassword = updates.mustChangePassword
    if (updates.lastLogin !== undefined) currentUser.lastLogin = updates.lastLogin?.toISOString() || null
    if (updates.failedAttempts !== undefined) currentUser.failedAttempts = updates.failedAttempts
    if (updates.lockedUntil !== undefined) currentUser.lockedUntil = updates.lockedUntil?.toISOString() || null
    
    currentUser.updatedAt = new Date().toISOString()

    await this.saveCredentials()
  }

  /**
   * Increment failed login attempts
   */
  async incrementFailedAttempts(id: string): Promise<void> {
    await this.ensureLoaded()
    
    const userIndex = this.data!.users.findIndex(u => u.id === id)
    if (userIndex === -1) {
      throw new Error('User not found')
    }

    this.data!.users[userIndex].failedAttempts++
    this.data!.users[userIndex].updatedAt = new Date().toISOString()

    await this.saveCredentials()
  }

  /**
   * Reset failed login attempts
   */
  async resetFailedAttempts(id: string): Promise<void> {
    await this.ensureLoaded()
    
    const userIndex = this.data!.users.findIndex(u => u.id === id)
    if (userIndex === -1) {
      throw new Error('User not found')
    }

    this.data!.users[userIndex].failedAttempts = 0
    this.data!.users[userIndex].lockedUntil = null
    this.data!.users[userIndex].updatedAt = new Date().toISOString()

    await this.saveCredentials()
  }

  /**
   * Lock user account until specified time
   */
  async lockUser(id: string, until: Date): Promise<void> {
    await this.ensureLoaded()
    
    const userIndex = this.data!.users.findIndex(u => u.id === id)
    if (userIndex === -1) {
      throw new Error('User not found')
    }

    this.data!.users[userIndex].lockedUntil = until.toISOString()
    this.data!.users[userIndex].updatedAt = new Date().toISOString()

    await this.saveCredentials()
  }

  /**
   * Update last login time
   */
  async updateLastLogin(id: string): Promise<void> {
    await this.ensureLoaded()
    
    const userIndex = this.data!.users.findIndex(u => u.id === id)
    if (userIndex === -1) {
      throw new Error('User not found')
    }

    this.data!.users[userIndex].lastLogin = new Date().toISOString()
    this.data!.users[userIndex].updatedAt = new Date().toISOString()

    await this.saveCredentials()
  }

  /**
   * Get all users
   */
  async getAllUsers(): Promise<UserData[]> {
    await this.ensureLoaded()
    
    return this.data!.users.map(user => this.convertToUserData(user))
  }

  /**
   * Load credentials from file
   */
  private async loadCredentials(): Promise<void> {
    try {
      const fileContent = await fs.readFile(this.credentialsPath, 'utf-8')
      this.data = JSON.parse(fileContent)
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, create empty structure
        this.data = {
          users: [],
          metadata: {
            version: '1.0',
            lastModified: new Date().toISOString()
          }
        }
        await this.saveCredentials()
      } else {
        throw error
      }
    }
  }

  /**
   * Save credentials to file
   */
  private async saveCredentials(): Promise<void> {
    if (!this.data) {
      throw new Error('No credential data to save')
    }

    this.data.metadata.lastModified = new Date().toISOString()
    
    const fileContent = JSON.stringify(this.data, null, 2)
    await fs.writeFile(this.credentialsPath, fileContent, { 
      encoding: 'utf-8',
      mode: 0o600 // Restrict file permissions to owner only
    })
  }

  /**
   * Ensure credentials are loaded
   */
  private async ensureLoaded(): Promise<void> {
    if (!this.data) {
      await this.loadCredentials()
    }
  }

  /**
   * Convert stored user to UserData format
   */
  private convertToUserData(storedUser: StoredUser): UserData {
    return {
      id: storedUser.id,
      username: storedUser.username,
      passwordHash: storedUser.passwordHash,
      displayName: storedUser.displayName,
      active: storedUser.active,
      mustChangePassword: storedUser.mustChangePassword,
      lastLogin: storedUser.lastLogin ? new Date(storedUser.lastLogin) : null,
      failedAttempts: storedUser.failedAttempts,
      lockedUntil: storedUser.lockedUntil ? new Date(storedUser.lockedUntil) : null,
      createdAt: new Date(storedUser.createdAt),
      updatedAt: new Date(storedUser.updatedAt)
    }
  }
}