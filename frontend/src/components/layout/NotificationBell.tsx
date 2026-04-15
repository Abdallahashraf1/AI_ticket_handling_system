'use client'

import Link from 'next/link'
import { Bell } from 'lucide-react'
import { useNotifications } from '@/hooks/useNotifications'
import { useState } from 'react'

export default function NotificationBell() {
  const { items, unreadCount, loading, markRead } = useNotifications()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-xl border border-gray-700 bg-gray-900 text-gray-200 hover:bg-gray-800"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 max-h-[28rem] overflow-auto bg-gray-900 border border-gray-800 rounded-2xl shadow-xl z-50">
          <div className="px-4 py-3 border-b border-gray-800 font-semibold text-gray-100">Notifications</div>
          {loading ? (
            <div className="px-4 py-6 text-sm text-gray-500">Loading...</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-500">No notifications</div>
          ) : (
            items.map((item) => (
              <div key={item.id} className={`px-4 py-3 border-b border-gray-800 ${item.is_read ? 'bg-gray-900' : 'bg-blue-500/10'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-gray-100">{item.title}</div>
                    {item.body ? <div className="text-xs text-gray-400">{item.body}</div> : null}
                    <div className="text-[11px] text-gray-500">{new Date(item.created_at).toLocaleString()}</div>
                    {item.action_url ? (
                      <Link href={item.action_url} className="text-xs text-blue-400 hover:underline" onClick={() => setOpen(false)}>
                        Open
                      </Link>
                    ) : null}
                  </div>
                  {!item.is_read ? (
                    <button
                      type="button"
                      onClick={() => markRead(item.id)}
                      className="text-xs text-gray-400 hover:text-gray-200"
                    >
                      Mark read
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
