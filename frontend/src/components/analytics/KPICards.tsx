'use client'

type Kpis = {
  total_tickets: number
  auto_resolution_rate: number
  avg_resolution_hours: number
  csat: number
  sla_compliance: number
}

type Props = {
  kpis: Kpis
}

export default function KPICards({ kpis }: Props) {
  const items = [
    { label: 'Total Tickets', value: kpis.total_tickets },
    { label: 'Auto Resolution %', value: `${kpis.auto_resolution_rate}%` },
    { label: 'Avg Resolution (hrs)', value: kpis.avg_resolution_hours },
    { label: 'CSAT', value: kpis.csat },
    { label: 'SLA Compliance %', value: `${kpis.sla_compliance}%` },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
      {items.map((item) => (
        <div key={item.label} className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="text-xs uppercase text-gray-500 tracking-wide">{item.label}</div>
          <div className="text-2xl font-semibold text-gray-900 mt-2">{item.value}</div>
        </div>
      ))}
    </div>
  )
}

