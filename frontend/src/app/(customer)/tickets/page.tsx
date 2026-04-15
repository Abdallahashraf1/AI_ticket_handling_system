'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type CustomerTicket = {
  id: string
  subject: string
  status: string
  category?: string | null
  priority?: string | null
  created_at: string
}

export default function TicketsListPage() {
  const [tickets, setTickets] = useState<CustomerTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const fetchTickets = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setLoading(false)
      return
    }

    const params = new URLSearchParams({
      page: String(page),
      page_size: '10',
    })
    if (search) params.set('search', search)
    if (status) params.set('status', status)

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    const response = await fetch(`${baseUrl}/api/v1/tickets?${params.toString()}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (response.ok) {
      setTickets(await response.json())
    }
    setLoading(false)
  }, [page, search, status])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTickets()
  }, [fetchTickets])

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">My Tickets</h1>
        <Link href="/tickets/new" className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white bg-black hover:bg-gray-800">
          <Plus className="mr-2 h-4 w-4" />
          New Ticket
        </Link>
      </div>

      <div className="flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tickets..."
          className="w-full md:w-80 border border-gray-300 rounded-lg px-3 py-2 text-sm text-black"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-black">
          <option value="">All statuses</option>
          <option value="new">New</option>
          <option value="escalated">Escalated</option>
          <option value="pending_review">Pending review</option>
          <option value="resolved">Resolved</option>
          <option value="reopened">Reopened</option>
        </select>
        <button onClick={() => fetchTickets()} className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm">Apply</button>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="px-6 py-10 text-center text-gray-500">Loading...</div>
        ) : tickets.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-500">No tickets found.</div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link href={`/tickets/${ticket.id}`} className="block hover:bg-gray-50 px-5 py-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900">{ticket.subject}</p>
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700 capitalize">{ticket.status.replace('_', ' ')}</span>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    {ticket.category || 'General'} · {ticket.priority || 'medium'} · {new Date(ticket.created_at).toLocaleString()}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm"
        >
          Prev
        </button>
        <span className="text-sm text-gray-600">Page {page}</span>
        <button onClick={() => setPage((p) => p + 1)} className="px-3 py-2 rounded-lg border border-gray-300 text-sm">
          Next
        </button>
      </div>
    </div>
  )
}
