// Authentication Types and Interfaces
import type { ReactNode } from 'react'

// Login credentials for authentication
export interface LoginCredentials {
  username: string
  password: string
}

// Authenticated user data for renderer process
export interface AuthUser {
  id: string
  username: string
  displayName: string
  lastLogin: string
  mustChangePassword?: boolean
}

// Session information for renderer process
export interface AuthSession {
  userId: string
  token: string
  createdAt: string
  expiresAt: string
}

// Authentication state for React context
export interface AuthState {
  isAuthenticated: boolean
  user: AuthUser | null
  loading: boolean
  error: string | null
}

// Component Interfaces
export interface LoginScreenProps {
  onLogin: (credentials: LoginCredentials) => Promise<void>
  loading: boolean
  error: string | null
}

export interface AuthGuardProps {
  children: ReactNode
}

export interface AuthContextType {
  authState: AuthState
  login: (credentials: LoginCredentials) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
}

// IPC API Types (following the existing pattern)
export interface AuthAPI {
  // Authenticate user with credentials
  login: (credentials: LoginCredentials) => Promise<AuthLoginResponse>
  
  // Logout current user
  logout: (token: string) => Promise<void>
  
  // Verify session token
  verifySession: (token: string) => Promise<AuthVerifyResponse>
  
  // Check if default admin exists
  checkDefaultAdmin: () => Promise<boolean>
  
  // Create default admin user
  createDefaultAdmin: () => Promise<AuthUser>
}

// IPC Response Types
export interface AuthLoginResponse {
  success: boolean
  user?: AuthUser
  session?: AuthSession
  error?: string
}

export interface AuthVerifyResponse {
  valid: boolean
  user?: AuthUser
  error?: string
}

// Configuration Types
export interface SecurityConfig {
  passwordMinLength: number
  maxLoginAttempts: number
  lockoutDuration: number
  sessionDuration: number
  bcryptRounds: number
}

export interface RetryConfig {
  maxAttempts: number
  baseDelay: number
  maxDelay: number
  backoffFactor: number
}

// Error Types
export enum AuthErrorType {
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  USER_INACTIVE = 'USER_INACTIVE',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  TOO_MANY_ATTEMPTS = 'TOO_MANY_ATTEMPTS',
  USER_LOCKED = 'USER_LOCKED'
}

export interface AuthError {
  type: AuthErrorType
  message: string
  details?: any
}

// Default configuration values
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  passwordMinLength: 6,
  maxLoginAttempts: 3,
  lockoutDuration: 300000, // 5 minutes
  sessionDuration: 0, // Session lasts for app lifetime
  bcryptRounds: 12
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 5000,
  backoffFactor: 2
}