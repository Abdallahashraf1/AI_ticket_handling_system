'use client'

import { Pie, PieChart, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'

type PriorityMetric = {
  priority: string
  total: number
  breached: number
  compliance: number
}

type Props = {
  data: PriorityMetric[]
}

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#6b7280']

export default function SLAChart({ data }: Props) {
  const chartData = data.map((item) => ({ name: item.priority, value: item.compliance }))
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">SLA Compliance by Priority</h3>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={100} label>
              {chartData.map((entry, index) => (
                <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

