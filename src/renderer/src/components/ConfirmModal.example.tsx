// Example usage of ConfirmModal component
// This file demonstrates how to use the ConfirmModal component

import React, { useState } from 'react'
import ConfirmModal from './ConfirmModal'
import { User } from '../types/user'

const ConfirmModalExample: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Example user data
  const exampleUser: User = {
    id: '1',
    nombre: 'Juan Pérez',
    edad: 30,
    dni: 12345678
  }

  const handleConfirm = () => {
    console.log('User deletion confirmed for:', exampleUser.nombre)
    setIsModalOpen(false)
    // Here you would typically call the actual delete function
  }

  const handleCancel = () => {
    console.log('User deletion cancelled')
    setIsModalOpen(false)
  }

  return (
    <div>
      <button onClick={() => setIsModalOpen(true)}>Delete User Example</button>

      <ConfirmModal
        isOpen={isModalOpen}
        user={exampleUser}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  )
}

export default ConfirmModalExample
