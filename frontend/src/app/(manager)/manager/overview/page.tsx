'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import KPICards from '@/components/analytics/KPICards'
import { useAnalyticsDashboard, useSlaDashboard } from '@/hooks/useAnalytics'
import { createClient } from '@/lib/supabase/client'

const SLAChart = dynamic(() => import('@/components/analytics/SLAChart'), { ssr: false })
const TrendChart = dynamic(() => import('@/components/analytics/TrendChart'), { ssr: false })

type Overview = {
  total_tickets: number
  open_tickets: number
  resolved_tickets: number
  resolution_rate: number
}

export default function ManagerOverviewPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const analytics = useAnalyticsDashboard()
  const sla = useSlaDashboard()

  useEffect(() => {
    const run = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const response = await fetch(`/api/proxy/v1/manager/overview`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (response.ok) {
        setData(await response.json())
      }
      setLoading(false)
    }
    run()
  }, [])

  if (loading) return <div>Loading...</div>
  if (!data) return <div>Failed to load manager overview.</div>

  const cards = [
    { label: 'Total Tickets', value: data.total_tickets, tone: 'text-gray-900' },
    { label: 'Open Tickets', value: data.open_tickets, tone: 'text-amber-600' },
    { label: 'Resolved Tickets', value: data.resolved_tickets, tone: 'text-emerald-600' },
    { label: 'Resolution Rate', value: `${data.resolution_rate}%`, tone: 'text-blue-600' },
  ]
  const categoryTrend = (analytics.data?.category_breakdown || []).map((item) => ({
    day: item.label,
    count: item.value,
  }))
  const resolutionBreakdown = analytics.data?.resolution_type_breakdown || []

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Overview</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <div className="text-sm text-gray-500">{card.label}</div>
            <div className={`text-3xl font-semibold mt-2 ${card.tone}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {analytics.data ? <KPICards kpis={analytics.data.kpis} /> : null}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {analytics.data ? (
          <TrendChart title="Ticket Volume (Last 14 days)" data={analytics.data.ticket_volume_trend} />
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl p-4">Loading analytics trend...</div>
        )}
        {sla.data ? (
          <SLAChart data={sla.data.priority_metrics} />
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl p-4">Loading SLA summary...</div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Categories</h2>
          {categoryTrend.length ? (
            <TrendChart title="Ticket Categories" data={categoryTrend} />
          ) : (
            <div className="text-sm text-gray-500">No categorized tickets yet.</div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Resolution Mix</h2>
          {resolutionBreakdown.length ? (
            <div className="space-y-3">
              {resolutionBreakdown.slice(0, 6).map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                  <div className="text-sm font-medium text-gray-700 capitalize">{item.label}</div>
                  <div className="text-lg font-semibold text-gray-900">{item.value}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500">No resolution data yet.</div>
          )}
        </div>
      </div>
    </div>
  )
}
