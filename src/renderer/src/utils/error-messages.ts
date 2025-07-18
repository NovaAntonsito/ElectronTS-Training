/**
 * Comprehensive error handling utilities for user-friendly error messages
 */

export interface ErrorContext {
  operation: 'crear' | 'actualizar' | 'eliminar' | 'cargar'
  field?: string
  value?: unknown
}

export interface ProcessedError {
  title: string
  message: string
  type: 'validation' | 'storage' | 'network' | 'unknown'
  recoverable: boolean
  suggestions?: string[]
}

/**
 * Process and categorize errors to provide user-friendly messages
 */
export function processError(error: unknown, context: ErrorContext): ProcessedError {
  if (error instanceof Error) {
    // Handle validation errors
    if (error.name === 'ValidationError') {
      return processValidationError(error, context)
    }

    // Handle storage errors
    if (error.name === 'StorageError') {
      return processStorageError(error, context)
    }

    // Handle network/IPC errors
    if (error.message.includes('IPC') || error.message.includes('invoke')) {
      return processNetworkError(error, context)
    }

    // Handle timeout errors
    if (error.message.includes('timeout')) {
      return processTimeoutError(error, context)
    }
  }

  // Default error handling
  return processUnknownError(error, context)
}

/**
 * Process validation errors with specific field-based messages
 */
function processValidationError(error: Error, context: ErrorContext): ProcessedError {
  const { operation } = context

  // DNI uniqueness error
  if (error.message.includes('DNI') && error.message.includes('existe')) {
    return {
      title: 'DNI Duplicado',
      message:
        'El DNI ingresado ya está registrado en el sistema. Por favor, verifique el número e intente con un DNI diferente.',
      type: 'validation',
      recoverable: true,
      suggestions: [
        'Verifique que el DNI sea correcto',
        'Use un DNI diferente si es un usuario nuevo',
        'Si está editando, asegúrese de no cambiar a un DNI existente'
      ]
    }
  }

  // Name validation errors
  if (error.message.includes('nombre')) {
    let message = 'Error en el campo nombre: '
    const suggestions: string[] = []

    if (error.message.includes('vacío')) {
      message += 'El nombre es obligatorio y no puede estar vacío.'
      suggestions.push('Ingrese un nombre válido')
    } else if (error.message.includes('caracteres')) {
      if (error.message.includes('al menos')) {
        message += 'El nombre debe tener al menos 2 caracteres.'
        suggestions.push('Ingrese un nombre más largo')
      } else {
        message += 'El nombre no puede exceder 100 caracteres.'
        suggestions.push('Acorte el nombre ingresado')
      }
    } else if (error.message.includes('letras')) {
      message += 'El nombre solo puede contener letras y espacios.'
      suggestions.push('Elimine números y caracteres especiales del nombre')
    }

    return {
      title: 'Error de Validación - Nombre',
      message,
      type: 'validation',
      recoverable: true,
      suggestions
    }
  }

  // Age validation errors
  if (error.message.includes('edad')) {
    let message = 'Error en el campo edad: '
    const suggestions: string[] = []

    if (error.message.includes('número')) {
      message += 'La edad debe ser un número válido.'
      suggestions.push('Ingrese solo números para la edad')
    } else if (error.message.includes('mayor a 0')) {
      message += 'La edad debe ser mayor a 0.'
      suggestions.push('Ingrese una edad válida mayor a 0')
    } else if (error.message.includes('120')) {
      message += 'La edad no puede ser mayor a 120 años.'
      suggestions.push('Verifique que la edad sea correcta')
    }

    return {
      title: 'Error de Validación - Edad',
      message,
      type: 'validation',
      recoverable: true,
      suggestions
    }
  }

  // DNI format validation errors
  if (error.message.includes('DNI')) {
    let message = 'Error en el campo DNI: '
    const suggestions: string[] = []

    if (error.message.includes('número')) {
      message += 'El DNI debe ser un número válido.'
      suggestions.push('Ingrese solo números para el DNI')
    } else if (error.message.includes('positivo')) {
      message += 'El DNI debe ser un número positivo.'
      suggestions.push('Ingrese un DNI válido mayor a 0')
    } else if (error.message.includes('dígitos')) {
      message += 'El DNI debe tener entre 7 y 8 dígitos.'
      suggestions.push('Verifique que el DNI tenga el formato correcto')
    }

    return {
      title: 'Error de Validación - DNI',
      message,
      type: 'validation',
      recoverable: true,
      suggestions
    }
  }

  // User not found error
  if (error.message.includes('not found') || error.message.includes('no fue encontrado')) {
    return {
      title: 'Usuario No Encontrado',
      message: `No se pudo ${operation} el usuario porque ya no existe en el sistema. La lista se actualizará automáticamente.`,
      type: 'validation',
      recoverable: false,
      suggestions: [
        'La página se actualizará automáticamente',
        'Intente la operación con otro usuario'
      ]
    }
  }

  // Generic validation error
  return {
    title: 'Error de Validación',
    message: `Los datos ingresados no son válidos para ${operation} el usuario. ${error.message}`,
    type: 'validation',
    recoverable: true,
    suggestions: [
      'Verifique que todos los campos estén completos',
      'Asegúrese de que los datos tengan el formato correcto'
    ]
  }
}

/**
 * Process storage errors with recovery suggestions
 */
