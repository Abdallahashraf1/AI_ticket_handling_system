'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Props = {
  ticketId: string
  onDone?: () => void
}

export default function TicketFeedback({ ticketId, onDone }: Props) {
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)

  const sendFeedback = async (helpful: boolean) => {
    setLoading(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setLoading(false)
      return
    }

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    await fetch(`${baseUrl}/api/v1/tickets/${ticketId}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ helpful, comment }),
    })
    setLoading(false)
    if (onDone) onDone()
  }

  const reopenTicket = async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setLoading(false)
      return
    }

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    await fetch(`${baseUrl}/api/v1/tickets/${ticketId}/reopen`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ reason: comment || null }),
    })
    setLoading(false)
    if (onDone) onDone()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
      <h4 className="text-sm font-semibold text-gray-900">Was this resolution helpful?</h4>
      <textarea
        rows={3}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional comment or reopen reason..."
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black"
      />
      <div className="flex flex-wrap gap-2">
        <button disabled={loading} onClick={() => sendFeedback(true)} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-50">
          Helpful
        </button>
        <button disabled={loading} onClick={() => sendFeedback(false)} className="px-3 py-2 rounded-lg bg-amber-600 text-white text-sm disabled:opacity-50">
          Not helpful
        </button>
        <button disabled={loading} onClick={reopenTicket} className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-50">
          Reopen ticket
        </button>
      </div>
    </div>
  )
}
