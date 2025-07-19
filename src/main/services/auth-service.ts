import { AuthRepository } from '../repositories/auth-repository'
import { AuthUser, AuthSession, CreateAuthUserData, CreateSessionData } from '../types'
import { DatabaseManager } from './database-manager'
import { databaseService } from './database-service'
import { SessionCleanupService } from './session-cleanup'

/**
 * Authentication service that provides high-level auth operations
 * using the AuthRepository for data persistence
 */
export class AuthService {
  private authRepository: AuthRepository | null = null
  private databaseManager: DatabaseManager | null = null
  private sessionCleanupService: SessionCleanupService | null = null

  constructor() {
    // Initialize services lazily to avoid database connection issues
  }

  /**
   * Get or create the auth repository
   */
  private async getAuthRepository(): Promise<AuthRepository> {
    if (!this.authRepository) {
      this.databaseManager = databaseService.getDatabaseManager()
      const db = await this.databaseManager.getDatabase()
      this.authRepository = new AuthRepository(db)
    }
    return this.authRepository
  }

  /**
   * Get or create the session cleanup service
   */
  private async getSessionCleanupService(): Promise<SessionCleanupService> {
    if (!this.sessionCleanupService) {
      const authRepository = await this.getAuthRepository()
      this.sessionCleanupService = new SessionCleanupService(authRepository, {
        intervalMinutes: 30, // Clean up every 30 minutes
        maxSessionAge: 24 * 60, // Sessions expire after 24 hours
        batchSize: 100
      })
    }
    return this.sessionCleanupService
  }

  /**
   * Start the auth service and session cleanup
   */
  async start(): Promise<void> {
    try {
      // Start session cleanup service
      const sessionCleanup = await this.getSessionCleanupService()
      sessionCleanup.start()
      console.log('Auth service started successfully')
    } catch (error) {
      console.error('Failed to start auth service:', error)
      throw error
    }
  }

  /**
   * Stop the auth service and cleanup
   */
  async stop(): Promise<void> {
    try {
      // Stop session cleanup service if it exists
      if (this.sessionCleanupService) {
        this.sessionCleanupService.stop()
      }
      console.log('Auth service stopped successfully')
    } catch (error) {
      console.error('Error stopping auth service:', error)
      throw error
    }
  }

  // ========== USER MANAGEMENT ==========

  /**
   * Create a new authentication user
   */
  async createUser(userData: CreateAuthUserData): Promise<AuthUser> {
    try {
      const authRepository = await this.getAuthRepository()
      return await authRepository.createUser(userData)
    } catch (error) {
      console.error('Error creating auth user:', error)
      throw error
    }
  }

  /**
   * Find user by username
   */
  async findUserByUsername(username: string): Promise<AuthUser | null> {
    try {
      const authRepository = await this.getAuthRepository()
      return await authRepository.findUserByUsername(username)
    } catch (error) {
      console.error(`Error finding user by username ${username}:`, error)
      throw error
    }
  }

  /**
   * Find user by ID
   */
  async findUserById(id: string): Promise<AuthUser | null> {
    try {
      const authRepository = await this.getAuthRepository()
      return await authRepository.findUserById(id)
    } catch (error) {
      console.error(`Error finding user by ID ${id}:`, error)
      throw error
    }
  }

  /**
   * Update user information
   */
  async updateUser(id: string, userData: Partial<AuthUser>): Promise<AuthUser> {
    try {
      const authRepository = await this.getAuthRepository()
      return await authRepository.updateUser(id, userData)
    } catch (error) {
      console.error(`Error updating user ${id}:`, error)
      throw error
    }
  }

  /**
   * Get all authentication users with filtering
   */
  async getAllUsers(options?: {
    searchTerm?: string
    activeOnly?: boolean
    lockedOnly?: boolean
    limit?: number
    offset?: number
  }) {
    try {
      const authRepository = await this.getAuthRepository()
      return await authRepository.findAllUsers(options)
    } catch (error) {
      console.error('Error getting all auth users:', error)
      throw error
    }
  }

