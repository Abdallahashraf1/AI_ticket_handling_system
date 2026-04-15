'use client'

import React, { useState, useEffect, use } from 'react'
import {
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ShieldAlert,
  Loader2,
  Send,
  Zap,
  Info,
  BrainCircuit,
  Smile,
  Meh,
  Frown,
  Activity,
  ScrollText,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AgentTicketDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [ticket, setTicket] = useState<any>(null)
  const [comments, setComments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()

      const { data: ticketData } = await supabase
        .from('tickets')
        .select('*, submitter:profiles!tickets_submitter_id_fkey(email, full_name)')
        .eq('id', id)
        .single()

      const { data: commentsData } = await supabase
        .from('ticket_comments')
        .select('*, profiles(full_name)')
        .eq('ticket_id', id)
        .order('created_at', { ascending: true })

      if (ticketData) setTicket(ticketData)
      if (commentsData) setComments(commentsData)
      setLoading(false)
    }

    fetchData()
  }, [id, router])

  const handleSendReply = async (isInternal: boolean = false) => {
    if (!reply.trim()) return
    setSubmitting(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      alert('Session expired. Please log in again.')
      setSubmitting(false)
      return
    }

    const { error: commentError } = await supabase
      .from('ticket_comments')
      .insert({
        ticket_id: id,
        author_id: user.id,
        author_type: 'agent',
        body: reply,
        is_internal: isInternal,
      })

    if (commentError) {
      alert(`Failed to save message: ${commentError.message}`)
      setSubmitting(false)
      return
    }

    if (!isInternal) {
      const { error: updateError } = await supabase
        .from('tickets')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (updateError) {
        alert(`Failed to resolve ticket: ${updateError.message}`)
      } else {
        const { data: updatedTicket } = await supabase
          .from('tickets')
          .select('*, submitter:profiles!tickets_submitter_id_fkey(email, full_name)')
          .eq('id', id)
          .single()
        if (updatedTicket) setTicket(updatedTicket)
      }
    }

    setReply('')
    const { data: updatedComments } = await supabase
      .from('ticket_comments')
      .select('*, profiles(full_name)')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true })

    if (updatedComments) setComments(updatedComments)
    setSubmitting(false)
  }

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment?.toLowerCase()) {
      case 'positive': return <Smile className="text-emerald-400" />
      case 'negative': return <Frown className="text-red-400" />
      case 'frustrated': return <Frown className="text-orange-400" />
      default: return <Meh className="text-gray-400" />
    }
  }

  const getUrgencyColor = (score: number) => {
    if (score > 0.8) return 'bg-red-500'
    if (score > 0.5) return 'bg-amber-500'
    return 'bg-blue-500'
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
        <p className="text-gray-500 mt-4 font-bold tracking-widest uppercase text-xs">Decrypting ticket data...</p>
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-white">Ticket Not Found</h2>
        <Link href="/agent/tickets" className="text-blue-400 mt-4 inline-block hover:underline">Return to Queue</Link>
      </div>
    )
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <div className="flex items-center justify-between">
        <Link
          href="/agent/tickets"
          className="flex items-center text-gray-400 hover:text-white transition-colors group"
        >
          <div className="p-2 bg-gray-900 border border-gray-800 rounded-xl mr-3 group-hover:bg-gray-800 transition-all">
            <ChevronLeft size={20} />
          </div>
          <span className="font-bold text-sm uppercase tracking-widest">Back to Queue</span>
        </Link>

        <div className="flex items-center gap-3">
          <div className={`px-4 py-2 rounded-2xl border flex items-center gap-2 ${
            ticket.status === 'resolved' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
          }`}>
            {ticket.status === 'resolved' ? <CheckCircle2 size={16} /> : <Activity size={16} className="animate-pulse" />}
            <span className="text-xs font-bold uppercase tracking-widest">{ticket.status.replace('_', ' ')}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-gray-900 border border-gray-800 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8">
              <ShieldAlert size={40} className="text-gray-800/20" />
            </div>

            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold text-white leading-tight">{ticket.subject}</h1>
                <div className="flex items-center gap-3 mt-4">
                  <div className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center text-blue-400 font-bold">
                    {ticket.submitter?.full_name?.charAt(0) || ticket.submitter?.email?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-200">{ticket.submitter?.full_name || 'Anonymous User'}</span>
                    <span className="text-xs text-gray-500">{ticket.submitter?.email} - {new Date(ticket.created_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-950/50 border border-gray-800 rounded-2xl p-6 text-gray-300 leading-relaxed whitespace-pre-wrap">
                {ticket.body}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-xl font-bold text-white flex items-center px-4">
              <MessageSquare size={20} className="mr-3 text-blue-500" />
              Intelligence Timeline
            </h3>

            <div className="space-y-4">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className={`p-6 rounded-3xl border transition-all duration-300 ${
                    comment.is_internal
                      ? 'bg-amber-500/5 border-amber-500/20 shadow-[0_0_30px_rgba(245,158,11,0.03)]'
                      : comment.author_type === 'ai'
                        ? 'bg-blue-600/5 border-blue-500/20'
                        : 'bg-gray-900 border-gray-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      {comment.author_type === 'ai' ? (
                        <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
                          <Zap size={14} className="text-white" />
                        </div>
                      ) : (
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${comment.is_internal ? 'bg-amber-500' : 'bg-gray-800'}`}>
                          <Users size={14} className="text-white" />
                        </div>
                      )}
                      <span className={`text-xs font-bold uppercase tracking-widest ${
                        comment.author_type === 'ai' ? 'text-blue-400' : comment.is_internal ? 'text-amber-400' : 'text-gray-400'
                      }`}>
                        {comment.author_type === 'ai' ? 'AI Resolution Agent' : comment.is_internal ? 'Internal Note' : (comment.profiles?.full_name || 'Agent')}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-600 font-bold">{new Date(comment.created_at).toLocaleString()}</span>
                  </div>
                  <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap font-medium">
                    {comment.body}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-[2.5rem] p-6 shadow-2xl space-y-4 border-t-4 border-t-blue-600">
              <textarea
                rows={4}
                value={reply}
                onChange={e => setReply(e.target.value)}
                placeholder="Draft your manual response or internal note..."
                className="w-full bg-gray-950 border border-gray-800 rounded-2xl p-4 !text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm placeholder:text-gray-600"
              />
              <div className="flex justify-between items-center">
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSendReply(true)}
                    disabled={submitting || !reply}
                    className="px-6 py-2.5 bg-gray-800 text-amber-500 border border-amber-500/20 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-amber-500/10 transition-all disabled:opacity-50"
                  >
                    Save Internal Note
                  </button>
                </div>

                {ticket.status !== 'resolved' && (
                  <button
                    onClick={() => handleSendReply(false)}
                    disabled={submitting || !reply}
                    className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send size={16} />}
                    Send to Customer
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-gray-900 border border-gray-800 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden group">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-600/10 rounded-full blur-3xl" />

            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center">
              <BrainCircuit size={16} className="mr-2 text-blue-500" />
              AI Intelligence Report
            </h3>

            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 font-bold uppercase">Customer Mood</span>
                  <span className="text-xs font-bold text-white capitalize">{ticket.sentiment || 'Analyzing...'}</span>
                </div>
                <div className="flex items-center gap-3 bg-gray-950/50 p-4 rounded-2xl border border-gray-800">
                  {getSentimentIcon(ticket.sentiment)}
                  <span className="text-sm font-medium text-gray-200">
                    {ticket.sentiment === 'frustrated' ? 'Customer needs immediate attention.'
                      : ticket.sentiment === 'positive' ? 'Customer is receptive and polite.'
                      : 'Standard objective communication.'}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 font-bold uppercase">Urgency Score</span>
                  <span className="text-xs font-bold text-white">{((ticket.urgency_score || 0) * 100).toFixed(0)}%</span>
                </div>
                <div className="h-2 w-full bg-gray-950 rounded-full overflow-hidden border border-gray-800">
                  <div
                    className={`h-full transition-all duration-1000 ${getUrgencyColor(ticket.urgency_score || 0)}`}
                    style={{ width: `${(ticket.urgency_score || 0) * 100}%` }}
                  />
                </div>
              </div>

              <div className="pt-2">
                <span className="text-[10px] text-gray-600 font-bold uppercase block mb-3">Classified Category</span>
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg text-[10px] font-bold uppercase tracking-widest">
                    {ticket.category || 'General'}
                  </span>
                  <span className="px-3 py-1 bg-gray-800 border border-gray-700 text-gray-400 rounded-lg text-[10px] font-bold uppercase tracking-widest">
                    {ticket.subcategory || 'Standard'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-950 border border-gray-800 rounded-[2rem] p-8 shadow-2xl space-y-6">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center">
              <ScrollText size={16} className="mr-2 text-purple-500" />
              Retrieved RAG Evidence
            </h3>

            {ticket.rag_context ? (
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {ticket.rag_context.split('---').map((chunk: string, idx: number) => {
                  const [header, ...contentLines] = chunk.trim().split('\n')
                  return (
                    <div key={idx} className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-purple-400 uppercase tracking-tighter truncate max-w-[200px]">
                          {header.replace('[', '').replace(']', '')}
                        </span>
                        <span className="px-1.5 py-0.5 bg-purple-500/10 rounded text-[8px] text-purple-500 font-bold">SOURCE CHUNK</span>
                      </div>
                      <div className="text-[11px] text-gray-400 leading-relaxed font-mono italic whitespace-pre-wrap">
                        {contentLines.join('\n').trim()}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-6 bg-gray-900/50 rounded-2xl border border-dashed border-gray-800">
                <Info size={16} className="mx-auto text-gray-700 mb-2" />
                <p className="text-xs text-gray-600 font-bold uppercase">No RAG evidence found</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

