import { useState, useCallback } from 'react'
import { Notification } from '../components/NotificationSystem'

export interface NotificationOptions {
  type?: Notification['type']
  duration?: number
  persistent?: boolean
}

export interface UseNotificationsReturn {
  notifications: Notification[]
  addNotification: (title: string, message: string, options?: NotificationOptions) => string
  removeNotification: (id: string) => void
  clearAllNotifications: () => void
  addSuccessNotification: (
    title: string,
    message: string,
    options?: Omit<NotificationOptions, 'type'>
  ) => string
  addErrorNotification: (
    title: string,
    message: string,
    options?: Omit<NotificationOptions, 'type'>
  ) => string
  addWarningNotification: (
    title: string,
    message: string,
    options?: Omit<NotificationOptions, 'type'>
  ) => string
  addInfoNotification: (
    title: string,
    message: string,
    options?: Omit<NotificationOptions, 'type'>
  ) => string
}

export const useNotifications = (): UseNotificationsReturn => {
  const [notifications, setNotifications] = useState<Notification[]>([])

  const generateId = useCallback((): string => {
    return `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }, [])

  const addNotification = useCallback(
    (title: string, message: string, options: NotificationOptions = {}): string => {
      const id = generateId()
      const notification: Notification = {
        id,
        title,
        message,
        type: options.type || 'info',
        duration: options.duration,
        persistent: options.persistent
      }

      setNotifications((prev) => [...prev, notification])
      return id
    },
    [generateId]
  )

  const removeNotification = useCallback((id: string): void => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id))
  }, [])

  const clearAllNotifications = useCallback((): void => {
    setNotifications([])
  }, [])

  // Convenience methods for different notification types
  const addSuccessNotification = useCallback(
    (title: string, message: string, options: Omit<NotificationOptions, 'type'> = {}): string => {
      return addNotification(title, message, { ...options, type: 'success' })
    },
    [addNotification]
  )

  const addErrorNotification = useCallback(
    (title: string, message: string, options: Omit<NotificationOptions, 'type'> = {}): string => {
      return addNotification(title, message, { ...options, type: 'error' })
    },
    [addNotification]
  )

  const addWarningNotification = useCallback(
    (title: string, message: string, options: Omit<NotificationOptions, 'type'> = {}): string => {
      return addNotification(title, message, { ...options, type: 'warning' })
    },
    [addNotification]
  )

  const addInfoNotification = useCallback(
    (title: string, message: string, options: Omit<NotificationOptions, 'type'> = {}): string => {
      return addNotification(title, message, { ...options, type: 'info' })
    },
    [addNotification]
  )

  return {
    notifications,
    addNotification,
    removeNotification,
    clearAllNotifications,
    addSuccessNotification,
    addErrorNotification,
    addWarningNotification,
    addInfoNotification
  }
}
