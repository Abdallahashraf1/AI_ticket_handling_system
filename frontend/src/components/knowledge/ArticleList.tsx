'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, Search, FileText, Calendar, Tag, ChevronRight, Loader2, UploadCloud } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Article {
  id: string
  title: string
  category: string
  status: 'draft' | 'active' | 'archived'
  created_at: string
  tags: string[]
}

export default function KnowledgeList() {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    async function fetchArticles() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('knowledge_articles')
        .select('id, title, category, status, created_at, tags')
        .order('created_at', { ascending: false })

      if (data) setArticles(data)
      setLoading(false)
    }

    fetchArticles()
  }, [])

  const filteredArticles = articles.filter(article => {
    const matchesSearch = article.title.toLowerCase().includes(search.toLowerCase()) || 
                         article.category?.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === 'all' || article.status === filter
    return matchesSearch && matchesFilter
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
      case 'draft': return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
      case 'archived': return 'bg-gray-500/10 text-gray-400 border-gray-500/20'
      default: return 'bg-gray-500/10 text-gray-400'
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Knowledge Base</h1>
          <p className="text-gray-400 mt-1">Manage articles, documentation, and automated responses.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Link 
            href="/agent/knowledge/new"
            className="flex items-center px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-600/20"
          >
            <Plus className="w-5 h-5 mr-2" />
            New Article
          </Link>
          <Link 
            href="/agent/knowledge/upload"
            className="flex items-center px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 rounded-xl font-medium transition-all"
          >
            <UploadCloud className="w-5 h-5 mr-2" />
            Upload Doc
          </Link>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input 
            type="text"
            placeholder="Search documentation..."
            className="w-full bg-gray-900 border border-gray-800 rounded-2xl py-3 pl-12 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex p-1 bg-gray-900 rounded-2xl border border-gray-800">
          {['all', 'active', 'draft', 'archived'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition-all ${
                filter === f ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Article List */}
      <div className="grid gap-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-gray-900/50 border border-gray-800 rounded-3xl">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
            <p className="text-gray-400 mt-4 font-medium italic">Loading your knowledge library...</p>
          </div>
        ) : filteredArticles.length > 0 ? (
          filteredArticles.map((article) => (
            <Link 
              key={article.id}
              href={`/agent/knowledge/${article.id}`}
              className="group relative bg-gray-900 hover:bg-gray-800/80 border border-gray-800 hover:border-blue-500/30 rounded-3xl p-6 transition-all hover:shadow-2xl hover:shadow-blue-500/5"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(article.status)}`}>
                      {article.status}
                    </span>
                    <span className="text-xs text-gray-500 font-medium flex items-center">
                      <Tag className="w-3 h-3 mr-1" />
                      {article.category || 'Uncategorized'}
                    </span>
                  </div>
                  
                  <h3 className="text-xl font-bold text-white group-hover:text-blue-400 transition-colors">
                    {article.title}
                  </h3>
                  
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-2" />
                      {new Date(article.created_at).toLocaleDateString()}
                    </div>
                    {article.tags?.length > 0 && (
                      <div className="flex gap-2">
                        {article.tags.slice(0, 3).map(tag => (
                          <span key={tag} className="text-[10px] text-gray-600 bg-gray-800 px-2 py-0.5 rounded">#{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="p-3 bg-gray-800 rounded-2xl text-gray-500 group-hover:text-blue-400 group-hover:bg-blue-500/10 transition-all">
                  <ChevronRight className="w-6 h-6" />
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="text-center py-20 bg-gray-900/50 border border-gray-800 rounded-3xl">
            <FileText className="w-16 h-16 text-gray-700 mx-auto" />
            <h3 className="text-xl font-bold text-gray-300 mt-4">No articles found</h3>
            <p className="text-gray-500 mt-2">Try adjusting your search filters or create a new library entry.</p>
          </div>
        )}
      </div>
    </div>
  )
}
