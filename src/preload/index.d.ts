import { ElectronAPI } from '@electron-toolkit/preload'
import type { LoginCredentials, AuthLoginResponse, AuthVerifyResponse, AuthUser } from '../types/auth'

// User types for API
interface User {
  id: string
  nombre: string
  edad: number
  dni: number
}

type CreateUserData = Omit<User, 'id'>

// User API interface
interface UserAPI {
  loadUsers: () => Promise<User[]>
  createUser: (userData: CreateUserData) => Promise<User>
  updateUser: (id: string, userData: CreateUserData) => Promise<User>
  deleteUser: (id: string) => Promise<void>
}

// Auth API interface
interface AuthAPI {
  login: (credentials: LoginCredentials) => Promise<AuthLoginResponse>
  logout: (token: string) => Promise<void>
  verifySession: (token: string) => Promise<AuthVerifyResponse>
  checkDefaultAdmin: () => Promise<boolean>
  createDefaultAdmin: () => Promise<AuthUser>
}

// Main API interface
interface API {
  users: UserAPI
  auth: AuthAPI
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}
