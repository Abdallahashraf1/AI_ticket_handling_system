'use client'

import React, { useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import LinkExtension from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import Highlight from '@tiptap/extension-highlight'
import { 
  Bold, Italic, List, ListOrdered, Link, 
  Underline as UnderlineIcon, Heading1, Heading2, 
  Quote, Redo, Undo, Save, ChevronLeft, 
  Trash2, Send, Highlighting
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface ArticleEditorProps {
  initialData?: {
    id?: string
    title: string
    content: string
    category: string
    status: string
    tags: string[]
  }
}

export default function ArticleEditor({ initialData }: ArticleEditorProps) {
  const router = useRouter()
  const [title, setTitle] = useState(initialData?.title || '')
  const [category, setCategory] = useState(initialData?.category || 'general')
  const [status, setStatus] = useState(initialData?.status || 'draft')
  const [tags, setTags] = useState(initialData?.tags?.join(', ') || '')
  const [isSaving, setIsSaving] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Highlight,
      LinkExtension.configure({
        openOnClick: false,
      }),
      Placeholder.configure({
        placeholder: 'Start writing your knowledge article...',
      }),
    ],
    content: initialData?.content || '',
    immediatelyRender: false,
  })

  const onSave = async () => {
    console.log('Save initiated. Title:', title)
    
    if (!editor) {
      console.error('Editor not initialized')
      return
    }

    if (!title.trim()) {
      alert('Please enter an article title.')
      return
    }

    setIsSaving(true)

    try {
      const supabase = createClient()
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session) {
        console.error('Session error:', sessionError)
        alert('You must be logged in to save articles.')
        setIsSaving(false)
        return
      }

      console.log('Fetched session. Token present:', !!session.access_token)
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      console.log('Sending request to:', baseUrl)
      
      const payload = {
        title,
        content: editor.getHTML(),
        category,
        status,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      }

      let response
      if (initialData?.id) {
        response = await fetch(`${baseUrl}/api/v1/knowledge/${initialData.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify(payload),
        })
      } else {
        response = await fetch(`${baseUrl}/api/v1/knowledge/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify(payload),
        })
      }

      if (!response.ok) throw new Error('Failed to save article')
      
      router.push('/agent/knowledge')
      router.refresh()
    } catch (err) {
      console.error(err)
      alert('Error saving article')
    } finally {
      setIsSaving(false)
    }
  }

  const Toolbar = () => {
    if (!editor) return null

    return (
      <div className="flex flex-wrap items-center gap-1 p-2 bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
        <button 
          onClick={() => editor.chain().focus().toggleBold().run()} 
          className={`p-2 rounded hover:bg-gray-800 ${editor.isActive('bold') ? 'text-blue-400 bg-gray-800' : 'text-gray-400'}`}
        >
          <Bold size={18} />
        </button>
        <button 
          onClick={() => editor.chain().focus().toggleItalic().run()} 
          className={`p-2 rounded hover:bg-gray-800 ${editor.isActive('italic') ? 'text-blue-400 bg-gray-800' : 'text-gray-400'}`}
        >
          <Italic size={18} />
        </button>
        <button 
          onClick={() => editor.chain().focus().toggleUnderline().run()} 
          className={`p-2 rounded hover:bg-gray-800 ${editor.isActive('underline') ? 'text-blue-400 bg-gray-800' : 'text-gray-400'}`}
        >
          <UnderlineIcon size={18} />
        </button>
        <div className="w-px h-6 bg-gray-800 mx-1" />
        <button 
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} 
          className={`p-2 rounded hover:bg-gray-800 ${editor.isActive('heading', { level: 1 }) ? 'text-blue-400 bg-gray-800' : 'text-gray-400'}`}
        >
          <Heading1 size={18} />
        </button>
        <button 
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} 
          className={`p-2 rounded hover:bg-gray-800 ${editor.isActive('heading', { level: 2 }) ? 'text-blue-400 bg-gray-800' : 'text-gray-400'}`}
        >
          <Heading2 size={18} />
        </button>
        <button 
          onClick={() => editor.chain().focus().toggleBlockquote().run()} 
          className={`p-2 rounded hover:bg-gray-800 ${editor.isActive('blockquote') ? 'text-blue-400 bg-gray-800' : 'text-gray-400'}`}
        >
          <Quote size={18} />
        </button>
        <div className="w-px h-6 bg-gray-800 mx-1" />
        <button 
          onClick={() => editor.chain().focus().toggleBulletList().run()} 
          className={`p-2 rounded hover:bg-gray-800 ${editor.isActive('bulletList') ? 'text-blue-400 bg-gray-800' : 'text-gray-400'}`}
        >
          <List size={18} />
        </button>
        <button 
          onClick={() => editor.chain().focus().toggleOrderedList().run()} 
          className={`p-2 rounded hover:bg-gray-800 ${editor.isActive('orderedList') ? 'text-blue-400 bg-gray-800' : 'text-gray-400'}`}
        >
          <ListOrdered size={18} />
        </button>
        <div className="w-px h-6 bg-gray-800 mx-1" />
        <button 
          onClick={() => editor.chain().focus().undo().run()} 
          className="p-2 text-gray-400 hover:bg-gray-800 rounded"
        >
          <Undo size={18} />
        </button>
        <button 
          onClick={() => editor.chain().focus().redo().run()} 
          className="p-2 text-gray-400 hover:bg-gray-800 rounded"
        >
          <Redo size={18} />
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <button 
          onClick={() => router.back()}
          className="flex items-center text-gray-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="mr-1 w-5 h-5" />
          Back
        </button>
        
        <div className="flex items-center gap-3">
          <button 
            disabled={isSaving}
            onClick={onSave}
            className="flex items-center px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50"
          >
            <Save className="mr-2 w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Article'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Editor Area */}
        <div className="lg:col-span-2 space-y-4">
          <input 
            type="text"
            placeholder="Article Title..."
            className="w-full bg-transparent text-4xl font-bold text-white border-none focus:outline-none placeholder-gray-700"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          
          <div className="bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden min-h-[500px]">
            <Toolbar />
            <div className="p-8 prose prose-invert max-w-none">
              <EditorContent editor={editor} />
            </div>
          </div>
        </div>

        {/* Sidebar Metadata */}
        <div className="space-y-6">
          <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Status</label>
              <select 
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="active">Active (RAG Enabled)</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Category</label>
              <select 
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="payments">Payments</option>
                <option value="account">Account</option>
                <option value="integration">Integration</option>
                <option value="compliance">Compliance</option>
                <option value="general">General</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Tags (comma separated)</label>
              <input 
                type="text"
                placeholder="billing, fraud, webhooks..."
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </div>

            {initialData?.id && (
              <div className="pt-4 border-t border-gray-800">
                <button className="flex items-center text-red-400 hover:text-red-300 transition-colors text-sm font-medium">
                  <Trash2 className="mr-2 w-4 h-4" />
                  Archive Article
                </button>
              </div>
            )}
          </div>

          <div className="bg-blue-600/5 border border-blue-500/10 rounded-3xl p-6">
            <h4 className="flex items-center text-blue-400 font-bold mb-2">
              <Send className="mr-2 w-4 h-4" />
              AI Impact
            </h4>
            <p className="text-xs text-gray-400 leading-relaxed">
              Articles set to <span className="text-blue-300">Active</span> are automatically chunked and embedded using the Gemini model. This allows the AI agent to use this information to resolve customer tickets.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
