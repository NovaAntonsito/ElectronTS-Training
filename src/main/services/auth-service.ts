import * as bcrypt from 'bcrypt'
import { v4 as uuidv4 } from 'uuid'
import type {
  LoginCredentials,
  AuthUser,
  AuthSession,
  AuthLoginResponse,
  AuthVerifyResponse
} from '../../types/auth'
import { DEFAULT_SECURITY_CONFIG } from '../../types/auth'
import { SessionManager } from './session-manager'
import { CredentialStore } from './credential-store'

/**
 * Authentication service that provides secure authentication operations
 * with bcrypt password hashing and session management
 */
export class AuthService {
  private sessionManager: SessionManager
  private credentialStore: CredentialStore
  private readonly securityConfig = DEFAULT_SECURITY_CONFIG

  constructor() {
    this.sessionManager = new SessionManager()
    this.credentialStore = new CredentialStore()
  }

  /**
   * Initialize the authentication service
   */
  async initialize(): Promise<void> {
    try {
      await this.credentialStore.initialize()
      console.log('Auth service initialized successfully')
    } catch (error) {
      console.error('Failed to initialize auth service:', error)
      throw error
    }
  }

  /**
   * Start the authentication service (alias for initialize)
   */
  async start(): Promise<void> {
    await this.initialize()
  }

  /**
   * Stop the authentication service
   */
  async stop(): Promise<void> {
    this.sessionManager.destroyAllSessions()
    console.log('Auth service stopped successfully')
  }

  /**
   * Authenticate user with username and password
   */
  async authenticateUser(username: string, password: string): Promise<AuthLoginResponse> {
    return this.validateCredentials({ username, password })
  }

  /**
   * Validate user credentials and return authentication response
   */
  async validateCredentials(credentials: LoginCredentials): Promise<AuthLoginResponse> {
    try {
      // Input validation
      if (!credentials.username || credentials.username.length < 3) {
        return {
          success: false,
          error: 'El nombre de usuario debe tener al menos 3 caracteres'
        }
      }

      if (!credentials.password || credentials.password.length < this.securityConfig.passwordMinLength) {
        return {
          success: false,
          error: `La contraseña debe tener al menos ${this.securityConfig.passwordMinLength} caracteres`
        }
      }

      // Find user by username
      const user = await this.credentialStore.findUserByUsername(credentials.username)
      if (!user) {
        return {
          success: false,
          error: 'Usuario o contraseña incorrectos'
        }
      }

      // Check if user is active
      if (!user.active) {
        return {
          success: false,
          error: 'Cuenta desactivada. Contacte al administrador'
        }
      }

      // Check if user is locked
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        return {
          success: false,
          error: 'Cuenta bloqueada temporalmente. Intente más tarde'
        }
      }

      // Validate password
      const isValidPassword = await this.comparePassword(credentials.password, user.passwordHash)
      if (!isValidPassword) {
        // Increment failed attempts
        await this.credentialStore.incrementFailedAttempts(user.id)
        
        // Check if user should be locked
        const updatedUser = await this.credentialStore.findUserById(user.id)
        if (updatedUser && updatedUser.failedAttempts >= this.securityConfig.maxLoginAttempts) {
          const lockUntil = new Date(Date.now() + this.securityConfig.lockoutDuration)
          await this.credentialStore.lockUser(user.id, lockUntil)
          return {
            success: false,
            error: 'Demasiados intentos fallidos. Cuenta bloqueada temporalmente'
          }
        }

        return {
          success: false,
          error: 'Usuario o contraseña incorrectos'
        }
      }

      // Successful authentication - reset failed attempts and update last login
      await this.credentialStore.resetFailedAttempts(user.id)
      await this.credentialStore.updateLastLogin(user.id)

      // Create session
      const session = await this.sessionManager.createSession(user.id)

      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          lastLogin: new Date().toISOString(),
          mustChangePassword: user.mustChangePassword
        },
        session: {
          userId: session.userId,
          token: session.token,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt
        }
      }
    } catch (error) {
      console.error('Error validating credentials:', error)
      return {
        success: false,
        error: 'Error interno del servidor'
      }
    }
  }

  /**
   * Validate session token and return user information
   */
  async validateSession(token: string): Promise<AuthVerifyResponse> {
    try {
      const session = await this.sessionManager.validateSession(token)
      if (!session.valid) {
        return {
          valid: false,
          error: 'Sesión inválida o expirada'
        }
      }

      const user = await this.credentialStore.findUserById(session.userId!)
      if (!user || !user.active) {
        await this.sessionManager.destroySession(token)
        return {
          valid: false,
          error: 'Usuario no encontrado o inactivo'
        }
      }

      return {
        valid: true,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          lastLogin: user.lastLogin?.toISOString() || '',
          mustChangePassword: user.mustChangePassword
        }
      }
    } catch (error) {
      console.error('Error validating session:', error)
      return {
        valid: false,
        error: 'Error interno del servidor'
      }
    }
  }

  /**
   * Create a new session for authenticated user
   */
  async createSession(userId: string): Promise<AuthSession> {
    return await this.sessionManager.createSession(userId)
  }

  /**
   * Destroy session (logout)
   */
  async destroySession(token: string): Promise<void> {
    await this.sessionManager.destroySession(token)
  }

  /**
   * Delete session (alias for destroySession)
   */
  async deleteSession(token: string): Promise<void> {
    await this.destroySession(token)
  }

  /**
   * Check if default admin user exists
   */
  async checkDefaultAdmin(): Promise<boolean> {
    try {
      const adminUser = await this.credentialStore.findUserByUsername('admin')
      return adminUser !== null
    } catch (error) {
      console.error('Error checking default admin:', error)
      return false
    }
  }

  /**
   * Create default admin user
   */
  async createDefaultAdmin(): Promise<AuthUser> {
    try {
      const hashedPassword = await this.hashPassword('admin123')
      
      const adminData = {
        id: uuidv4(),
        username: 'admin',
        passwordHash: hashedPassword,
        displayName: 'Administrador',
        active: true,
        mustChangePassword: true,
        lastLogin: null,
        failedAttempts: 0,
        lockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      await this.credentialStore.createUser(adminData)
      
      return {
        id: adminData.id,
        username: adminData.username,
        displayName: adminData.displayName,
        lastLogin: '',
        mustChangePassword: adminData.mustChangePassword
      }
    } catch (error) {
      console.error('Error creating default admin:', error)
      throw error
    }
  }

  /**
   * Hash password using bcrypt
   */
  private async hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, this.securityConfig.bcryptRounds)
  }

  /**
   * Compare password with hash using bcrypt
   */
  private async comparePassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash)
  }

  /**
   * Get authentication statistics
   */
  async getAuthStats() {
    try {
      const sessionStats = this.sessionManager.getSessionStats()
      const allUsers = await this.credentialStore.getAllUsers()
      
      return {
        totalUsers: allUsers.length,
        activeUsers: allUsers.filter(u => u.active).length,
        lockedUsers: allUsers.filter(u => u.lockedUntil && u.lockedUntil > new Date()).length,
        ...sessionStats
      }
    } catch (error) {
      console.error('Error getting auth stats:', error)
      throw error
    }
  }
}

// Create and export singleton instance
export const authService = new AuthService()