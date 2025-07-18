import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Types for user operations
interface User {
  id: string
  nombre: string
  edad: number
  dni: number
}

type CreateUserData = Omit<User, 'id'>

// User API for renderer process
const userAPI = {
  // Load all users
  loadUsers: (): Promise<User[]> => ipcRenderer.invoke('users:load'),

  // Create new user
  createUser: (userData: CreateUserData): Promise<User> =>
    ipcRenderer.invoke('users:create', userData),

  // Update existing user
  updateUser: (id: string, userData: CreateUserData): Promise<User> =>
    ipcRenderer.invoke('users:update', id, userData),

  // Delete user
  deleteUser: (id: string): Promise<void> => ipcRenderer.invoke('users:delete', id)
}

// Custom APIs for renderer
const api = {
  users: userAPI
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
