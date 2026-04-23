'use client'

import dynamic from 'next/dynamic'
import NLQueryInput from '@/components/analytics/NLQueryInput'
import QueryResult from '@/components/analytics/QueryResult'
import KPICards from '@/components/analytics/KPICards'
import { useAnalyticsDashboard, useAnalyticsQuery } from '@/hooks/useAnalytics'

const TrendChart = dynamic(() => import('@/components/analytics/TrendChart'), { ssr: false })

export default function ManagerAnalyticsPage() {
  const dashboard = useAnalyticsDashboard()
  const queryMutation = useAnalyticsQuery()

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Analytics</h1>

      {dashboard.isLoading ? (
        <div>Loading dashboard...</div>
      ) : dashboard.data ? (
        <>
          <KPICards kpis={dashboard.data.kpis} />
          <TrendChart title="Ticket Volume (Last 14 days)" data={dashboard.data.ticket_volume_trend} />
        </>
      ) : (
        <div className="text-red-600">Failed to load dashboard metrics.</div>
      )}

      <NLQueryInput
        onSubmit={async (question) => {
          try {
            await queryMutation.mutateAsync(question)
          } catch {
            // The mutation already exposes its error state to QueryResult.
          }
        }}
        isLoading={queryMutation.isPending}
      />
      <QueryResult
        data={queryMutation.data ?? null}
        error={queryMutation.isError ? (queryMutation.error as Error).message : null}
      />
    </div>
  )
}
