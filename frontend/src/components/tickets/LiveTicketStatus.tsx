'use client'

import { useRealtimeTicket } from '@/hooks/useRealtimeTicket'

export default function LiveTicketStatus({ ticketId, initialStatus }: { ticketId: string, initialStatus: string }) {
  const { ticketStatus } = useRealtimeTicket(ticketId)
  
  const displayStatus = ticketStatus || initialStatus
  
  const statusColor = (displayStatus === 'resolved' || displayStatus === 'closed') 
      ? 'bg-green-100 text-green-800' 
      : (displayStatus === 'escalated' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800')

  return (
    <span className={`px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full ${statusColor}`}>
      {displayStatus}
    </span>
  )
}
