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
