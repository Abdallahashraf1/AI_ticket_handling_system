'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type NotificationItem = {
  id: string
  type: string
  title: string
  body: string | null
  ticket_id: string | null
  action_url: string | null
  is_read: boolean
  created_at: string
}

type NotificationResponse = {
  items: NotificationItem[]
  unread_count: number
}

export function useNotifications() {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchNotifications = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setLoading(false)
      return
    }

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    const response = await fetch(`${baseUrl}/api/v1/notifications?limit=20&offset=0`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })
    if (!response.ok) {
      setLoading(false)
      return
    }

    const data: NotificationResponse = await response.json()
    setItems(data.items)
    setUnreadCount(data.unread_count)
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNotifications()
  }, [fetchNotifications])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('notifications-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        () => {
          fetchNotifications()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchNotifications])

  const markRead = useCallback(async (notificationId: string) => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    await fetch(`${baseUrl}/api/v1/notifications/${notificationId}/read`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })
    fetchNotifications()
  }, [fetchNotifications])

  return useMemo(
    () => ({ items, unreadCount, loading, markRead, refresh: fetchNotifications }),
    [items, unreadCount, loading, markRead, fetchNotifications]
  )
}
