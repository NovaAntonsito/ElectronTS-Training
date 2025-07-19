import Database from 'better-sqlite3'
import { User, QueryOptions, DatabaseError } from '../types'

export interface UserSearchOptions extends QueryOptions {
  searchTerm?: string
  searchFields?: ('nombre' | 'dni')[]
  ageRange?: {
    min?: number
    max?: number
  }
}

export interface UserCountResult {
  total: number
  filtered?: number
}

export class UserRepository {
  private db: Database.Database

  constructor(database: Database.Database) {
    this.db = database
  }

  /**
   * Find all users with optional pagination and filtering
   */
  async findAll(options: UserSearchOptions = {}): Promise<User[]> {
    try {
      const {
        limit,
        offset = 0,
        orderBy = 'nombre',
        orderDirection = 'ASC',
        filters,
        searchTerm,
        searchFields = ['nombre'],
        ageRange
      } = options

      let query = 'SELECT id, nombre, edad, dni FROM users WHERE 1=1'
      const params: unknown[] = []

      // Apply filters
      if (filters) {
        for (const [field, value] of Object.entries(filters)) {
          if (value !== undefined && value !== null) {
            query += ` AND ${field} = ?`
            params.push(value)
          }
        }
      }

      // Apply search term
      if (searchTerm && searchTerm.trim()) {
        const searchConditions: string[] = []

        if (searchFields.includes('nombre')) {
          searchConditions.push('nombre LIKE ?')
          params.push(`%${searchTerm.trim()}%`)
        }

        if (searchFields.includes('dni')) {
          // Check if search term is numeric for DNI search
          const numericSearch = parseInt(searchTerm.trim())
          if (!isNaN(numericSearch)) {
            searchConditions.push('dni = ?')
            params.push(numericSearch)
          }
        }

        if (searchConditions.length > 0) {
          query += ` AND (${searchConditions.join(' OR ')})`
        }
      }

      // Apply age range filter
      if (ageRange) {
        if (ageRange.min !== undefined) {
          query += ' AND edad >= ?'
          params.push(ageRange.min)
        }
        if (ageRange.max !== undefined) {
          query += ' AND edad <= ?'
          params.push(ageRange.max)
        }
      }

      // Apply ordering
      const validOrderFields = ['id', 'nombre', 'edad', 'dni', 'created_at', 'updated_at']
      const safeOrderBy = validOrderFields.includes(orderBy) ? orderBy : 'nombre'
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
      const results = stmt.all(...params) as User[]

      return results
    } catch (error) {
      throw new DatabaseError(
        'Failed to fetch users',
        'FETCH_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    try {
      const stmt = this.db.prepare('SELECT id, nombre, edad, dni FROM users WHERE id = ?')
      const result = stmt.get(id) as User | undefined

      return result || null
    } catch (error) {
      throw new DatabaseError(
        `Failed to find user by ID: ${id}`,
        'FIND_BY_ID_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Find user by DNI with optimized index search
   */
  async findByDni(dni: number): Promise<User | null> {
    try {
      // This query will use the idx_users_dni index for fast lookup
      const stmt = this.db.prepare('SELECT id, nombre, edad, dni FROM users WHERE dni = ?')
      const result = stmt.get(dni) as User | undefined

      return result || null
    } catch (error) {
      throw new DatabaseError(
        `Failed to find user by DNI: ${dni}`,
        'FIND_BY_DNI_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Create a new user
   */
  async create(userData: Omit<User, 'id'>): Promise<User> {
    try {
      // Validate required fields
      this.validateUserData(userData)

      // Check for duplicate DNI
      const existingUser = await this.findByDni(userData.dni)
      if (existingUser) {
        throw new DatabaseError(`User with DNI ${userData.dni} already exists`, 'DUPLICATE_DNI')
      }

      // Generate new ID
      const id = this.generateUserId()

      // Insert user with transaction for consistency
      const insertStmt = this.db.prepare(`
        INSERT INTO users (id, nombre, edad, dni, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `)

      const transaction = this.db.transaction(() => {
        insertStmt.run(id, userData.nombre, userData.edad, userData.dni)
      })

      transaction()

      // Return the created user
      const createdUser = await this.findById(id)
      if (!createdUser) {
        throw new DatabaseError('Failed to retrieve created user', 'CREATE_ERROR')
      }

      return createdUser
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error
      }
      throw new DatabaseError(
        'Failed to create user',
        'CREATE_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Update an existing user
   */
  async update(id: string, userData: Partial<Omit<User, 'id'>>): Promise<User> {
    try {
      // Check if user exists
      const existingUser = await this.findById(id)
      if (!existingUser) {
        throw new DatabaseError(`User with ID ${id} not found`, 'USER_NOT_FOUND')
      }

      // Validate updated data
      const updatedData = { ...existingUser, ...userData }
      this.validateUserData(updatedData)

      // Check for duplicate DNI if DNI is being updated
      if (userData.dni && userData.dni !== existingUser.dni) {
        const duplicateUser = await this.findByDni(userData.dni)
        if (duplicateUser && duplicateUser.id !== id) {
          throw new DatabaseError(`User with DNI ${userData.dni} already exists`, 'DUPLICATE_DNI')
        }
      }

      // Build dynamic update query
      const updateFields: string[] = []
      const params: unknown[] = []

      if (userData.nombre !== undefined) {
        updateFields.push('nombre = ?')
        params.push(userData.nombre)
      }
      if (userData.edad !== undefined) {
        updateFields.push('edad = ?')
        params.push(userData.edad)
      }
      if (userData.dni !== undefined) {
        updateFields.push('dni = ?')
        params.push(userData.dni)
      }

      if (updateFields.length === 0) {
        // No fields to update, return existing user
        return existingUser
      }

      updateFields.push("updated_at = datetime('now')")
      params.push(id)

      const updateQuery = `
        UPDATE users 
        SET ${updateFields.join(', ')} 
        WHERE id = ?
      `

      const updateStmt = this.db.prepare(updateQuery)
      const transaction = this.db.transaction(() => {
        updateStmt.run(...params)
      })

      transaction()

      // Return updated user
      const updatedUser = await this.findById(id)
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
   * Delete a user by ID
   */
  async delete(id: string): Promise<void> {
    try {
      // Check if user exists
      const existingUser = await this.findById(id)
      if (!existingUser) {
        throw new DatabaseError(`User with ID ${id} not found`, 'USER_NOT_FOUND')
      }

      const deleteStmt = this.db.prepare('DELETE FROM users WHERE id = ?')
      const transaction = this.db.transaction(() => {
        const result = deleteStmt.run(id)
        if (result.changes === 0) {
          throw new DatabaseError('No user was deleted', 'DELETE_ERROR')
        }
      })

      transaction()
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error
      }
      throw new DatabaseError(
        `Failed to delete user ${id}`,
        'DELETE_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Count users with optional filtering
   */
  async count(options: UserSearchOptions = {}): Promise<UserCountResult> {
    try {
      const { filters, searchTerm, searchFields = ['nombre'], ageRange } = options

      // Total count
      const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM users')
      const totalResult = totalStmt.get() as { count: number }

      // Filtered count if filters are applied
      let filteredCount: number | undefined

      if (filters || searchTerm || ageRange) {
        let query = 'SELECT COUNT(*) as count FROM users WHERE 1=1'
        const params: unknown[] = []

        // Apply same filters as findAll
        if (filters) {
          for (const [field, value] of Object.entries(filters)) {
            if (value !== undefined && value !== null) {
              query += ` AND ${field} = ?`
              params.push(value)
            }
          }
        }

        if (searchTerm && searchTerm.trim()) {
          const searchConditions: string[] = []

          if (searchFields.includes('nombre')) {
            searchConditions.push('nombre LIKE ?')
            params.push(`%${searchTerm.trim()}%`)
          }

          if (searchFields.includes('dni')) {
            const numericSearch = parseInt(searchTerm.trim())
            if (!isNaN(numericSearch)) {
              searchConditions.push('dni = ?')
              params.push(numericSearch)
            }
          }

          if (searchConditions.length > 0) {
            query += ` AND (${searchConditions.join(' OR ')})`
          }
        }

        if (ageRange) {
          if (ageRange.min !== undefined) {
            query += ' AND edad >= ?'
            params.push(ageRange.min)
          }
          if (ageRange.max !== undefined) {
            query += ' AND edad <= ?'
            params.push(ageRange.max)
          }
        }

        const filteredStmt = this.db.prepare(query)
        const filteredResult = filteredStmt.get(...params) as { count: number }
        filteredCount = filteredResult.count
      }

      return {
        total: totalResult.count,
        filtered: filteredCount
      }
    } catch (error) {
      throw new DatabaseError(
        'Failed to count users',
        'COUNT_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Search users with advanced text search
   */
  async search(query: string, options: UserSearchOptions = {}): Promise<User[]> {
    if (!query || !query.trim()) {
      return this.findAll(options)
    }

    const searchOptions: UserSearchOptions = {
      ...options,
      searchTerm: query,
      searchFields: options.searchFields || ['nombre', 'dni']
    }

    return this.findAll(searchOptions)
  }

  /**
   * Get users with pagination info
   */
  async findWithPagination(options: UserSearchOptions = {}) {
    const { limit = 10, offset = 0 } = options

    const [users, countResult] = await Promise.all([this.findAll(options), this.count(options)])

    const total = countResult.filtered ?? countResult.total
    const hasMore = offset + limit < total
    const totalPages = Math.ceil(total / limit)
    const currentPage = Math.floor(offset / limit) + 1

    return {
      users,
      pagination: {
        total,
        limit,
        offset,
        hasMore,
        totalPages,
        currentPage
      }
    }
  }

  /**
   * Bulk operations for efficiency
   */
  async bulkCreate(usersData: Omit<User, 'id'>[]): Promise<User[]> {
    if (usersData.length === 0) {
      return []
    }

    try {
      // Validate all users first
      for (const userData of usersData) {
        this.validateUserData(userData)
      }

      // Check for duplicate DNIs within the batch and against existing users
      const dnis = usersData.map((u) => u.dni)
      const duplicatesInBatch = dnis.filter((dni, index) => dnis.indexOf(dni) !== index)
      if (duplicatesInBatch.length > 0) {
        throw new DatabaseError(
          `Duplicate DNIs in batch: ${duplicatesInBatch.join(', ')}`,
          'DUPLICATE_DNI'
        )
      }

      // Check against existing users
      for (const dni of dnis) {
        const existing = await this.findByDni(dni)
        if (existing) {
          throw new DatabaseError(`User with DNI ${dni} already exists`, 'DUPLICATE_DNI')
        }
      }

      const insertStmt = this.db.prepare(`
        INSERT INTO users (id, nombre, edad, dni, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `)

      const createdUsers: User[] = []

      const transaction = this.db.transaction(() => {
        for (const userData of usersData) {
          const id = this.generateUserId()
          insertStmt.run(id, userData.nombre, userData.edad, userData.dni)
          createdUsers.push({
            id,
            ...userData
          })
        }
      })

      transaction()

      return createdUsers
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error
      }
      throw new DatabaseError(
        'Failed to bulk create users',
        'BULK_CREATE_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Check if DNI exists (optimized for validation)
   */
  async dniExists(dni: number): Promise<boolean> {
    try {
      const stmt = this.db.prepare('SELECT 1 FROM users WHERE dni = ? LIMIT 1')
      const result = stmt.get(dni)
      return result !== undefined
    } catch (error) {
      throw new DatabaseError(
        `Failed to check DNI existence: ${dni}`,
        'DNI_CHECK_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Get database statistics for monitoring
   */
  async getStats() {
    try {
      const totalUsers = this.db.prepare('SELECT COUNT(*) as count FROM users').get() as {
        count: number
      }

      const ageStats = this.db
        .prepare(
          `
        SELECT 
          MIN(edad) as min_age,
          MAX(edad) as max_age,
          AVG(edad) as avg_age
        FROM users
      `
        )
        .get() as {
        min_age: number
        max_age: number
        avg_age: number
      }

      return {
        totalUsers: totalUsers.count,
        ageStats: {
          min: ageStats.min_age,
          max: ageStats.max_age,
          average: Math.round(ageStats.avg_age * 100) / 100
        }
      }
    } catch (error) {
      throw new DatabaseError(
        'Failed to get repository stats',
        'STATS_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Private helper methods
   */
  private validateUserData(userData: Omit<User, 'id'>): void {
    if (!userData.nombre || typeof userData.nombre !== 'string' || userData.nombre.trim() === '') {
      throw new DatabaseError('Name is required and must be a non-empty string', 'VALIDATION_ERROR')
    }

    if (
      typeof userData.edad !== 'number' ||
      !Number.isInteger(userData.edad) ||
      userData.edad <= 0 ||
      userData.edad > 120
    ) {
      throw new DatabaseError(
        'Age must be a positive integer between 1 and 120',
        'VALIDATION_ERROR'
      )
    }

    if (
      typeof userData.dni !== 'number' ||
      !Number.isInteger(userData.dni) ||
      userData.dni < 1000000 ||
      userData.dni > 99999999
    ) {
      throw new DatabaseError('DNI must be a 7-8 digit integer', 'VALIDATION_ERROR')
    }
  }

  private generateUserId(): string {
    return `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}