function processStorageError(error: Error, context: ErrorContext): ProcessedError {
  const { operation } = context

  if (error.message.includes('CORRUPTED_FILE') || error.message.includes('corrupto')) {
    return {
      title: 'Archivo de Datos Corrupto',
      message:
        'El archivo de datos está dañado. Se intentará recuperar desde el respaldo automático.',
      type: 'storage',
      recoverable: true,
      suggestions: [
        'La aplicación intentará recuperar los datos automáticamente',
        'Si el problema persiste, reinicie la aplicación',
        'Contacte al soporte técnico si continúa el error'
      ]
    }
  }

  if (error.message.includes('BACKUP_ERROR')) {
    return {
      title: 'Error de Respaldo',
      message: `No se pudo crear un respaldo de seguridad antes de ${operation} el usuario. La operación se canceló por seguridad.`,
      type: 'storage',
      recoverable: true,
      suggestions: [
        'Intente la operación nuevamente',
        'Verifique que tenga permisos de escritura',
        'Reinicie la aplicación si el problema persiste'
      ]
    }
  }

  if (error.message.includes('SAVE_ERROR')) {
    return {
      title: 'Error al Guardar',
      message: `No se pudieron guardar los cambios al ${operation} el usuario. Verifique los permisos de escritura.`,
      type: 'storage',
      recoverable: true,
      suggestions: [
        'Verifique que tenga permisos de escritura en el directorio',
        'Asegúrese de que hay espacio suficiente en disco',
        'Intente cerrar otros programas y reintentar'
      ]
    }
  }

  if (error.message.includes('LOAD_ERROR')) {
    return {
      title: 'Error al Cargar Datos',
      message:
        'No se pudieron cargar los datos de usuarios. El archivo puede estar dañado o inaccesible.',
      type: 'storage',
      recoverable: true,
      suggestions: [
        'Intente reiniciar la aplicación',
        'Verifique que el archivo de datos no esté siendo usado por otro programa',
        'Contacte al soporte técnico si el problema persiste'
      ]
    }
  }

  if (error.message.includes('RECOVERY_FAILED')) {
    return {
      title: 'Error Crítico de Datos',
      message:
        'No se pudieron recuperar los datos ni desde el archivo principal ni desde el respaldo. Se iniciará con datos vacíos.',
      type: 'storage',
      recoverable: false,
      suggestions: [
        'Los datos anteriores pueden haberse perdido',
        'Contacte al soporte técnico inmediatamente',
        'Verifique si tiene respaldos externos de los datos'
      ]
    }
  }

  // Generic storage error
  return {
    title: 'Error de Almacenamiento',
    message: `Error al acceder a los datos para ${operation} el usuario. ${error.message}`,
    type: 'storage',
    recoverable: true,
    suggestions: [
      'Intente la operación nuevamente',
      'Reinicie la aplicación si el problema persiste',
      'Verifique los permisos de archivo'
    ]
  }
}

/**
 * Process network/IPC communication errors
 */
function processNetworkError(_error: Error, context: ErrorContext): ProcessedError {
  const { operation } = context

  return {
    title: 'Error de Comunicación',
    message: `Error de comunicación interna al ${operation} el usuario. La aplicación puede necesitar reiniciarse.`,
    type: 'network',
    recoverable: true,
    suggestions: [
      'Intente la operación nuevamente',
      'Reinicie la aplicación si el problema persiste',
      'Verifique que no haya otros procesos interfiriendo'
    ]
  }
}

/**
 * Process timeout errors
 */
function processTimeoutError(_error: Error, context: ErrorContext): ProcessedError {
  const { operation } = context

  return {
    title: 'Tiempo de Espera Agotado',
    message: `La operación para ${operation} el usuario tardó demasiado tiempo. Esto puede deberse a un problema temporal.`,
    type: 'network',
    recoverable: true,
    suggestions: [
      'Intente la operación nuevamente',
      'Verifique que el sistema no esté sobrecargado',
      'Reinicie la aplicación si el problema persiste'
    ]
  }
}

/**
 * Process unknown errors
 */
function processUnknownError(error: unknown, context: ErrorContext): ProcessedError {
  const { operation } = context
  const errorMessage = error instanceof Error ? error.message : 'Error desconocido'

  return {
    title: 'Error Inesperado',
    message: `Ha ocurrido un error inesperado al ${operation} el usuario: ${errorMessage}`,
    type: 'unknown',
    recoverable: true,
    suggestions: [
      'Intente la operación nuevamente',
      'Reinicie la aplicación si el problema persiste',
      'Contacte al soporte técnico si continúa el error'
    ]
  }
}

/**
 * Get operation-specific success messages
 */
export function getSuccessMessage(
  operation: ErrorContext['operation'],
  userName?: string
): { title: string; message: string } {
  const name = userName ? `"${userName}"` : ''

  switch (operation) {
    case 'crear':
      return {
        title: 'Usuario Creado',
        message: `El usuario ${name} ha sido creado exitosamente.`
      }
    case 'actualizar':
      return {
        title: 'Usuario Actualizado',
        message: `El usuario ${name} ha sido actualizado exitosamente.`
      }
    case 'eliminar':
      return {
        title: 'Usuario Eliminado',
        message: `El usuario ${name} ha sido eliminado exitosamente.`
      }
    case 'cargar':
      return {
        title: 'Datos Cargados',
        message: 'Los datos de usuarios han sido cargados exitosamente.'
      }
    default:
      return {
        title: 'Operación Exitosa',
        message: 'La operación se ha completado exitosamente.'
      }
  }
}
