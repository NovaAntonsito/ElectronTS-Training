import { User, CreateUserData } from './user'
import { ModalMode } from './modal'

// Props for UserTable component
export interface UserTableProps {
  users: User[]
  onCreateUser: () => void
  onEditUser: (user: User) => void
  onDeleteUser: (user: User) => void
}

// Props for UserModal component
export interface UserModalProps {
  mode: ModalMode
  user?: User
  users: User[] // List of existing users for validation
  isOpen: boolean
  onSave: (user: CreateUserData) => void
  onCancel: () => void
}

// Props for ConfirmModal component
export interface ConfirmModalProps {
  isOpen: boolean
  user: User
  onConfirm: () => void
  onCancel: () => void
}
