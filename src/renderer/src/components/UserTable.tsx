import React from 'react'
import { UserTableProps } from '../types/components'
import './UserTable.css'

const UserTable: React.FC<UserTableProps> = ({ users, onCreateUser, onEditUser, onDeleteUser }) => {
  return (
    <div className="user-table-container">
      <div className="user-table-header">
        <h2>Gestión de Usuarios</h2>
        <button className="btn btn-primary" onClick={onCreateUser}>
          Agregar Usuario
        </button>
      </div>

      {users.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-content">
            <h3>No hay usuarios registrados</h3>
            <p>Comienza agregando tu primer usuario haciendo clic en "Agregar Usuario"</p>
          </div>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="user-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Edad</th>
                <th>DNI</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.nombre}</td>
                  <td>{user.edad}</td>
                  <td>{user.dni.toLocaleString()}</td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => onEditUser(user)}
                        title="Editar usuario"
                      >
                        Editar
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => onDeleteUser(user)}
                        title="Eliminar usuario"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default UserTable
