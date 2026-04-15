'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type Datum = {
  day: string
  count: number
}

type Props = {
  title: string
  data: Datum[]
}

export default function TrendChart({ title, data }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill="#2563eb" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

