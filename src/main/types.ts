// User data model
export interface User {
  id: string // UUID generado automáticamente
  nombre: string // Nombre del usuario (requerido)
  edad: number // Edad del usuario (requerido, > 0)
  dni: number // DNI del usuario (requerido, único)
}

// Storage data structure
export interface UserStorageData {
  users: User[]
  metadata: {
    version: string
    lastModified: string
  }
}

export class StorageError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message)
    this.name = 'StorageError'
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}

// Authentication user model
export interface AuthUser {
  id: string
  username: string
  password_hash: string
  display_name: string
  active: boolean
  must_change_password: boolean
  last_login: Date | null
  failed_attempts: number
  locked_until: Date | null
  created_at: Date
  updated_at: Date
}

// Authentication session model
export interface AuthSession {
  id: string
  user_id: string
  token: string
  expires_at: Date
  created_at: Date
}

// Data transfer objects for creating entities
export interface CreateAuthUserData {
  username: string
  password_hash: string
  display_name: string
  active?: boolean
  must_change_password?: boolean
}

export interface CreateSessionData {
  user_id: string
  token: string
  expires_at: Date
}

// Query options for database operations
export interface QueryOptions {
  limit?: number
  offset?: number
  orderBy?: string
  orderDirection?: 'ASC' | 'DESC'
  filters?: Record<string, any>
}

// Database error classes
export class DatabaseError extends Error {
  constructor(
    message: string,
    public code: string,
    public originalError?: Error
  ) {
    super(message)
    this.name = 'DatabaseError'
  }
}

export class MigrationError extends Error {
  constructor(
    message: string,
    public version?: number
  ) {
    super(message)
    this.name = 'MigrationError'
  }
}
