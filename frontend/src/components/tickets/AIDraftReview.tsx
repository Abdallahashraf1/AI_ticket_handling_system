'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Props = {
  ticketId: string
  aiDraft: string
  subject: string
  body: string
  escalationReason?: string | null
  onDone: () => void
}

export default function AIDraftReview({ ticketId, aiDraft, subject, body, escalationReason, onDone }: Props) {
  const [draftText, setDraftText] = useState(aiDraft || '')
  const [rejectFeedback, setRejectFeedback] = useState('')
  const [loading, setLoading] = useState(false)

  const baseUrl = useMemo(() => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000', [])

  const runAction = async (path: string, payload?: Record<string, unknown>) => {
    setLoading(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setLoading(false)
      return
    }

    await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: payload ? JSON.stringify(payload) : undefined,
    })
    setLoading(false)
    onDone()
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-xl font-semibold text-white">Original Ticket</h2>
        <div>
          <div className="text-sm text-gray-400">Subject</div>
          <div className="text-base text-white">{subject}</div>
        </div>
        <div>
          <div className="text-sm text-gray-400">Message</div>
          <div className="text-sm text-gray-200 whitespace-pre-wrap">{body}</div>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-xl font-semibold text-white">AI Draft Review</h2>
        {escalationReason ? (
          <div className="text-sm text-gray-300 bg-gray-950 border border-gray-800 rounded-xl p-3">
            <div className="font-semibold text-gray-100 mb-1">Why escalated</div>
            {escalationReason}
          </div>
        ) : null}
        <textarea
          rows={10}
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-sm text-gray-100"
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <button disabled={loading} onClick={() => runAction(`/api/v1/tickets/${ticketId}/approve`)} className="px-3 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50">
            Approve & Send
          </button>
          <button
            disabled={loading || !draftText.trim()}
            onClick={() => runAction(`/api/v1/tickets/${ticketId}/edit-resolve`, { final_response: draftText })}
            className="px-3 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50"
          >
            Edit & Send
          </button>
          <button
            disabled={loading || !rejectFeedback.trim()}
            onClick={() => runAction(`/api/v1/tickets/${ticketId}/reject`, { feedback: rejectFeedback, retry: true })}
            className="px-3 py-2 rounded-lg bg-red-600 text-white disabled:opacity-50"
          >
            Reject Draft
          </button>
        </div>
        <textarea
          rows={3}
          placeholder="Required feedback when rejecting draft..."
          value={rejectFeedback}
          onChange={(e) => setRejectFeedback(e.target.value)}
          className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-sm text-gray-100"
        />
      </div>
    </div>
  )
}

