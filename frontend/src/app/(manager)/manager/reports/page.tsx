'use client'

import dynamic from 'next/dynamic'
import { useAnalyticsDashboard, useSlaDashboard } from '@/hooks/useAnalytics'

const SLAChart = dynamic(() => import('@/components/analytics/SLAChart'), { ssr: false })
const TrendChart = dynamic(() => import('@/components/analytics/TrendChart'), { ssr: false })

export default function ManagerReportsPage() {
  const dashboard = useAnalyticsDashboard()
  const slaDashboard = useSlaDashboard()

  if (dashboard.isLoading || slaDashboard.isLoading) {
    return <div>Loading reports...</div>
  }

  if (!dashboard.data || !slaDashboard.data) {
    return <div className="text-red-600">Failed to load reports.</div>
  }

  const categoryTrend = dashboard.data.category_breakdown.map((item) => ({
    day: item.label,
    count: item.value,
  }))

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Reports</h1>
      <TrendChart title="Ticket Categories" data={categoryTrend} />
      <SLAChart data={slaDashboard.data.priority_metrics} />
    </div>
  )
}
