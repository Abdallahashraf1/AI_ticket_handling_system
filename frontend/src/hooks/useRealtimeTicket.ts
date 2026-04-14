import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useRealtimeTicket(ticketId: string) {
  const [ticketStatus, setTicketStatus] = useState<string | null>(null)
  
  useEffect(() => {
    if (!ticketId) return
    
    const supabase = createClient()
    
    // Subscribe to ticket changes
    const ticketSubscription = supabase
      .channel(`ticket-${ticketId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tickets', filter: `id=eq.${ticketId}` },
        (payload) => {
          setTicketStatus(payload.new.status)
        }
      )
      .subscribe()
      
    return () => {
      supabase.removeChannel(ticketSubscription)
    }
  }, [ticketId])
  
  return { ticketStatus }
}
