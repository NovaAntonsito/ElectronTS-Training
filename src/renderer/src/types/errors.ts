// Error types for the application
export interface AppError {
  message: string
  code?: string
  details?: unknown
}

// Validation error for form fields
export interface ValidationError {
  field: string
  message: string
}

// Storage error types
export interface StorageError extends AppError {
  operation: 'read' | 'write' | 'delete'
  filePath?: string
}

// IPC communication error
export interface IPCError extends AppError {
  channel: string
  operation: string
}

// Error handler function type
export type ErrorHandler = (error: AppError) => void
