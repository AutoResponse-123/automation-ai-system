import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'notifications_enabled'

export interface UseNotificationsReturn {
  permission: NotificationPermission
  enabled: boolean
  setEnabled: (val: boolean) => void
  requestPermission: () => Promise<NotificationPermission>
  sendNotification: (title: string, options?: NotificationOptions) => void
  isSupported: boolean
}

export function useNotifications(): UseNotificationsReturn {
  const isSupported = typeof window !== 'undefined' && 'Notification' in window

  const [permission, setPermission] = useState<NotificationPermission>(
    isSupported ? Notification.permission : 'denied'
  )

  const [enabled, setEnabledState] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true' } catch { return false }
  })

  useEffect(() => {
    if (!isSupported) return
    setPermission(Notification.permission)
  }, [isSupported])

  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (!isSupported) return 'denied'
    const result = await Notification.requestPermission()
    setPermission(result)
    return result
  }, [isSupported])

  const setEnabled = useCallback(async (val: boolean) => {
    if (val && permission !== 'granted') {
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result !== 'granted') return
    }
    setEnabledState(val)
    try { localStorage.setItem(STORAGE_KEY, String(val)) } catch { /* ignore */ }
  }, [permission])

  const sendNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (!isSupported || !enabled || permission !== 'granted') return
    try {
      new Notification(title, { icon: '/favicon.ico', badge: '/favicon.ico', ...options })
    } catch { /* algunos browsers bloquean sin foco */ }
  }, [isSupported, enabled, permission])

  return { permission, enabled, setEnabled, requestPermission, sendNotification, isSupported }
}
