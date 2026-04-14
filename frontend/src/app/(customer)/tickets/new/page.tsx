'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function NewTicket() {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      setLoading(false)
      return
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          subject,
          body
        })
      })

      if (!response.ok) {
        throw new Error('Failed to create ticket via API')
      }

      router.push('/tickets')
      router.refresh()
    } catch (err) {
      console.error('Submission error:', err)
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href="/tickets" className="text-sm font-medium text-gray-500 hover:text-gray-900">
          &larr; Back to Tickets
        </Link>
      </div>
      
      <div className="bg-white border shadow-sm sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Submit a New Ticket</h3>
          <form className="mt-5 space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-gray-700">Subject</label>
              <input type="text" required value={subject} onChange={e => setSubject(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border px-3 py-2 sm:text-sm focus:ring-black focus:border-black" placeholder="Brief summary of your issue" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <textarea rows={5} required value={body} onChange={e => setBody(e.target.value)} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 border px-3 py-2 rounded-md focus:ring-black focus:border-black" placeholder="Provide as much detail as possible..." />
            </div>

            <div className="flex justify-end">
              <button type="submit" disabled={loading} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-black hover:bg-gray-800 focus:outline-none disabled:opacity-50">
                {loading ? 'Submitting...' : 'Submit Ticket'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
