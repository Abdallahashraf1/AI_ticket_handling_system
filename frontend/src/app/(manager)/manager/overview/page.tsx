'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Overview = {
  total_tickets: number
  open_tickets: number
  resolved_tickets: number
  resolution_rate: number
}

export default function ManagerOverviewPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)

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
    ['Total Tickets', data.total_tickets],
    ['Open Tickets', data.open_tickets],
    ['Resolved Tickets', data.resolved_tickets],
    ['Resolution Rate', `${data.resolution_rate}%`],
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Overview</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(([name, value]) => (
          <div key={name} className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="text-sm text-gray-500">{name}</div>
            <div className="text-3xl font-semibold mt-2">{value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
