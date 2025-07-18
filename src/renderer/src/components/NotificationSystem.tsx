import React, { useState, useEffect, useCallback } from 'react'
import './NotificationSystem.css'

export interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message: string
  duration?: number
  persistent?: boolean
}

interface NotificationSystemProps {
  notifications: Notification[]
  onRemove: (id: string) => void
}

const NotificationSystem: React.FC<NotificationSystemProps> = ({ notifications, onRemove }) => {
  const [visibleNotifications, setVisibleNotifications] = useState<Notification[]>([])

  // Update visible notifications when props change
  useEffect(() => {
    setVisibleNotifications(notifications)
  }, [notifications])

  // Auto-remove notifications after duration
  useEffect(() => {
    const timers: NodeJS.Timeout[] = []

    visibleNotifications.forEach((notification) => {
      if (!notification.persistent) {
        const duration = notification.duration || 5000
        const timer = setTimeout(() => {
          onRemove(notification.id)
        }, duration)
        timers.push(timer)
      }
    })

    return () => {
      timers.forEach((timer) => clearTimeout(timer))
    }
  }, [visibleNotifications, onRemove])

  const handleClose = useCallback(
    (id: string) => {
      onRemove(id)
    },
    [onRemove]
  )

  const getIcon = (type: Notification['type']): string => {
    switch (type) {
      case 'success':
        return '✓'
      case 'error':
        return '✕'
      case 'warning':
        return '⚠'
      case 'info':
        return 'ℹ'
      default:
        return 'ℹ'
    }
  }

  if (visibleNotifications.length === 0) {
    return null
  }

  return (
    <div className="notification-system">
      {visibleNotifications.map((notification) => (
        <div
          key={notification.id}
          className={`notification notification-${notification.type}`}
          role="alert"
          aria-live="polite"
        >
          <div className="notification-icon">{getIcon(notification.type)}</div>
          <div className="notification-content">
            <div className="notification-title">{notification.title}</div>
            <div className="notification-message">{notification.message}</div>
          </div>
          <button
            className="notification-close"
            onClick={() => handleClose(notification.id)}
            aria-label="Cerrar notificación"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

export default NotificationSystem
