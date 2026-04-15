'use client'

import React, { useState, useEffect } from 'react'
import { 
  Search, 
  Filter, 
  MessageSquare, 
  Clock, 
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ShieldAlert,
  Loader2
} from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function AgentTicketQueue() {
  const [tickets, setTickets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchTickets() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('tickets')
        .select(`
          id, 
          subject, 
          status, 
          priority, 
          created_at, 
          category,
          submitter:profiles!tickets_submitter_id_fkey(email)
        `)
        .order('created_at', { ascending: false })

      if (data) setTickets(data)
      setLoading(false)
    }

    fetchTickets()
  }, [])

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500/10 text-red-400 border-red-500/20'
      case 'medium': return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
      default: return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'resolved': return <CheckCircle2 className="w-4 h-4 text-emerald-400" />
      case 'in_progress': return <Clock className="w-4 h-4 text-amber-400" />
      case 'triaged': return <ShieldAlert className="w-4 h-4 text-purple-400" />
      default: return <AlertCircle className="w-4 h-4 text-blue-400" />
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Support Queue</h1>
          <p className="text-gray-400 mt-1">Manage incoming tickets and oversee AI resolutions.</p>
        </div>
        
        <div className="flex bg-gray-900 border border-gray-800 rounded-2xl p-1">
          <button className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold transition-all">My Tickets</button>
          <button className="px-4 py-2 text-gray-500 hover:text-white rounded-xl text-sm font-bold transition-all">Team Queue</button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input 
            type="text"
            placeholder="Search tickets by subject, ID, or customer..."
            className="w-full bg-gray-900 border border-gray-800 rounded-2xl py-3 pl-12 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <button className="flex items-center gap-2 px-6 py-3 bg-gray-900 border border-gray-800 rounded-2xl text-gray-400 hover:text-white transition-all">
          <Filter size={18} />
          Filters
        </button>
      </div>

      {/* Ticket List */}
      <div className="bg-gray-900 border border-gray-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
            <p className="text-gray-500 mt-4 font-medium italic">Syncing queue data...</p>
          </div>
        ) : tickets.length > 0 ? (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-950/50">
                <th className="px-8 py-5 text-xs font-bold text-gray-500 uppercase tracking-widest">Ticket Details</th>
                <th className="px-8 py-5 text-xs font-bold text-gray-500 uppercase tracking-widest">Status</th>
                <th className="px-8 py-5 text-xs font-bold text-gray-500 uppercase tracking-widest">Priority</th>
                <th className="px-8 py-5 text-xs font-bold text-gray-500 uppercase tracking-widest">Category</th>
                <th className="px-8 py-5 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="group hover:bg-gray-800/30 transition-colors cursor-pointer">
                  <td className="px-8 py-6">
                    <div className="space-y-1">
                      <p className="font-bold text-white group-hover:text-blue-400 transition-colors truncate max-w-sm">
                        {ticket.subject}
                      </p>
                      <p className="text-xs text-gray-500">
                        {ticket.submitter?.email} • {new Date(ticket.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(ticket.status)}
                      <span className="text-sm font-medium text-gray-300 capitalize">
                        {ticket.status.replace('_', ' ')}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getPriorityColor(ticket.priority)}`}>
                      {ticket.priority || 'medium'}
                    </span>
                  </td>
                  <td className="px-8 py-6">
                    <div className="text-sm text-gray-400 flex items-center gap-2 italic">
                      <MessageSquare size={14} className="text-gray-600" />
                      {ticket.category || 'General'}
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <Link href={`/agent/tickets/${ticket.id}`} className="inline-flex p-2 bg-gray-800 rounded-xl text-gray-500 group-hover:text-white group-hover:bg-blue-600/20 transition-all">
                      <ChevronRight size={20} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-20">
            <h3 className="text-xl font-bold text-gray-300">All caught up!</h3>
            <p className="text-gray-500 mt-2">There are no tickets in this queue.</p>
          </div>
        )}
      </div>
    </div>
  )
}
