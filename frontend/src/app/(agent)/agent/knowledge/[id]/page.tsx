import ArticleEditor from '@/components/knowledge/ArticleEditor'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

export default async function ArticleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  
  const { data: article } = await supabase
    .from('knowledge_articles')
    .select('*')
    .eq('id', id)
    .single()

  if (!article) {
    notFound()
  }

  return (
    <div className="py-8">
      <ArticleEditor initialData={article} />
    </div>
  )
}