  // ========== AUTHENTICATION OPERATIONS ==========

  /**
   * Authenticate user with username and password
   * This is a placeholder - in real implementation, you'd hash and compare passwords
   */
  async authenticateUser(
    username: string,
    _password: string
  ): Promise<{
    success: boolean
    user?: AuthUser
    reason?: string
  }> {
    try {
      const authRepository = await this.getAuthRepository()
      const user = await authRepository.findUserByUsername(username)

      if (!user) {
        return { success: false, reason: 'User not found' }
      }

      if (!user.active) {
        return { success: false, reason: 'User account is disabled' }
      }

      // Check if user is locked
      const isLocked = await authRepository.isUserLocked(user.id)
      if (isLocked) {
        return { success: false, reason: 'User account is locked' }
      }

      // TODO: In real implementation, compare hashed password
      // For now, we'll assume password validation happens elsewhere
      // const isValidPassword = await this.comparePassword(password, user.password_hash)

      // Placeholder password check (replace with real password hashing)
      const isValidPassword = true // This should be actual password verification

      if (!isValidPassword) {
        // Increment failed attempts
        await authRepository.incrementFailedAttempts(user.id)

        // Check if user should be locked after failed attempts
        const updatedUser = await authRepository.findUserById(user.id)
        if (updatedUser && updatedUser.failed_attempts >= 5) {
          // Lock user for 30 minutes
          const lockUntil = new Date(Date.now() + 30 * 60 * 1000)
          await authRepository.lockUser(user.id, lockUntil)
          return { success: false, reason: 'Too many failed attempts. Account locked.' }
        }

        return { success: false, reason: 'Invalid password' }
      }

      // Successful authentication
      await authRepository.resetFailedAttempts(user.id)
      await authRepository.updateLastLogin(user.id)

      return { success: true, user }
    } catch (error) {
      console.error('Error during authentication:', error)
      throw error
    }
  }

  /**
   * Lock user account
   */
  async lockUser(id: string, until: Date): Promise<void> {
    try {
      const authRepository = await this.getAuthRepository()
      await authRepository.lockUser(id, until)
    } catch (error) {
      console.error(`Error locking user ${id}:`, error)
      throw error
    }
  }

  /**
   * Unlock user account
   */
  async unlockUser(id: string): Promise<void> {
    try {
      const authRepository = await this.getAuthRepository()
      await authRepository.resetFailedAttempts(id)
    } catch (error) {
      console.error(`Error unlocking user ${id}:`, error)
      throw error
    }
  }

  /**
   * Check if user is locked
   */
  async isUserLocked(id: string): Promise<boolean> {
    try {
      const authRepository = await this.getAuthRepository()
      return await authRepository.isUserLocked(id)
    } catch (error) {
      console.error(`Error checking lock status for user ${id}:`, error)
      throw error
    }
  }

  // ========== SESSION MANAGEMENT ==========

