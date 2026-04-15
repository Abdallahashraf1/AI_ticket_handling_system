'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type TeamMember = {
  id: string
  full_name: string
  email: string
  role: string
}

type Team = {
  id: string
  name: string
  description: string | null
  specialization: string[] | null
  member_count: number
  members: TeamMember[]
}

export default function ManagerTeamsPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const run = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const response = await fetch(`/api/proxy/v1/manager/teams`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (response.ok) setTeams(await response.json())
      setLoading(false)
    }
    run()
  }, [])

  if (loading) return <div>Loading...</div>

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Teams</h1>
      <div className="space-y-4">
        {teams.map((team) => (
          <div key={team.id} className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">{team.name}</h2>
                <p className="text-sm text-gray-500">{team.description || 'No description'}</p>
              </div>
              <span className="text-sm text-gray-600">{team.member_count} members</span>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
              {team.members.map((member) => (
                <div key={member.id} className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="text-sm font-medium">{member.full_name}</div>
                  <div className="text-xs text-gray-500">{member.email} · {member.role}</div>
                </div>
              ))}
              {team.members.length === 0 && <div className="text-sm text-gray-500">No members</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
