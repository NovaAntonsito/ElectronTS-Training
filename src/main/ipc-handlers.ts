import { ipcMain } from 'electron'
import { UserStorageService } from './services/user-storage'
import { User } from './types'

// Initialize user storage service
const userStorage = new UserStorageService()

/**
 * Setup IPC handlers for user CRUD operations with enhanced error handling
 */
export function setupUserIPCHandlers(): void {
  // Load all users
  ipcMain.handle('users:load', async (): Promise<User[]> => {
    try {
      console.log('IPC: Loading users...')
      const users = await userStorage.loadUsers()
      console.log(`IPC: Successfully loaded ${users.length} users`)
      return users
    } catch (error) {
      console.error('IPC Error loading users:', error)
      // Serialize error with additional context for better debugging
      if (error instanceof Error) {
        const serializedError = new Error(error.message)
        serializedError.name = error.name
        serializedError.stack = error.stack
        throw serializedError
      }
      throw new Error('Error desconocido al cargar usuarios')
    }
  })

  // Create new user
  ipcMain.handle('users:create', async (_, userData: Omit<User, 'id'>): Promise<User> => {
    try {
      console.log('IPC: Creating user with data:', {
        nombre: userData.nombre,
        edad: userData.edad,
        dni: '[REDACTED]'
      })

      const newUser = await userStorage.addUser(userData)
      console.log(`IPC: Successfully created user "${newUser.nombre}" with ID: ${newUser.id}`)
      return newUser
    } catch (error) {
      console.error('IPC Error creating user:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        name: error instanceof Error ? error.name : 'Unknown',
        userData: { nombre: userData.nombre, edad: userData.edad, dni: '[REDACTED]' }
      })

      // Serialize error with additional context for better debugging
      if (error instanceof Error) {
        const serializedError = new Error(error.message)
        serializedError.name = error.name
        serializedError.stack = error.stack
        throw serializedError
      }
      throw new Error('Error desconocido al crear usuario')
    }
  })

  // Update existing user
  ipcMain.handle(
    'users:update',
    async (_, id: string, userData: Omit<User, 'id'>): Promise<User> => {
      try {
        console.log(`IPC: Updating user ${id} with data:`, {
          nombre: userData.nombre,
          edad: userData.edad,
          dni: '[REDACTED]'
        })

        const updatedUser = await userStorage.updateUser(id, userData)
        console.log(`IPC: Successfully updated user "${updatedUser.nombre}" (ID: ${id})`)
        return updatedUser
      } catch (error) {
        console.error(`IPC Error updating user ${id}:`, {
          error: error instanceof Error ? error.message : 'Unknown error',
          name: error instanceof Error ? error.name : 'Unknown',
          userId: id,
          userData: { nombre: userData.nombre, edad: userData.edad, dni: '[REDACTED]' }
        })

        // Serialize error with additional context for better debugging
        if (error instanceof Error) {
          const serializedError = new Error(error.message)
          serializedError.name = error.name
          serializedError.stack = error.stack
          throw serializedError
        }
        throw new Error('Error desconocido al actualizar usuario')
      }
    }
  )

  // Delete user
  ipcMain.handle('users:delete', async (_, id: string): Promise<void> => {
    try {
      console.log(`IPC: Deleting user ${id}`)
      await userStorage.deleteUser(id)
      console.log(`IPC: Successfully deleted user ${id}`)
    } catch (error) {
      console.error(`IPC Error deleting user ${id}:`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        name: error instanceof Error ? error.name : 'Unknown',
        userId: id
      })

      // Serialize error with additional context for better debugging
      if (error instanceof Error) {
        const serializedError = new Error(error.message)
        serializedError.name = error.name
        serializedError.stack = error.stack
        throw serializedError
      }
      throw new Error('Error desconocido al eliminar usuario')
    }
  })
}

/**
 * Remove all user IPC handlers
 */
export function removeUserIPCHandlers(): void {
  ipcMain.removeAllListeners('users:load')
  ipcMain.removeAllListeners('users:create')
  ipcMain.removeAllListeners('users:update')
  ipcMain.removeAllListeners('users:delete')
}
