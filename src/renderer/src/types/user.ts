// User model interface
export interface User {
  id: string // UUID generado automáticamente
  nombre: string // Nombre del usuario (requerido)
  edad: number // Edad del usuario (requerido, > 0)
  dni: number // DNI del usuario (requerido, único)
}

// Type for creating a new user (without id)
export type CreateUserData = Omit<User, 'id'>

// Type for updating a user (without id)
export type UpdateUserData = Omit<User, 'id'>
