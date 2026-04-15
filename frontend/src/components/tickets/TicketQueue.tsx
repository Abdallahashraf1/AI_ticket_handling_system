'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

type TicketItem = {
  id: string
  subject: string
  status: string
  priority: string | null
  category: string | null
  created_at: string
  sla_deadline?: string | null
  submitter?: { email?: string; full_name?: string } | null
}

type QueueProps = {
  items: TicketItem[]
  loading: boolean
  onClaim: (ticketId: string) => Promise<void>
  showClaim?: boolean
}

export default function TicketQueue({ items, loading, onClaim, showClaim = true }: QueueProps) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')

  const filtered = useMemo(() => {
    return items.filter((ticket) => {
      const statusOk = statusFilter === 'all' || ticket.status === statusFilter
      const priorityOk = priorityFilter === 'all' || (ticket.priority || 'low') === priorityFilter
      return statusOk && priorityOk
    })
  }, [items, statusFilter, priorityFilter])

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-700 bg-gray-900 text-sm text-gray-200">
          <option value="all">All statuses</option>
          <option value="escalated">Escalated</option>
          <option value="pending_review">Pending review</option>
          <option value="reopened">Reopened</option>
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-700 bg-gray-900 text-sm text-gray-200">
          <option value="all">All priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="px-5 py-10 text-center text-gray-500">Loading queue...</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-500">No tickets in queue.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-950 text-gray-400">
              <tr>
                <th className="text-left px-4 py-3">Ticket</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Priority</th>
                <th className="text-left px-4 py-3">SLA</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ticket) => (
                <tr key={ticket.id} className="border-t border-gray-800">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-100">{ticket.subject}</div>
                    <div className="text-xs text-gray-500">{ticket.submitter?.email || 'Unknown customer'}</div>
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-300">{ticket.status.replace('_', ' ')}</td>
                  <td className="px-4 py-3 text-gray-300">{ticket.priority || 'medium'}</td>
                  <td className="px-4 py-3 text-gray-400">{ticket.sla_deadline ? new Date(ticket.sla_deadline).toLocaleString() : '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {showClaim ? (
                        <button onClick={() => onClaim(ticket.id)} className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-200 hover:bg-gray-800">
                          Claim
                        </button>
                      ) : null}
                      <Link href={`/agent/tickets/${ticket.id}`} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                        Open
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
