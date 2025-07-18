import { User, CreateUserData } from './user'

// IPC channel names for user operations
export const IPC_CHANNELS = {
  USERS_LOAD: 'users:load',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  USERS_DELETE: 'users:delete'
} as const

// IPC handlers interface for type safety
export interface IPCHandlers {
  'users:load': () => Promise<User[]>
  'users:create': (user: CreateUserData) => Promise<User>
  'users:update': (id: string, user: CreateUserData) => Promise<User>
  'users:delete': (id: string) => Promise<void>
}

// Type for IPC invoke calls
export type IPCInvoke = <T extends keyof IPCHandlers>(
  channel: T,
  ...args: Parameters<IPCHandlers[T]>
) => ReturnType<IPCHandlers[T]>
