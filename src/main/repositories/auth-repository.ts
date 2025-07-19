import Database from 'better-sqlite3'
import {
  AuthUser,
  AuthSession,
  CreateAuthUserData,
  CreateSessionData,
  QueryOptions,
  DatabaseError
} from '../types'

export interface AuthUserSearchOptions extends QueryOptions {
  searchTerm?: string
  activeOnly?: boolean
  lockedOnly?: boolean
}

export interface SessionCleanupResult {
  deletedSessions: number
  totalSessions: number
}

export class AuthRepository {
  private db: Database.Database

  constructor(database: Database.Database) {
    this.db = database
  }

  // ========== AUTH USER MANAGEMENT ==========

  /**
   * Find authentication user by username
   */
  async findUserByUsername(username: string): Promise<AuthUser | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT id, username, password_hash, display_name, active, 
               must_change_password, last_login, failed_attempts, 
               locked_until, created_at, updated_at
        FROM auth_users 
        WHERE username = ?
      `)
      const result = stmt.get(username) as any

      if (!result) {
        return null
      }

      return this.mapRowToAuthUser(result)
    } catch (error) {
      throw new DatabaseError(
        `Failed to find user by username: ${username}`,
        'FIND_USER_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Find authentication user by ID
   */
  async findUserById(id: string): Promise<AuthUser | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT id, username, password_hash, display_name, active, 
               must_change_password, last_login, failed_attempts, 
               locked_until, created_at, updated_at
        FROM auth_users 
        WHERE id = ?
      `)
      const result = stmt.get(id) as any

      if (!result) {
        return null
      }

      return this.mapRowToAuthUser(result)
    } catch (error) {
      throw new DatabaseError(
        `Failed to find user by ID: ${id}`,
        'FIND_USER_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Create a new authentication user
   */
  async createUser(userData: CreateAuthUserData): Promise<AuthUser> {
    try {
      // Validate required fields
      this.validateAuthUserData(userData)

      // Check for duplicate username
      const existingUser = await this.findUserByUsername(userData.username)
      if (existingUser) {
        throw new DatabaseError(
          `User with username ${userData.username} already exists`,
          'DUPLICATE_USERNAME'
        )
      }

      // Generate new ID
      const id = this.generateAuthUserId()

      // Insert user with transaction for consistency
      const insertStmt = this.db.prepare(`
        INSERT INTO auth_users (
          id, username, password_hash, display_name, active, 
          must_change_password, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `)

      const transaction = this.db.transaction(() => {
        insertStmt.run(
          id,
          userData.username,
          userData.password_hash,
          userData.display_name,
          (userData.active ?? true) ? 1 : 0,
          (userData.must_change_password ?? false) ? 1 : 0
        )
      })

      transaction()

      // Return the created user
      const createdUser = await this.findUserById(id)
      if (!createdUser) {
        throw new DatabaseError('Failed to retrieve created user', 'CREATE_ERROR')
      }

      return createdUser
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error
      }
      throw new DatabaseError(
        'Failed to create authentication user',
        'CREATE_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Update an existing authentication user
   */
  async updateUser(id: string, userData: Partial<AuthUser>): Promise<AuthUser> {
    try {
      // Check if user exists
      const existingUser = await this.findUserById(id)
      if (!existingUser) {
        throw new DatabaseError(`User with ID ${id} not found`, 'USER_NOT_FOUND')
      }

      // Check for duplicate username if username is being updated
      if (userData.username && userData.username !== existingUser.username) {
        const duplicateUser = await this.findUserByUsername(userData.username)
        if (duplicateUser && duplicateUser.id !== id) {
          throw new DatabaseError(
            `User with username ${userData.username} already exists`,
            'DUPLICATE_USERNAME'
          )
        }
      }

      // Build dynamic update query
      const updateFields: string[] = []
      const params: unknown[] = []

      if (userData.username !== undefined) {
        updateFields.push('username = ?')
        params.push(userData.username)
      }
      if (userData.password_hash !== undefined) {
        updateFields.push('password_hash = ?')
        params.push(userData.password_hash)
      }
      if (userData.display_name !== undefined) {
        updateFields.push('display_name = ?')
        params.push(userData.display_name)
      }
      if (userData.active !== undefined) {
        updateFields.push('active = ?')
        params.push(userData.active ? 1 : 0)
      }
      if (userData.must_change_password !== undefined) {
        updateFields.push('must_change_password = ?')
        params.push(userData.must_change_password ? 1 : 0)
      }
      if (userData.failed_attempts !== undefined) {
        updateFields.push('failed_attempts = ?')
        params.push(userData.failed_attempts)
      }
      if (userData.locked_until !== undefined) {
        updateFields.push('locked_until = ?')
        params.push(userData.locked_until ? userData.locked_until.toISOString() : null)
      }

      if (updateFields.length === 0) {
        // No fields to update, return existing user
        return existingUser
      }

      updateFields.push("updated_at = datetime('now')")
      params.push(id)

      const updateQuery = `
        UPDATE auth_users 
        SET ${updateFields.join(', ')} 
        WHERE id = ?
      `

      const updateStmt = this.db.prepare(updateQuery)
      const transaction = this.db.transaction(() => {
        updateStmt.run(...params)
      })

      transaction()

      // Return updated user
      const updatedUser = await this.findUserById(id)
      if (!updatedUser) {
        throw new DatabaseError('Failed to retrieve updated user', 'UPDATE_ERROR')
      }

      return updatedUser
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error
      }
      throw new DatabaseError(
        `Failed to update user ${id}`,
        'UPDATE_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin(id: string): Promise<void> {
    try {
      const updateStmt = this.db.prepare(`
        UPDATE auth_users 
        SET last_login = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `)

      const transaction = this.db.transaction(() => {
        const result = updateStmt.run(id)
        if (result.changes === 0) {
          throw new DatabaseError(`User with ID ${id} not found`, 'USER_NOT_FOUND')
        }
      })

      transaction()
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error
      }
      throw new DatabaseError(
        `Failed to update last login for user ${id}`,
        'UPDATE_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Increment failed login attempts
   */
  async incrementFailedAttempts(id: string): Promise<void> {
    try {
      const updateStmt = this.db.prepare(`
        UPDATE auth_users 
        SET failed_attempts = failed_attempts + 1, updated_at = datetime('now')
        WHERE id = ?
      `)

      const transaction = this.db.transaction(() => {
        const result = updateStmt.run(id)
        if (result.changes === 0) {
          throw new DatabaseError(`User with ID ${id} not found`, 'USER_NOT_FOUND')
        }
      })

      transaction()
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error
      }
      throw new DatabaseError(
        `Failed to increment failed attempts for user ${id}`,
        'UPDATE_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Reset failed login attempts
   */
  async resetFailedAttempts(id: string): Promise<void> {
    try {
      const updateStmt = this.db.prepare(`
        UPDATE auth_users 
        SET failed_attempts = 0, locked_until = NULL, updated_at = datetime('now')
        WHERE id = ?
      `)

      const transaction = this.db.transaction(() => {
        const result = updateStmt.run(id)
        if (result.changes === 0) {
          throw new DatabaseError(`User with ID ${id} not found`, 'USER_NOT_FOUND')
        }
      })

      transaction()
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error
      }
      throw new DatabaseError(
        `Failed to reset failed attempts for user ${id}`,
        'UPDATE_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Lock user until specified date
   */
  async lockUser(id: string, until: Date): Promise<void> {
    try {
      const updateStmt = this.db.prepare(`
        UPDATE auth_users 
        SET locked_until = ?, updated_at = datetime('now')
        WHERE id = ?
      `)

      const transaction = this.db.transaction(() => {
        const result = updateStmt.run(until.toISOString(), id)
        if (result.changes === 0) {
          throw new DatabaseError(`User with ID ${id} not found`, 'USER_NOT_FOUND')
        }
      })

      transaction()
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error
      }
      throw new DatabaseError(
        `Failed to lock user ${id}`,
        'UPDATE_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Check if user is currently locked
   */
  async isUserLocked(id: string): Promise<boolean> {
    try {
      const stmt = this.db.prepare(`
        SELECT locked_until 
        FROM auth_users 
        WHERE id = ? AND locked_until > datetime('now')
      `)
      const result = stmt.get(id)
      return result !== undefined
    } catch (error) {
      throw new DatabaseError(
        `Failed to check lock status for user ${id}`,
        'LOCK_CHECK_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  // ========== SESSION MANAGEMENT ==========

  /**
   * Create a new session
   */
  async createSession(sessionData: CreateSessionData): Promise<AuthSession> {
    try {
      // Validate session data
      this.validateSessionData(sessionData)

      // Generate session ID
      const id = this.generateSessionId()

      // Insert session with transaction
      const insertStmt = this.db.prepare(`
        INSERT INTO auth_sessions (id, user_id, token, expires_at, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `)

      const transaction = this.db.transaction(() => {
        insertStmt.run(
          id,
          sessionData.user_id,
          sessionData.token,
          sessionData.expires_at.toISOString()
        )
      })

      transaction()

      // Return the created session
      const createdSession = await this.findSessionById(id)
      if (!createdSession) {
        throw new DatabaseError('Failed to retrieve created session', 'CREATE_ERROR')
      }

      return createdSession
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error
      }
      throw new DatabaseError(
        'Failed to create session',
        'CREATE_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Find session by token
   */
  async findSessionByToken(token: string): Promise<AuthSession | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT id, user_id, token, expires_at, created_at
        FROM auth_sessions 
        WHERE token = ? AND expires_at > datetime('now')
      `)
      const result = stmt.get(token) as any

      if (!result) {
        return null
      }

      return this.mapRowToAuthSession(result)
    } catch (error) {
      throw new DatabaseError(
        `Failed to find session by token`,
        'FIND_SESSION_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Find session by ID
   */
  async findSessionById(id: string): Promise<AuthSession | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT id, user_id, token, expires_at, created_at
        FROM auth_sessions 
        WHERE id = ?
      `)
      const result = stmt.get(id) as any

      if (!result) {
        return null
      }

      return this.mapRowToAuthSession(result)
    } catch (error) {
      throw new DatabaseError(
        `Failed to find session by ID: ${id}`,
        'FIND_SESSION_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Delete session by token
   */
  async deleteSession(token: string): Promise<void> {
    try {
      const deleteStmt = this.db.prepare('DELETE FROM auth_sessions WHERE token = ?')
      const transaction = this.db.transaction(() => {
        deleteStmt.run(token)
      })

      transaction()
    } catch (error) {
      throw new DatabaseError(
        `Failed to delete session`,
        'DELETE_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Delete all sessions for a user
   */
  async deleteUserSessions(userId: string): Promise<void> {
    try {
      const deleteStmt = this.db.prepare('DELETE FROM auth_sessions WHERE user_id = ?')
      const transaction = this.db.transaction(() => {
        deleteStmt.run(userId)
      })

      transaction()
    } catch (error) {
      throw new DatabaseError(
        `Failed to delete user sessions for user ${userId}`,
        'DELETE_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Delete expired sessions (cleanup)
   */
  async deleteExpiredSessions(): Promise<SessionCleanupResult> {
    try {
      // First count total sessions
      const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM auth_sessions')
      const totalResult = totalStmt.get() as { count: number }

      // Delete expired sessions
      const deleteStmt = this.db.prepare(`
        DELETE FROM auth_sessions 
        WHERE expires_at <= datetime('now')
      `)

      let deletedCount = 0
      const transaction = this.db.transaction(() => {
        const result = deleteStmt.run()
        deletedCount = result.changes
      })

      transaction()

      return {
        deletedSessions: deletedCount,
        totalSessions: totalResult.count
      }
    } catch (error) {
      throw new DatabaseError(
        'Failed to delete expired sessions',
        'CLEANUP_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Get active sessions for a user
   */
  async getUserActiveSessions(userId: string): Promise<AuthSession[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT id, user_id, token, expires_at, created_at
        FROM auth_sessions 
        WHERE user_id = ? AND expires_at > datetime('now')
        ORDER BY created_at DESC
      `)
      const results = stmt.all(userId) as any[]

      return results.map((row) => this.mapRowToAuthSession(row))
    } catch (error) {
      throw new DatabaseError(
        `Failed to get active sessions for user ${userId}`,
        'FIND_SESSION_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  // ========== UTILITY METHODS ==========

  /**
   * Get authentication statistics
   */
  async getAuthStats() {
    try {
      const userStats = this.db
        .prepare(
          `
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN active = 1 THEN 1 END) as active_users,
          COUNT(CASE WHEN locked_until > datetime('now') THEN 1 END) as locked_users
        FROM auth_users
      `
        )
        .get() as {
        total_users: number
        active_users: number
        locked_users: number
      }

      const sessionStats = this.db
        .prepare(
          `
        SELECT 
          COUNT(*) as total_sessions,
          COUNT(CASE WHEN expires_at > datetime('now') THEN 1 END) as active_sessions
        FROM auth_sessions
      `
        )
        .get() as {
        total_sessions: number
        active_sessions: number
      }

      return {
        users: {
          total: userStats.total_users,
          active: userStats.active_users,
          locked: userStats.locked_users
        },
        sessions: {
          total: sessionStats.total_sessions,
          active: sessionStats.active_sessions
        }
      }
    } catch (error) {
      throw new DatabaseError(
        'Failed to get authentication stats',
        'STATS_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Find all authentication users with filtering
   */
  async findAllUsers(options: AuthUserSearchOptions = {}): Promise<AuthUser[]> {
    try {
      const {
        limit,
        offset = 0,
        orderBy = 'username',
        orderDirection = 'ASC',
        searchTerm,
        activeOnly,
        lockedOnly
      } = options

      let query = `
        SELECT id, username, password_hash, display_name, active, 
               must_change_password, last_login, failed_attempts, 
               locked_until, created_at, updated_at
        FROM auth_users WHERE 1=1
      `
      const params: unknown[] = []

      // Apply filters
      if (activeOnly) {
        query += ' AND active = 1'
      }

      if (lockedOnly) {
        query += " AND locked_until > datetime('now')"
      }

      if (searchTerm && searchTerm.trim()) {
        query += ' AND (username LIKE ? OR display_name LIKE ?)'
        const searchPattern = `%${searchTerm.trim()}%`
        params.push(searchPattern, searchPattern)
      }

      // Apply ordering
      const validOrderFields = ['username', 'display_name', 'created_at', 'last_login']
      const safeOrderBy = validOrderFields.includes(orderBy) ? orderBy : 'username'
      const safeDirection = orderDirection === 'DESC' ? 'DESC' : 'ASC'
      query += ` ORDER BY ${safeOrderBy} ${safeDirection}`

      // Apply pagination
      if (limit && limit > 0) {
        query += ' LIMIT ?'
        params.push(limit)

        if (offset > 0) {
          query += ' OFFSET ?'
          params.push(offset)
        }
      }

      const stmt = this.db.prepare(query)
      const results = stmt.all(...params) as any[]

      return results.map((row) => this.mapRowToAuthUser(row))
    } catch (error) {
      throw new DatabaseError(
        'Failed to fetch authentication users',
        'FETCH_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  // ========== PRIVATE HELPER METHODS ==========

  private validateAuthUserData(userData: CreateAuthUserData): void {
    if (
      !userData.username ||
      typeof userData.username !== 'string' ||
      userData.username.trim() === ''
    ) {
      throw new DatabaseError(
        'Username is required and must be a non-empty string',
        'VALIDATION_ERROR'
      )
    }

    if (!userData.password_hash || typeof userData.password_hash !== 'string') {
      throw new DatabaseError('Password hash is required', 'VALIDATION_ERROR')
    }

    if (
      !userData.display_name ||
      typeof userData.display_name !== 'string' ||
      userData.display_name.trim() === ''
    ) {
      throw new DatabaseError(
        'Display name is required and must be a non-empty string',
        'VALIDATION_ERROR'
      )
    }
  }

  private validateSessionData(sessionData: CreateSessionData): void {
    if (!sessionData.user_id || typeof sessionData.user_id !== 'string') {
      throw new DatabaseError('User ID is required', 'VALIDATION_ERROR')
    }

    if (!sessionData.token || typeof sessionData.token !== 'string') {
      throw new DatabaseError('Token is required', 'VALIDATION_ERROR')
    }

    if (!(sessionData.expires_at instanceof Date) || sessionData.expires_at <= new Date()) {
      throw new DatabaseError('Expires at must be a future date', 'VALIDATION_ERROR')
    }
  }

  private mapRowToAuthUser(row: any): AuthUser {
    return {
      id: row.id,
      username: row.username,
      password_hash: row.password_hash,
      display_name: row.display_name,
      active: Boolean(row.active),
      must_change_password: Boolean(row.must_change_password),
      last_login: row.last_login ? new Date(row.last_login) : null,
      failed_attempts: row.failed_attempts,
      locked_until: row.locked_until ? new Date(row.locked_until) : null,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at)
    }
  }

  private mapRowToAuthSession(row: any): AuthSession {
    return {
      id: row.id,
      user_id: row.user_id,
      token: row.token,
      expires_at: new Date(row.expires_at),
      created_at: new Date(row.created_at)
    }
  }

  private generateAuthUserId(): string {
    return `auth-user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}
