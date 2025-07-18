import { ElectronAPI } from '@electron-toolkit/preload'

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

// Main API interface
interface API {
  users: UserAPI
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}
