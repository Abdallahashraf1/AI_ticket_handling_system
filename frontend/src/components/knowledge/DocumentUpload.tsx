'use client'

import React, { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, X, FileText, CheckCircle2, AlertCircle, Loader2, FileUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function DocumentUpload() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const router = useRouter()

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setStatus(null)
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    setStatus(null)

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        throw new Error('No active session. Please log in again.')
      }

      const formData = new FormData()
      formData.append('file', file)

      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${baseUrl}/api/v1/knowledge/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: formData,
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.detail || 'Failed to upload document')
      }

      const article = await response.json()
      setStatus({ type: 'success', message: 'Document split and embedded successfully!' })
      
      // Redirect after success
      setTimeout(() => {
        router.push(`/agent/knowledge/${article.id}`)
      }, 1500)

    } catch (err: any) {
      console.error('Upload error:', err)
      setStatus({ type: 'error', message: err.message || 'An unexpected error occurred.' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in slide-in-from-bottom-4 duration-700">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-white tracking-tight">Ingest Documents</h2>
        <p className="text-gray-400">Upload PDF, DOCX, or Markdown files to automatically populate your knowledge base using AI parsing and embedding.</p>
      </div>

      <div className={`relative border-2 border-dashed rounded-[2rem] p-12 transition-all ${
        file ? 'border-blue-500/50 bg-blue-500/5' : 'border-gray-800 bg-gray-900/50 hover:bg-gray-900 hover:border-gray-700'
      }`}>
        <input 
          type="file" 
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={onFileChange}
          accept=".pdf,.docx,.txt,.md,.markdown"
          disabled={uploading}
        />
        
        <div className="flex flex-col items-center justify-center text-center space-y-4">
          <div className={`p-4 rounded-2xl ${file ? 'bg-blue-500 text-white shadow-xl shadow-blue-500/20' : 'bg-gray-800 text-gray-500'}`}>
            <Upload className="w-8 h-8" />
          </div>
          
          {!file ? (
            <div className="space-y-1">
              <p className="text-lg font-semibold text-white">Click or drag and drop</p>
              <p className="text-sm text-gray-400">PDF, Word, or Markdown up to 10MB</p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-lg font-semibold text-white">{file.name}</p>
              <p className="text-sm text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          )}
        </div>
      </div>

      {status && (
        <div className={`flex items-center gap-3 p-4 rounded-2xl border ${
          status.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
        }`}>
          {status.type === 'success' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          <p className="text-sm font-medium">{status.message}</p>
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="flex-1 px-6 py-3.5 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-2xl border border-gray-800 transition-all"
        >
          Cancel
        </button>
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="flex-1 px-6 py-3.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white font-semibold rounded-2xl shadow-xl shadow-blue-600/20 transition-all flex items-center justify-center gap-2"
        >
          {uploading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Parsing & Embedding...
            </>
          ) : (
            <>
              <FileUp className="w-5 h-5" />
              Begin Ingestion
            </>
          )}
        </button>
      </div>
    </div>
  )
}
