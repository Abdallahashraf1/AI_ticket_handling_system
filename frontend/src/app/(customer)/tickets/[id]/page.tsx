'use client'

import Link from 'next/link'
import { use, useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import LiveTicketStatus from '@/components/tickets/LiveTicketStatus'
import TicketFeedback from '@/components/tickets/TicketFeedback'

type CustomerTicketDetail = {
  id: string
  subject: string
  status: string
  category?: string | null
  priority?: string | null
  body: string
  final_response?: string | null
}

type TicketComment = {
  id: string
  body: string
  author_type: string
  created_at: string
  profiles?: { full_name?: string } | null
}

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [ticket, setTicket] = useState<CustomerTicketDetail | null>(null)
  const [comments, setComments] = useState<TicketComment[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTicket = useCallback(async () => {
    const supabase = createClient()
    const { data: ticketData } = await supabase.from('tickets').select('*').eq('id', id).single()
    const { data: commentsData } = await supabase
      .from('ticket_comments')
      .select('*, profiles(full_name)')
      .eq('ticket_id', id)
      .eq('is_internal', false)
      .order('created_at', { ascending: true })

    setTicket(ticketData)
    setComments(commentsData || [])
    setLoading(false)
  }, [id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTicket()
  }, [fetchTicket])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`ticket-detail-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets', filter: `id=eq.${id}` }, () => {
        fetchTicket()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_comments', filter: `ticket_id=eq.${id}` }, () => {
        fetchTicket()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [id, fetchTicket])

  if (loading) return <div>Loading ticket...</div>
  if (!ticket) return <div>Ticket not found.</div>

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/tickets" className="text-sm font-medium text-gray-500 hover:text-gray-900">&larr; Back to Tickets</Link>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl">
        <div className="px-5 py-4 flex justify-between items-center border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{ticket.subject}</h2>
            <p className="text-sm text-gray-500 mt-1">Ticket ID: {ticket.id}</p>
          </div>
          <LiveTicketStatus ticketId={ticket.id} initialStatus={ticket.status} />
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="text-sm text-gray-700">
            <span className="font-medium">Category:</span> {ticket.category || 'General'} · {ticket.priority || 'medium'} priority
          </div>
          <div className="text-sm text-gray-800 whitespace-pre-wrap">{ticket.body}</div>
          {ticket.final_response ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <div className="text-xs font-semibold text-emerald-700 mb-1">Resolution</div>
              <div className="text-sm text-emerald-900 whitespace-pre-wrap">{ticket.final_response}</div>
            </div>
          ) : null}
        </div>
      </div>

      {(ticket.status === 'resolved' || ticket.status === 'closed') ? (
        <TicketFeedback ticketId={ticket.id} onDone={fetchTicket} />
      ) : null}

      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Timeline</h3>
        {comments.length > 0 ? (
          comments.map((comment) => (
            <div key={comment.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">
                {comment.author_type === 'ai' ? 'AI Assistant' : comment.profiles?.full_name || 'Support'} · {new Date(comment.created_at).toLocaleString()}
              </div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap">{comment.body}</div>
            </div>
          ))
        ) : (
          <p className="text-sm text-gray-500">No replies yet.</p>
        )}
      </div>
    </div>
  )
}
