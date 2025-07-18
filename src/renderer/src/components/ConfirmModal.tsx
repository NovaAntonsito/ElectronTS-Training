import React from 'react'
import { ConfirmModalProps } from '../types/components'
import './ConfirmModal.css'

const ConfirmModal: React.FC<ConfirmModalProps> = ({ isOpen, user, onConfirm, onCancel }) => {
  // Handle confirm action
  const handleConfirm = () => {
    onConfirm()
  }

  // Handle cancel action
  const handleCancel = () => {
    onCancel()
  }

  // Handle overlay click (close modal)
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleCancel()
    }
  }

  // Handle escape key
  React.useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleCancel()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey)
      // Focus management for accessibility
      const modalElement = document.querySelector('.confirm-modal-content') as HTMLElement
      if (modalElement) {
        modalElement.focus()
      }
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey)
    }
  }, [isOpen])

  // Don't render if modal is not open
  if (!isOpen) {
    return null
  }

  return (
    <div className="confirm-modal-overlay" onClick={handleOverlayClick}>
      <div
        className="confirm-modal-content"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-description"
      >
        <div className="confirm-modal-header">
          <h3 id="confirm-modal-title" className="confirm-modal-title">
            Confirmar Eliminación
          </h3>
          <button
            className="confirm-modal-close-btn"
            onClick={handleCancel}
            aria-label="Cerrar modal"
          >
            ×
          </button>
        </div>

        <div className="confirm-modal-body">
          <div className="confirm-modal-icon">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="warning-icon"
            >
              <path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>

          <div className="confirm-modal-text">
            <p id="confirm-modal-description" className="confirm-modal-message">
              ¿Está seguro que desea eliminar al usuario{' '}
              <strong className="user-name">{user.nombre}</strong>?
            </p>
            <p className="confirm-modal-warning">Esta acción no se puede deshacer.</p>
          </div>
        </div>

        <div className="confirm-modal-footer">
          <button type="button" className="btn btn-secondary" onClick={handleCancel}>
            Cancelar
          </button>
          <button type="button" className="btn btn-danger" onClick={handleConfirm}>
            Eliminar Usuario
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal
