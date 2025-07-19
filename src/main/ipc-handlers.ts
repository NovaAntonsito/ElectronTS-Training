import { ipcMain } from 'electron'
import { StorageAdapter } from './services/storage-adapter'
import { AuthService } from './services/auth-service'
import { User } from './types'
import { databaseService } from './services/database-service'

// Initialize storage adapter (now exclusively uses LightDB after migration completion)
const storageAdapter = new StorageAdapter()

// Initialize auth service
const authService = new AuthService()

// Flag to track if LightDB has been initialized
let lightDBInitialized = false

/**
 * Initialize LightDB if not already done
 */
async function ensureLightDBInitialized(): Promise<void> {
  if (!lightDBInitialized) {
    try {
      await databaseService.initialize()
      lightDBInitialized = true
      console.log('LightDB initialized successfully')
    } catch (error) {
      console.error('Failed to initialize LightDB:', error)
      throw error
    }
  }
}

/**
 * Setup IPC handlers for user CRUD operations with enhanced error handling
 */
export function setupUserIPCHandlers(): void {
  // Load all users
  ipcMain.handle('users:load', async (): Promise<User[]> => {
    try {
      console.log('IPC: Loading users...')
      const users = await storageAdapter.loadUsers()
      console.log(
        `IPC: Successfully loaded ${users.length} users (using ${storageAdapter.isUsingLightDB() ? 'LightDB' : 'JSON'})`
      )
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

      const newUser = await storageAdapter.addUser(userData)
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

        const updatedUser = await storageAdapter.updateUser(id, userData)
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
      await storageAdapter.deleteUser(id)
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

  // Enhanced search functionality
  ipcMain.handle(
    'users:search',
    async (
      _,
      query: string,
      options?: {
        limit?: number
        offset?: number
        orderBy?: string
        orderDirection?: 'ASC' | 'DESC'
      }
    ): Promise<User[]> => {
      try {
        console.log(`IPC: Searching users with query: "${query}"`)
        const users = await storageAdapter.searchUsers(query, options)
        console.log(`IPC: Found ${users.length} users matching search`)
        return users
      } catch (error) {
        console.error('IPC Error searching users:', error)
        if (error instanceof Error) {
          const serializedError = new Error(error.message)
          serializedError.name = error.name
          serializedError.stack = error.stack
          throw serializedError
        }
        throw new Error('Error desconocido al buscar usuarios')
      }
    }
  )

  // Get users with pagination
  ipcMain.handle(
    'users:paginated',
    async (
      _,
      options?: {
        limit?: number
        offset?: number
        orderBy?: string
        orderDirection?: 'ASC' | 'DESC'
        searchTerm?: string
      }
    ) => {
      try {
        console.log('IPC: Getting paginated users with options:', options)
        const result = await storageAdapter.getUsersWithPagination(options)
        console.log(
          `IPC: Retrieved ${result.users.length} users (page ${result.pagination.currentPage} of ${result.pagination.totalPages})`
        )
        return result
      } catch (error) {
        console.error('IPC Error getting paginated users:', error)
        if (error instanceof Error) {
          const serializedError = new Error(error.message)
          serializedError.name = error.name
          serializedError.stack = error.stack
          throw serializedError
        }
        throw new Error('Error desconocido al obtener usuarios paginados')
      }
    }
  )

  // Find user by DNI
  ipcMain.handle('users:findByDni', async (_, dni: number): Promise<User | null> => {
    try {
      console.log(`IPC: Finding user by DNI: ${dni}`)
      const user = await storageAdapter.findUserByDni(dni)
      console.log(`IPC: User ${user ? 'found' : 'not found'} for DNI: ${dni}`)
      return user
    } catch (error) {
      console.error(`IPC Error finding user by DNI ${dni}:`, error)
      if (error instanceof Error) {
        const serializedError = new Error(error.message)
        serializedError.name = error.name
        serializedError.stack = error.stack
        throw serializedError
      }
      throw new Error('Error desconocido al buscar usuario por DNI')
    }
  })

  // Find user by ID
  ipcMain.handle('users:findById', async (_, id: string): Promise<User | null> => {
    try {
      console.log(`IPC: Finding user by ID: ${id}`)
      const user = await storageAdapter.findUserById(id)
      console.log(`IPC: User ${user ? 'found' : 'not found'} for ID: ${id}`)
      return user
    } catch (error) {
      console.error(`IPC Error finding user by ID ${id}:`, error)
      if (error instanceof Error) {
        const serializedError = new Error(error.message)
        serializedError.name = error.name
        serializedError.stack = error.stack
        throw serializedError
      }
      throw new Error('Error desconocido al buscar usuario por ID')
    }
  })

  // Check if DNI is available
  ipcMain.handle('users:isDniAvailable', async (_, dni: number): Promise<boolean> => {
    try {
      console.log(`IPC: Checking DNI availability: ${dni}`)
      const isAvailable = await storageAdapter.isDniAvailable(dni)
      console.log(`IPC: DNI ${dni} is ${isAvailable ? 'available' : 'not available'}`)
      return isAvailable
    } catch (error) {
      console.error(`IPC Error checking DNI availability ${dni}:`, error)
      if (error instanceof Error) {
        const serializedError = new Error(error.message)
        serializedError.name = error.name
        serializedError.stack = error.stack
        throw serializedError
      }
      throw new Error('Error desconocido al verificar disponibilidad de DNI')
    }
  })

  // Get user statistics
  ipcMain.handle('users:stats', async () => {
    try {
      console.log('IPC: Getting user statistics')
      const stats = await storageAdapter.getStats()
      console.log('IPC: Successfully retrieved user statistics')
      return stats
    } catch (error) {
      console.error('IPC Error getting user stats:', error)
      if (error instanceof Error) {
        const serializedError = new Error(error.message)
        serializedError.name = error.name
        serializedError.stack = error.stack
        throw serializedError
      }
      throw new Error('Error desconocido al obtener estadísticas')
    }
  })

  // Migration finalization handler (complete migration and cleanup)
  ipcMain.handle('migration:finalize', async () => {
    try {
      console.log('IPC: Starting migration finalization...')
      const { MigrationFinalizer } = await import('./services/migration-finalizer')
      const migrationFinalizer = new MigrationFinalizer()
      const result = await migrationFinalizer.finalizeMigration()
      console.log('IPC: Migration finalization completed:', result)
      return result
    } catch (error) {
      console.error('IPC Error during migration finalization:', error)
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown migration finalization error'
      throw new Error(`Migration finalization failed: ${errorMessage}`)
    }
  })

  // Get migration status
  ipcMain.handle('migration:getStatus', async () => {
    try {
      console.log('IPC: Getting migration status...')
      const { MigrationFinalizer } = await import('./services/migration-finalizer')
      const migrationFinalizer = new MigrationFinalizer()
      const status = await migrationFinalizer.getMigrationStatus()
      console.log('IPC: Migration status retrieved:', status)
      return status
    } catch (error) {
      console.error('IPC Error getting migration status:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown migration status error'
      throw new Error(`Failed to get migration status: ${errorMessage}`)
    }
  })

  // Check current storage type (always LightDB after migration)
  ipcMain.handle('storage:getCurrentType', async (): Promise<string> => {
    try {
      const storageType = 'LightDB'
      console.log(`IPC: Current storage type: ${storageType}`)
      return storageType
    } catch (error) {
      console.error('IPC Error getting storage type:', error)
      throw new Error('Failed to get current storage type')
    }
  })

  // Authentication handlers

  // Start auth service
  ipcMain.handle('auth:start', async (): Promise<string> => {
    try {
      console.log('IPC: Starting auth service...')
      await ensureLightDBInitialized()
      await authService.start()
      console.log('IPC: Auth service started successfully')
      return 'Auth service started successfully'
    } catch (error) {
      console.error('IPC Error starting auth service:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown auth service error'
      throw new Error(`Failed to start auth service: ${errorMessage}`)
    }
  })

  // Stop auth service
  ipcMain.handle('auth:stop', async (): Promise<string> => {
    try {
      console.log('IPC: Stopping auth service...')
      await authService.stop()
      console.log('IPC: Auth service stopped successfully')
      return 'Auth service stopped successfully'
    } catch (error) {
      console.error('IPC Error stopping auth service:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown auth service error'
      throw new Error(`Failed to stop auth service: ${errorMessage}`)
    }
  })

  // Authenticate user
  ipcMain.handle('auth:authenticate', async (_, username: string, password: string) => {
    try {
      console.log(`IPC: Authenticating user: ${username}`)
      const result = await authService.authenticateUser(username, password)
      console.log(
        `IPC: Authentication ${result.success ? 'successful' : 'failed'} for user: ${username}`
      )
      return result
    } catch (error) {
      console.error(`IPC Error authenticating user ${username}:`, error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown authentication error'
      throw new Error(`Authentication failed: ${errorMessage}`)
    }
  })

  // Create session
  ipcMain.handle('auth:createSession', async (_, userId: string, expiresInMinutes?: number) => {
    try {
      console.log(`IPC: Creating session for user: ${userId}`)
      const session = await authService.createSession(userId, expiresInMinutes)
      console.log(`IPC: Session created successfully for user: ${userId}`)
      return session
    } catch (error) {
      console.error(`IPC Error creating session for user ${userId}:`, error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown session creation error'
      throw new Error(`Failed to create session: ${errorMessage}`)
    }
  })

  // Validate session
  ipcMain.handle('auth:validateSession', async (_, token: string) => {
    try {
      console.log('IPC: Validating session token')
      const result = await authService.validateSession(token)
      console.log(`IPC: Session validation ${result.valid ? 'successful' : 'failed'}`)
      return result
    } catch (error) {
      console.error('IPC Error validating session:', error)
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown session validation error'
      throw new Error(`Session validation failed: ${errorMessage}`)
    }
  })

  // Delete session (logout)
  ipcMain.handle('auth:logout', async (_, token: string): Promise<string> => {
    try {
      console.log('IPC: Logging out user')
      await authService.deleteSession(token)
      console.log('IPC: User logged out successfully')
      return 'Logged out successfully'
    } catch (error) {
      console.error('IPC Error during logout:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown logout error'
      throw new Error(`Logout failed: ${errorMessage}`)
    }
  })

  // Get auth statistics
  ipcMain.handle('auth:stats', async () => {
    try {
      console.log('IPC: Getting auth statistics')
      const stats = await authService.getAuthStats()
      console.log('IPC: Successfully retrieved auth statistics')
      return stats
    } catch (error) {
      console.error('IPC Error getting auth stats:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown auth stats error'
      throw new Error(`Failed to get auth stats: ${errorMessage}`)
    }
  })

  // Create default admin user
  ipcMain.handle('auth:createDefaultAdmin', async () => {
    try {
      console.log('IPC: Creating default admin user')
      await ensureLightDBInitialized()
      const adminUser = await authService.createDefaultAdminUser()
      console.log('IPC: Default admin user creation completed')
      return adminUser
    } catch (error) {
      console.error('IPC Error creating default admin user:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown admin creation error'
      throw new Error(`Failed to create default admin: ${errorMessage}`)
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
  ipcMain.removeAllListeners('migration:test')
}
