import React, { useState, useEffect } from 'react'
import { UserModalProps } from '../types/components'
import { CreateUserData } from '../types/user'
import { validateField, validateUserData } from '../utils/validation'
import './UserModal.css'

const UserModal: React.FC<UserModalProps> = ({ mode, user, users, isOpen, onSave, onCancel }) => {
  // Form state
  const [formData, setFormData] = useState<CreateUserData>({
    nombre: '',
    edad: 0,
    dni: 0
  })

  // Validation and UI state
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [warnings, setWarnings] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  // Initialize form data when modal opens or user changes
  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && user) {
        setFormData({
          nombre: user.nombre,
          edad: user.edad,
          dni: user.dni
        })
      } else {
        setFormData({
          nombre: '',
          edad: 0,
          dni: 0
        })
      }
      setErrors({})
      setWarnings({})
      setTouched({})
      setIsSubmitting(false)
    }
  }, [isOpen, mode, user])

  // Handle input changes with real-time validation
  const handleInputChange = (field: keyof CreateUserData, value: string): void => {
    let processedValue: string | number = value

    // Convert to number for edad and dni
    if (field === 'edad' || field === 'dni') {
      processedValue = value === '' ? 0 : Number(value)
    }

    setFormData((prev) => ({
      ...prev,
      [field]: processedValue
    }))

    // Real-time validation if field has been touched
    if (touched[field]) {
      validateSingleField(field, processedValue)
    }
  }

  // Validate a single field with context
  const validateSingleField = (field: keyof CreateUserData, value: string | number): void => {
    const existingDNIs = users.map((u) => u.dni)
    const currentUserDNI = mode === 'edit' && user ? user.dni : undefined

    const result = validateField(field, value, { existingDNIs, currentUserDNI })

    setErrors((prev) => ({
      ...prev,
      [field]: result.isValid ? '' : result.error || ''
    }))

    setWarnings((prev) => ({
      ...prev,
      [field]: result.warning || ''
    }))
  }

  // Handle field blur (mark as touched and validate)
  const handleFieldBlur = (field: keyof CreateUserData): void => {
    setTouched((prev) => ({
      ...prev,
      [field]: true
    }))

    validateSingleField(field, formData[field])
  }

  // Validate all fields
  const validateForm = (): boolean => {
    const existingDNIs = users.map((u) => u.dni)
    const currentUserDNI = mode === 'edit' && user ? user.dni : undefined

    const validationResult = validateUserData(formData, { existingDNIs, currentUserDNI })

    setErrors(validationResult.errors)
    setWarnings(validationResult.warnings || {})
    setTouched({
      nombre: true,
      edad: true,
      dni: true
    })

    return validationResult.isValid
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)

    try {
      await onSave(formData)
    } catch (error) {
      console.error('Error saving user:', error)
      // The parent component should handle the error display
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle cancel
  const handleCancel = (): void => {
    if (!isSubmitting) {
      onCancel()
    }
  }

  // Don't render if modal is not open
  if (!isOpen) {
    return null
  }

  const modalTitle = mode === 'create' ? 'Agregar Usuario' : 'Editar Usuario'
  const submitButtonText = mode === 'create' ? 'Crear Usuario' : 'Guardar Cambios'

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{modalTitle}</h3>
          <button
            className="modal-close-btn"
            onClick={handleCancel}
            disabled={isSubmitting}
            aria-label="Cerrar modal"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label htmlFor="nombre" className="form-label">
              Nombre *
            </label>
            <input
              id="nombre"
              type="text"
              className={`form-input ${errors.nombre ? 'form-input-error' : ''}`}
              value={formData.nombre}
              onChange={(e) => handleInputChange('nombre', e.target.value)}
              onBlur={() => handleFieldBlur('nombre')}
              disabled={isSubmitting}
              placeholder="Ingrese el nombre completo"
              maxLength={100}
            />
            {errors.nombre && <span className="form-error">{errors.nombre}</span>}
            {warnings.nombre && <span className="form-warning">{warnings.nombre}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="edad" className="form-label">
              Edad *
            </label>
            <input
              id="edad"
              type="number"
              className={`form-input ${errors.edad ? 'form-input-error' : ''}`}
              value={formData.edad || ''}
              onChange={(e) => handleInputChange('edad', e.target.value)}
              onBlur={() => handleFieldBlur('edad')}
              disabled={isSubmitting}
              placeholder="Ingrese la edad"
              min="1"
              max="120"
            />
            {errors.edad && <span className="form-error">{errors.edad}</span>}
            {warnings.edad && <span className="form-warning">{warnings.edad}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="dni" className="form-label">
              DNI *
            </label>
            <input
              id="dni"
              type="number"
              className={`form-input ${errors.dni ? 'form-input-error' : ''}`}
              value={formData.dni || ''}
              onChange={(e) => handleInputChange('dni', e.target.value)}
              onBlur={() => handleFieldBlur('dni')}
              disabled={isSubmitting}
              placeholder="Ingrese el DNI"
              min="1000000"
              max="99999999"
            />
            {errors.dni && <span className="form-error">{errors.dni}</span>}
            {warnings.dni && <span className="form-warning">{warnings.dni}</span>}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : submitButtonText}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default UserModal
