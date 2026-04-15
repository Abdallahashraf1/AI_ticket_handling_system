'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'application/pdf']
const MAX_FILE_BYTES = 10 * 1024 * 1024

export default function NewTicketPage() {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<FileList | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const router = useRouter()

  const uploadAttachments = async (userId: string) => {
    if (!files?.length) return []
    const supabase = createClient()
    const uploadedPaths: string[] = []

    for (const file of Array.from(files)) {
      if (!ALLOWED_MIME_TYPES.includes(file.type)) throw new Error(`Unsupported file type: ${file.name}`)
      if (file.size > MAX_FILE_BYTES) throw new Error(`File too large (max 10MB): ${file.name}`)

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${userId}/${Date.now()}-${safeName}`
      const { error } = await supabase.storage.from('ticket-attachments').upload(path, file, { upsert: false })
      if (error) throw new Error(`Failed to upload ${file.name}: ${error.message}`)
      uploadedPaths.push(path)
    }

    return uploadedPaths
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMessage(null)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const { data: { user } } = await supabase.auth.getUser()

    if (!session || !user) {
      setLoading(false)
      return
    }

    try {
      const attachments = await uploadAttachments(user.id)
      const payload = JSON.stringify({
        subject,
        body,
        attachments,
      })
      let response: Response

      try {
        response = await fetch(`/api/proxy/v1/tickets`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: payload,
        })
      } catch {
        response = await fetch(`http://127.0.0.1:8000/api/v1/tickets`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: payload,
        })
      }

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || 'Failed to create ticket')
      }
      router.push('/tickets')
      router.refresh()
    } catch (error) {
      console.error(error)
      const reason = error instanceof Error ? error.message : 'Unknown error'
      setErrorMessage(
        `Could not create ticket. ${reason}`
      )
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href="/tickets" className="text-sm font-medium text-gray-500 hover:text-gray-900">&larr; Back to Tickets</Link>
      </div>
      <div className="bg-white border shadow-sm rounded-2xl">
        <div className="px-6 py-6">
          <h3 className="text-lg font-medium text-gray-900">Submit a New Ticket</h3>
          <form className="mt-5 space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-gray-700">Subject</label>
              <input type="text" required value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2 text-sm text-black" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <textarea rows={6} required value={body} onChange={(e) => setBody(e.target.value)} className="mt-1 block w-full border px-3 py-2 rounded-md text-sm text-black" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Attachments (optional, PNG/JPG/PDF, max 10MB each)</label>
              <input type="file" multiple accept=".png,.jpg,.jpeg,.pdf" onChange={(e) => setFiles(e.target.files)} className="mt-1 block w-full text-sm text-black" />
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={loading} className="inline-flex py-2 px-4 rounded-md text-sm font-medium text-white bg-black hover:bg-gray-800 disabled:opacity-50">
                {loading ? 'Submitting...' : 'Submit Ticket'}
              </button>
            </div>
            {errorMessage ? (
              <p className="text-sm text-red-600">{errorMessage}</p>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  )
}
