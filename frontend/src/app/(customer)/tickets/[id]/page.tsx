import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import LiveTicketStatus from '@/components/tickets/LiveTicketStatus'


export default async function TicketDetail({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return null

  const { id } = await params

  const { data: ticket, error } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !ticket) {
    notFound()
  }

  const { data: comments } = await supabase
    .from('ticket_comments')
    .select('*, profiles(full_name)')
    .eq('ticket_id', id)
    .eq('is_internal', false)
    .order('created_at', { ascending: true })

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/tickets" className="text-sm font-medium text-gray-500 hover:text-gray-900">
          &larr; Back to Tickets
        </Link>
      </div>

      <div className="bg-white border shadow-sm sm:rounded-lg mb-8">
        <div className="px-4 py-5 sm:px-6 flex justify-between items-center bg-gray-50 border-b border-gray-200">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              {ticket.subject}
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Ticket ID: {ticket.id}
            </p>
          </div>
          <div>
            <LiveTicketStatus ticketId={ticket.id} initialStatus={ticket.status} />
          </div>
        </div>
        <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
          <dl className="sm:divide-y sm:divide-gray-200">
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Category & Priority</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                {ticket.category || 'General'} • {ticket.priority} priority
              </dd>
            </div>
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Description</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 whitespace-pre-wrap">
                {ticket.body}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="space-y-6">
        <h4 className="text-lg font-medium text-gray-900">Conversation</h4>
        
        {comments && comments.length > 0 ? (
          comments.map(comment => (
            <div key={comment.id} className={`bg-white border shadow-sm sm:rounded-lg p-4 ${comment.author_type === 'ai' || comment.author_type === 'agent' ? 'border-indigo-200 bg-indigo-50' : 'border-gray-200'}`}>
              <div className="flex items-center mb-2">
                <span className="font-medium text-sm text-gray-900">
                  {comment.author_type === 'ai' ? 'AI Assistant' : (comment.profiles?.full_name || 'Support')}
                </span>
                <span className="ml-2 text-xs text-gray-500">
                  {new Date(comment.created_at).toLocaleString()}
                </span>
              </div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap">
                {comment.body}
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">No replies yet.</p>
        )}
      </div>
    </div>
  )
}
