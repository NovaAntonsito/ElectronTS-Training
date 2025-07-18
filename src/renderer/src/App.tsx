import { useState, useEffect } from 'react'
import UserTable from './components/UserTable'
import UserModal from './components/UserModal'
import ConfirmModal from './components/ConfirmModal'
import NotificationSystem from './components/NotificationSystem'
import { User, CreateUserData } from './types/user'
import { ModalMode } from './types/modal'
import { withRetryAndTimeout } from './utils/error-handling'
import { useNotifications } from './hooks/useNotifications'
import { processError, getSuccessMessage } from './utils/error-messages'
import './App.css'

// Application state interface
interface AppState {
  loading: boolean
  saving: boolean
  error: string | null
  success: string | null
}

function App(): React.JSX.Element {
  // Users state
  const [users, setUsers] = useState<User[]>([])

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>('closed')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)

  // Application state
  const [appState, setAppState] = useState<AppState>({
    loading: false,
    saving: false,
    error: null,
    success: null
  })

  // Notification system
  const {
    notifications,
    removeNotification,
    addSuccessNotification,
    addErrorNotification,
    addWarningNotification
  } = useNotifications()

  /**
   * Handle errors with enhanced notification system
   */
  const handleError = (
    error: unknown,
    operation: 'crear' | 'actualizar' | 'eliminar' | 'cargar'
  ): void => {
    const processedError = processError(error, { operation })

    // Add notification based on error type and severity
    if (processedError.type === 'validation' && processedError.recoverable) {
      addWarningNotification(processedError.title, processedError.message, { duration: 6000 })
    } else if (processedError.type === 'storage' && !processedError.recoverable) {
      // Critical storage errors need persistent notifications
      addErrorNotification(processedError.title, processedError.message, {
        persistent: true
      })
    } else {
      addErrorNotification(processedError.title, processedError.message, {
        duration: processedError.recoverable ? 6000 : 10000,
        persistent: !processedError.recoverable
      })
    }

    // Log detailed error for debugging with additional context
    console.error(`Error during ${operation}:`, {
      error,
      processedError,
      suggestions: processedError.suggestions,
      timestamp: new Date().toISOString(),
      userCount: users.length,
      appState
    })
  }

  /**
   * Handle success operations with notifications
   */
  const handleSuccess = (
    operation: 'crear' | 'actualizar' | 'eliminar' | 'cargar',
    userName?: string
  ): void => {
    const successMessage = getSuccessMessage(operation, userName)
    addSuccessNotification(successMessage.title, successMessage.message, { duration: 4000 })
  }

  // Load users on component mount
  useEffect(() => {
    loadUsers()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Clear success/error messages after 3 seconds
  useEffect(() => {
    if (appState.success || appState.error) {
      const timer = setTimeout(() => {
        setAppState((prev) => ({
          ...prev,
          success: null,
          error: null
        }))
      }, 3000)

      return () => clearTimeout(timer)
    }
    return undefined
  }, [appState.success, appState.error])

  /**
   * Load all users from storage with retry mechanism
   */
  const loadUsers = async (): Promise<void> => {
    try {
      setAppState((prev) => ({ ...prev, loading: true, error: null }))

      const loadedUsers = await withRetryAndTimeout(
        () => window.api.users.loadUsers(),
        { maxAttempts: 3, delayMs: 1000 },
        10000 // 10 second timeout
      )

      setUsers(loadedUsers)
      if (loadedUsers.length > 0) {
        handleSuccess('cargar')
      }
    } catch (error) {
      handleError(error, 'cargar')
    } finally {
      setAppState((prev) => ({ ...prev, loading: false }))
    }
  }

  /**
   * Create a new user
   */
  const createUser = async (userData: CreateUserData): Promise<void> => {
    try {
      setAppState((prev) => ({ ...prev, saving: true, error: null }))
      const newUser = await window.api.users.createUser(userData)
      setUsers((prev) => [...prev, newUser])
      handleSuccess('crear', newUser.nombre)
      closeModal()
    } catch (error) {
      handleError(error, 'crear')
      throw error // Re-throw to let modal handle it
    } finally {
      setAppState((prev) => ({ ...prev, saving: false }))
    }
  }

  /**
   * Update an existing user
   */
  const updateUser = async (userData: CreateUserData): Promise<void> => {
    if (!selectedUser) return

    try {
      setAppState((prev) => ({ ...prev, saving: true, error: null }))
      const updatedUser = await window.api.users.updateUser(selectedUser.id, userData)
      setUsers((prev) => prev.map((user) => (user.id === selectedUser.id ? updatedUser : user)))
      handleSuccess('actualizar', updatedUser.nombre)
      closeModal()
    } catch (error) {
      // Handle special case: reload users if user not found
      if (error instanceof Error && error.message.includes('User not found')) {
        setTimeout(() => loadUsers(), 1000)
      }

      handleError(error, 'actualizar')
      throw error // Re-throw to let modal handle it
    } finally {
      setAppState((prev) => ({ ...prev, saving: false }))
    }
  }

  /**
   * Delete a user
   */
  const deleteUser = async (): Promise<void> => {
    if (!selectedUser) return

    try {
      setAppState((prev) => ({ ...prev, saving: true, error: null }))
      await window.api.users.deleteUser(selectedUser.id)
      setUsers((prev) => prev.filter((user) => user.id !== selectedUser.id))
      handleSuccess('eliminar', selectedUser.nombre)
      closeModal()
    } catch (error) {
      // Handle special case: reload users if user not found
      if (error instanceof Error && error.message.includes('User not found')) {
        setTimeout(() => loadUsers(), 1000)
      }

      handleError(error, 'eliminar')
    } finally {
      setAppState((prev) => ({ ...prev, saving: false }))
      closeModal()
    }
  }

  /**
   * Handle create user action
   */
  const handleCreateUser = (): void => {
    setSelectedUser(null)
    setModalMode('create')
  }

  /**
   * Handle edit user action
   */
  const handleEditUser = (user: User): void => {
    setSelectedUser(user)
    setModalMode('edit')
  }

  /**
   * Handle delete user action
   */
  const handleDeleteUser = (user: User): void => {
    setSelectedUser(user)
    setModalMode('delete')
  }

  /**
   * Close all modals
   */
  const closeModal = (): void => {
    setModalMode('closed')
    setSelectedUser(null)
  }

  /**
   * Handle user modal save
   */
  const handleUserModalSave = async (userData: CreateUserData): Promise<void> => {
    if (modalMode === 'create') {
      await createUser(userData)
    } else if (modalMode === 'edit') {
      await updateUser(userData)
    }
  }

  /**
   * Handle confirm modal confirm
   */
  const handleConfirmModalConfirm = (): void => {
    deleteUser()
  }

  return (
    <div className="app">
      {/* Notification System */}
      <NotificationSystem notifications={notifications} onRemove={removeNotification} />

      {/* Loading Overlay */}
      {appState.loading && (
        <div className="loading-overlay">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>Cargando usuarios...</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <UserTable
        users={users}
        onCreateUser={handleCreateUser}
        onEditUser={handleEditUser}
        onDeleteUser={handleDeleteUser}
      />

      {/* User Modal (Create/Edit) */}
      <UserModal
        mode={modalMode}
        user={selectedUser || undefined}
        users={users}
        isOpen={modalMode === 'create' || modalMode === 'edit'}
        onSave={handleUserModalSave}
        onCancel={closeModal}
      />

      {/* Confirm Modal (Delete) */}
      {selectedUser && (
        <ConfirmModal
          isOpen={modalMode === 'delete'}
          user={selectedUser}
          onConfirm={handleConfirmModalConfirm}
          onCancel={closeModal}
        />
      )}
    </div>
  )
}

export default App
