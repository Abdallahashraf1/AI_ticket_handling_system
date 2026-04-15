'use client'

import React from 'react'
import { 
  Users, 
  Ticket, 
  CheckCircle, 
  Clock, 
  TrendingUp,
  BarChart3,
  MessageSquare
} from 'lucide-react'

export default function AgentDashboard() {
  const stats = [
    { name: 'Total Tickets', value: '128', icon: Ticket, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { name: 'Average Response', value: '14m', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-400/10' },
    { name: 'Resolved Today', value: '42', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    { name: 'Satisfaction', value: '4.8/5', icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-400/10' },
  ]

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Agent Dashboard</h1>
        <p className="text-gray-400 mt-1">Real-time overview of support operations and AI performance.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-gray-900 border border-gray-800 rounded-3xl p-6 hover:border-blue-500/30 transition-all hover:shadow-2xl hover:shadow-blue-500/5">
            <div className={`w-12 h-12 rounded-2xl ${stat.bg} ${stat.color} flex items-center justify-center mb-4`}>
              <stat.icon className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">{stat.name}</p>
            <p className="text-3xl font-bold text-white mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Chart Placeholder */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-3xl p-8 flex flex-col items-center justify-center min-h-[400px]">
          <BarChart3 className="w-16 h-16 text-gray-800 mb-4" />
          <p className="text-gray-500 font-medium">Activity Trends coming soon...</p>
        </div>

        {/* Recent Activity */}
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 space-y-6">
          <h3 className="text-xl font-bold text-white flex items-center">
            <MessageSquare className="mr-2 w-5 h-5 text-blue-400" />
            Live AI Resolution
          </h3>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4 p-4 bg-gray-950 rounded-2xl border border-gray-800/50">
                <div className="w-2 h-2 rounded-full bg-emerald-500 mt-2 shrink-0 animate-pulse" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-200">Ticket #2948 resolved</p>
                  <p className="text-xs text-gray-500">Auto-resolved using KB article "Refund Policy"</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
