/**
 * Comprehensive validation utilities for user data
 */

import { CreateUserData } from '../types/user'

export interface ValidationResult {
  isValid: boolean
  errors: Record<string, string>
  warnings?: Record<string, string>
}

export interface FieldValidationResult {
  isValid: boolean
  error?: string
  warning?: string
}

/**
 * Validate a single field with enhanced error messages
 */
export function validateField(
  field: keyof CreateUserData,
  value: string | number,
  context?: { existingDNIs?: number[]; currentUserDNI?: number }
): FieldValidationResult {
  switch (field) {
    case 'nombre':
      return validateNombre(value as string)
    case 'edad':
      return validateEdad(value as number)
    case 'dni':
      return validateDNI(value as number, context?.existingDNIs, context?.currentUserDNI)
    default:
      return { isValid: true }
  }
}

/**
 * Validate complete user data
 */
export function validateUserData(
  userData: CreateUserData,
  context?: { existingDNIs?: number[]; currentUserDNI?: number }
): ValidationResult {
  const errors: Record<string, string> = {}
  const warnings: Record<string, string> = {}

  // Validate each field
  Object.keys(userData).forEach((key) => {
    const field = key as keyof CreateUserData
    const result = validateField(field, userData[field], context)

    if (!result.isValid && result.error) {
      errors[field] = result.error
    }

    if (result.warning) {
      warnings[field] = result.warning
    }
  })

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    warnings: Object.keys(warnings).length > 0 ? warnings : undefined
  }
}

/**
 * Validate nombre field
 */
export function validateNombre(nombre: string): FieldValidationResult {
  if (!nombre || typeof nombre !== 'string') {
    return {
      isValid: false,
      error: 'El nombre es requerido y debe ser texto válido'
    }
  }

  const trimmedName = nombre.trim()

  if (trimmedName.length === 0) {
    return {
      isValid: false,
      error: 'El nombre no puede estar vacío'
    }
  }

  if (trimmedName.length < 2) {
    return {
      isValid: false,
      error: 'El nombre debe tener al menos 2 caracteres'
    }
  }

  if (trimmedName.length > 100) {
    return {
      isValid: false,
      error: 'El nombre no puede exceder 100 caracteres'
    }
  }

  // Check for valid characters (letters, spaces, accents)
  if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(trimmedName)) {
    return {
      isValid: false,
      error: 'El nombre solo puede contener letras y espacios'
    }
  }

  // Check for excessive spaces
  if (/\s{2,}/.test(trimmedName)) {
    return {
      isValid: true,
      warning: 'El nombre contiene espacios múltiples que serán normalizados'
    }
  }

  // Check for leading/trailing spaces
  if (nombre !== trimmedName) {
    return {
      isValid: true,
      warning: 'Se eliminarán los espacios al inicio y final del nombre'
    }
  }

  return { isValid: true }
}

/**
 * Validate edad field
 */
export function validateEdad(edad: number): FieldValidationResult {
  if (typeof edad !== 'number' || isNaN(edad)) {
    return {
      isValid: false,
      error: 'La edad debe ser un número válido'
    }
  }

  if (!Number.isInteger(edad)) {
    return {
      isValid: false,
      error: 'La edad debe ser un número entero'
    }
  }

  if (edad <= 0) {
    return {
      isValid: false,
      error: 'La edad debe ser mayor a 0'
    }
  }

  if (edad > 120) {
    return {
      isValid: false,
      error: 'La edad no puede ser mayor a 120 años'
    }
  }

  // Warnings for unusual ages
  if (edad < 16) {
    return {
      isValid: true,
      warning: 'Edad menor a 16 años - verifique que sea correcta'
    }
  }

  if (edad > 100) {
    return {
      isValid: true,
      warning: 'Edad mayor a 100 años - verifique que sea correcta'
    }
  }

  return { isValid: true }
}

/**
 * Validate DNI field with uniqueness check
 */
export function validateDNI(
  dni: number,
  existingDNIs?: number[],
  currentUserDNI?: number
): FieldValidationResult {
  if (typeof dni !== 'number' || isNaN(dni)) {
    return {
      isValid: false,
      error: 'El DNI debe ser un número válido'
    }
  }

  if (!Number.isInteger(dni)) {
    return {
      isValid: false,
      error: 'El DNI debe ser un número entero'
    }
  }

  if (dni <= 0) {
    return {
      isValid: false,
      error: 'El DNI debe ser un número positivo'
    }
  }

  if (dni < 1000000) {
    return {
      isValid: false,
      error: 'El DNI debe tener al menos 7 dígitos'
    }
  }

  if (dni > 99999999) {
    return {
      isValid: false,
      error: 'El DNI no puede tener más de 8 dígitos'
    }
  }

  // Check for uniqueness if existing DNIs are provided
  if (existingDNIs && existingDNIs.length > 0) {
    const isDuplicate = existingDNIs.some(
      (existingDNI) => existingDNI === dni && existingDNI !== currentUserDNI
    )

    if (isDuplicate) {
      return {
        isValid: false,
        error: 'El DNI ingresado ya existe en el sistema'
      }
    }
  }

  // Basic DNI format validation (Argentina DNI patterns)
  const dniStr = dni.toString()

  // Check for obviously invalid patterns
  if (/^(\d)\1+$/.test(dniStr)) {
    return {
      isValid: true,
      warning: 'El DNI contiene solo dígitos repetidos - verifique que sea correcto'
    }
  }

  // Check for sequential numbers
  if (isSequentialNumber(dniStr)) {
    return {
      isValid: true,
      warning: 'El DNI contiene números secuenciales - verifique que sea correcto'
    }
  }

  return { isValid: true }
}

/**
 * Check if a number string contains sequential digits
 */
function isSequentialNumber(numStr: string): boolean {
  for (let i = 0; i < numStr.length - 2; i++) {
    const current = parseInt(numStr[i])
    const next1 = parseInt(numStr[i + 1])
    const next2 = parseInt(numStr[i + 2])

    if (next1 === current + 1 && next2 === current + 2) {
      return true
    }
  }
  return false
}

/**
 * Sanitize and normalize user input
 */
export function sanitizeUserData(userData: CreateUserData): CreateUserData {
  return {
    nombre: userData.nombre.trim().replace(/\s+/g, ' '),
    edad: Math.floor(userData.edad),
    dni: Math.floor(userData.dni)
  }
}

/**
 * Get validation suggestions based on field and error
 */
export function getValidationSuggestions(field: keyof CreateUserData): string[] {
  const suggestions: Record<string, string[]> = {
    nombre: [
      'Use solo letras y espacios',
      'Evite números y caracteres especiales',
      'Verifique que el nombre esté completo'
    ],
    edad: [
      'Ingrese solo números enteros',
      'Verifique que la edad sea realista',
      'Use números entre 1 y 120'
    ],
    dni: [
      'Use solo números sin puntos ni espacios',
      'Verifique que tenga entre 7 y 8 dígitos',
      'Asegúrese de que el DNI sea único'
    ]
  }

  return suggestions[field] || ['Verifique que los datos sean correctos']
}
