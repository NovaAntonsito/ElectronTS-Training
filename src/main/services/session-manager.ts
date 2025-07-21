import { v4 as uuidv4 } from 'uuid'
import type { AuthSession } from '../../types/auth'

/**
 * Internal session data structure for the SessionManager
 */
interface SessionData {
  userId: string
  token: string
  createdAt: string
  expiresAt: string
}

/**
 * Session validation result
 */
interface SessionValidationResult {
  valid: boolean
  userId?: string
  session?: AuthSession
}

/**
 * SessionManager handles in-memory session management
 * Sessions are stored in memory and cleared when the application closes
 */
export class SessionManager {
  private activeSessions: Map<string, SessionData> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    // Start periodic cleanup of expired sessions
    this.startCleanup()
  }

  /**
   * Create a new session for a user
   */
  async createSession(userId: string): Promise<AuthSession> {
    const token = this.generateSecureToken()
    const createdAt = new Date().toISOString()
    // Sessions last for the duration of the application (no expiration for desktop app)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours as fallback

    const sessionData: SessionData = {
      userId,
      token,
      createdAt,
      expiresAt
    }

    this.activeSessions.set(token, sessionData)

    return {
      userId,
      token,
      createdAt,
      expiresAt
    }
  }

  /**
   * Validate a session token
   */
  async validateSession(token: string): Promise<SessionValidationResult> {
    const sessionData = this.activeSessions.get(token)
    
    if (!sessionData) {
      return { valid: false }
    }

    // Check if session has expired
    const now = new Date()
    const expiresAt = new Date(sessionData.expiresAt)
    
    if (now > expiresAt) {
      // Remove expired session
      this.activeSessions.delete(token)
      return { valid: false }
    }

    return {
      valid: true,
      userId: sessionData.userId,
      session: {
        userId: sessionData.userId,
        token: sessionData.token,
        createdAt: sessionData.createdAt,
        expiresAt: sessionData.expiresAt
      }
    }
  }

  /**
   * Destroy a session (logout)
   */
  async destroySession(token: string): Promise<void> {
    this.activeSessions.delete(token)
  }

  /**
   * Destroy all sessions for a specific user
   */
  async destroyUserSessions(userId: string): Promise<void> {
    for (const [token, sessionData] of this.activeSessions.entries()) {
      if (sessionData.userId === userId) {
        this.activeSessions.delete(token)
      }
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserActiveSessions(userId: string): Promise<AuthSession[]> {
    const userSessions: AuthSession[] = []
    
    for (const sessionData of this.activeSessions.values()) {
      if (sessionData.userId === userId) {
        // Check if session is still valid
        const now = new Date()
        const expiresAt = new Date(sessionData.expiresAt)
        
        if (now <= expiresAt) {
          userSessions.push({
            userId: sessionData.userId,
            token: sessionData.token,
            createdAt: sessionData.createdAt,
            expiresAt: sessionData.expiresAt
          })
        }
      }
    }
    
    return userSessions
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(): number {
    const now = new Date()
    let cleanedCount = 0
    
    for (const [token, sessionData] of this.activeSessions.entries()) {
      const expiresAt = new Date(sessionData.expiresAt)
      if (now > expiresAt) {
        this.activeSessions.delete(token)
        cleanedCount++
      }
    }
    
    return cleanedCount
  }

  /**
   * Get session statistics
   */
  getSessionStats() {
    return {
      totalActiveSessions: this.activeSessions.size,
      sessionsByUser: this.getSessionCountByUser()
    }
  }

  /**
   * Destroy all sessions (application shutdown)
   */
  destroyAllSessions(): void {
    this.activeSessions.clear()
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  /**
   * Generate a secure session token
   */
  private generateSecureToken(): string {
    return `session_${uuidv4()}_${Date.now()}`
  }

  /**
   * Start periodic cleanup of expired sessions
   */
  private startCleanup(): void {
    // Clean up expired sessions every 15 minutes
    this.cleanupInterval = setInterval(() => {
      const cleaned = this.cleanupExpiredSessions()
      if (cleaned > 0) {
        console.log(`Cleaned up ${cleaned} expired sessions`)
      }
    }, 15 * 60 * 1000)
  }

  /**
   * Get session count by user
   */
  private getSessionCountByUser(): Record<string, number> {
    const counts: Record<string, number> = {}
    
    for (const sessionData of this.activeSessions.values()) {
      counts[sessionData.userId] = (counts[sessionData.userId] || 0) + 1
    }
    
    return counts
  }
}