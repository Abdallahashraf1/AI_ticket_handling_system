'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import TicketQueue from '@/components/tickets/TicketQueue'

type QueueTicket = {
  id: string
  subject: string
  status: string
  priority: string | null
  category: string | null
  created_at: string
  sla_deadline?: string | null
  submitter?: { email?: string; full_name?: string } | null
}

type QueueResponse = {
  items: QueueTicket[]
  page: number
  page_size: number
}

export default function AgentTicketQueuePage() {
  const [items, setItems] = useState<QueueTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'queue' | 'handled'>('queue')
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const fetchQueue = useCallback(async (attempt = 1) => {
    const requestId = ++requestIdRef.current
    const startedAt = performance.now()
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const sessionStart = performance.now()
      const { data: { session } } = await supabase.auth.getSession()
      const sessionMs = Math.round(performance.now() - sessionStart)
      if (!session) {
        setItems([])
        setError('No active session. Please sign in again.')
        console.warn(`[agent/tickets] missing session request_id=${requestId} mode=${mode} attempt=${attempt} session_ms=${sessionMs}`)
        return
      }

      const url =
        mode === 'queue'
          ? `/api/proxy/v1/tickets/queue?sort=sla_deadline&page=1&page_size=50`
          : `/api/proxy/v1/tickets?page=1&page_size=100`
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 20000)
      let response: Response
      try {
        const fetchStart = performance.now()
        response = await fetch(url, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal: controller.signal,
        })
        const fetchMs = Math.round(performance.now() - fetchStart)
        console.info(`[agent/tickets] fetch done request_id=${requestId} mode=${mode} attempt=${attempt} status=${response.status} fetch_ms=${fetchMs} session_ms=${sessionMs}`)
      } finally {
        clearTimeout(timeout)
      }

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `Failed to load ${mode} tickets`)
      }

      if (mode === 'queue') {
        const data: QueueResponse = await response.json()
        if (requestId === requestIdRef.current) {
          setItems(data.items)
        }
      } else {
        const data: QueueTicket[] = await response.json()
        const handled = data.filter(
          (ticket) => ['resolved', 'closed'].includes(ticket.status)
        )
        if (requestId === requestIdRef.current) {
          setItems(handled)
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load tickets'
      const isTimeout = msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('timed out')
      console.warn(`[agent/tickets] fetch failed request_id=${requestId} mode=${mode} attempt=${attempt} error=${msg}`)
      if (isTimeout && attempt < 2) {
        setTimeout(() => {
          fetchQueue(attempt + 1)
        }, 500)
        return
      }
      if (requestId === requestIdRef.current) {
        setItems([])
        setError(msg.includes('aborted') ? 'Request timed out. Please retry.' : msg)
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
        const totalMs = Math.round(performance.now() - startedAt)
        console.info(`[agent/tickets] request complete request_id=${requestId} mode=${mode} attempt=${attempt} total_ms=${totalMs}`)
      }
    }
  }, [mode])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchQueue()
  }, [fetchQueue])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('agent-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        fetchQueue()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchQueue])

  const handleClaim = useCallback(async (ticketId: string) => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await fetch(`/api/proxy/v1/tickets/${ticketId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    fetchQueue()
  }, [fetchQueue])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Agent Tickets</h1>
        <p className="text-gray-400 mt-1">
          {mode === 'queue'
            ? 'Triaged, escalated, reopened, and pending review tickets, sorted by SLA urgency.'
            : 'Resolved tickets for review, including AI responses and handling history.'}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setMode('queue')}
          className={`px-3 py-2 rounded-lg text-sm ${mode === 'queue' ? 'bg-white text-black' : 'bg-gray-800 text-gray-300'}`}
        >
          In Queue
        </button>
        <button
          onClick={() => setMode('handled')}
          className={`px-3 py-2 rounded-lg text-sm ${mode === 'handled' ? 'bg-white text-black' : 'bg-gray-800 text-gray-300'}`}
        >
          Handled
        </button>
      </div>
      {error ? (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      ) : null}
      <TicketQueue items={items} loading={loading} onClaim={handleClaim} showClaim={mode === 'queue'} />
    </div>
  )
}
