'use client'

import dynamic from 'next/dynamic'
import { useSlaDashboard, useSlaPolicies } from '@/hooks/useAnalytics'

const SLAChart = dynamic(() => import('@/components/analytics/SLAChart'), { ssr: false })

export default function ManagerSLAPage() {
  const dashboard = useSlaDashboard()
  const policies = useSlaPolicies()

  if (dashboard.isLoading || policies.isLoading) {
    return <div>Loading SLA dashboard...</div>
  }
  if (!dashboard.data || !policies.data) {
    return <div className="text-red-600">Failed to load SLA dashboard.</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">SLA Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">Tickets With SLA</div>
          <div className="text-3xl font-semibold mt-2">{dashboard.data.total_with_sla}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">Breached Tickets</div>
          <div className="text-3xl font-semibold mt-2">{dashboard.data.breached_tickets}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">Compliance</div>
          <div className="text-3xl font-semibold mt-2">{dashboard.data.compliance_rate}%</div>
        </div>
      </div>

      <SLAChart data={dashboard.data.priority_metrics} />

      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <h2 className="text-lg font-semibold mb-3">SLA Policies</h2>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">Priority</th>
                <th className="text-left px-3 py-2">First Response (h)</th>
                <th className="text-left px-3 py-2">Resolution (h)</th>
                <th className="text-left px-3 py-2">Business Hours</th>
              </tr>
            </thead>
            <tbody>
              {policies.data.map((policy) => (
                <tr key={policy.id} className="border-t border-gray-200">
                  <td className="px-3 py-2">{policy.name}</td>
                  <td className="px-3 py-2 capitalize">{policy.priority}</td>
                  <td className="px-3 py-2">{policy.first_response_hours}</td>
                  <td className="px-3 py-2">{policy.resolution_hours}</td>
                  <td className="px-3 py-2">{policy.business_hours_only ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