  /**
   * Create a new session for authenticated user
   */
  async createSession(userId: string, expiresInMinutes: number = 24 * 60): Promise<AuthSession> {
    try {
      const authRepository = await this.getAuthRepository()
      const token = this.generateSessionToken()
      const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000)

      const sessionData: CreateSessionData = {
        user_id: userId,
        token,
        expires_at: expiresAt
      }

      return await authRepository.createSession(sessionData)
    } catch (error) {
      console.error('Error creating session:', error)
      throw error
    }
  }

  /**
   * Find session by token
   */
  async findSessionByToken(token: string): Promise<AuthSession | null> {
    try {
      const authRepository = await this.getAuthRepository()
      return await authRepository.findSessionByToken(token)
    } catch (error) {
      console.error('Error finding session by token:', error)
      throw error
    }
  }

  /**
   * Validate session and return user if valid
   */
  async validateSession(token: string): Promise<{
    valid: boolean
    user?: AuthUser
    session?: AuthSession
  }> {
    try {
      const authRepository = await this.getAuthRepository()
      const session = await authRepository.findSessionByToken(token)

      if (!session) {
        return { valid: false }
      }

      // Session is automatically filtered by expiry in the repository
      const user = await authRepository.findUserById(session.user_id)

      if (!user || !user.active) {
        // Clean up invalid session
        await authRepository.deleteSession(token)
        return { valid: false }
      }

      return { valid: true, user, session }
    } catch (error) {
      console.error('Error validating session:', error)
      throw error
    }
  }

  /**
   * Delete session (logout)
   */
  async deleteSession(token: string): Promise<void> {
    try {
      const authRepository = await this.getAuthRepository()
      await authRepository.deleteSession(token)
    } catch (error) {
      console.error('Error deleting session:', error)
      throw error
    }
  }

  /**
   * Delete all sessions for a user
   */
  async deleteUserSessions(userId: string): Promise<void> {
    try {
      const authRepository = await this.getAuthRepository()
      await authRepository.deleteUserSessions(userId)
    } catch (error) {
      console.error(`Error deleting sessions for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Get active sessions for a user
   */
  async getUserActiveSessions(userId: string): Promise<AuthSession[]> {
    try {
      const authRepository = await this.getAuthRepository()
      return await authRepository.getUserActiveSessions(userId)
    } catch (error) {
      console.error(`Error getting active sessions for user ${userId}:`, error)
      throw error
    }
  }

  // ========== UTILITY METHODS ==========

  /**
   * Get authentication statistics
   */
  async getAuthStats() {
    try {
      const authRepository = await this.getAuthRepository()
      return await authRepository.getAuthStats()
    } catch (error) {
      console.error('Error getting auth stats:', error)
      throw error
    }
  }

  /**
   * Run manual session cleanup
   */
  async cleanupExpiredSessions() {
    try {
      const sessionCleanup = await this.getSessionCleanupService()
      return await sessionCleanup.runCleanup()
    } catch (error) {
      console.error('Error during manual session cleanup:', error)
      throw error
    }
  }

  /**
   * Get session cleanup statistics
   */
  async getCleanupStats() {
    const sessionCleanup = await this.getSessionCleanupService()
    return sessionCleanup.getStats()
  }

  /**
   * Update session cleanup configuration
   */
  async updateCleanupConfig(config: {
    intervalMinutes?: number
    maxSessionAge?: number
    batchSize?: number
  }) {
    const sessionCleanup = await this.getSessionCleanupService()
    sessionCleanup.updateConfig(config)
  }

  /**
   * Create default admin user if none exists
   */
  async createDefaultAdminUser(): Promise<AuthUser | null> {
    try {
      const authRepository = await this.getAuthRepository()

      // Check if any users exist
      const existingUsers = await authRepository.findAllUsers({ limit: 1 })

      if (existingUsers.length > 0) {
        console.log('Admin user already exists, skipping creation')
        return null
      }

      // Create default admin user
      const adminData: CreateAuthUserData = {
        username: 'admin',
        password_hash: 'default_hash_change_me', // TODO: Use proper password hashing
        display_name: 'Administrator',
        active: true,
        must_change_password: true
      }

      const adminUser = await authRepository.createUser(adminData)
      console.log('Default admin user created successfully')

      return adminUser
    } catch (error) {
      console.error('Error creating default admin user:', error)
      throw error
    }
  }

  // ========== PRIVATE HELPER METHODS ==========

  /**
   * Generate a secure session token
   */
  private generateSessionToken(): string {
    // Generate a secure random token
    const timestamp = Date.now().toString(36)
    const randomPart = Math.random().toString(36).substring(2, 15)
    const randomPart2 = Math.random().toString(36).substring(2, 15)

    return `session_${timestamp}_${randomPart}_${randomPart2}`
  }
}
