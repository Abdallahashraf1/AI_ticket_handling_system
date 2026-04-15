'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type AnalyticsRow = Record<string, string | number | boolean | null>

export type AnalyticsQueryResponse = {
  sql_query: string
  explanation: string
  summary: string
  rows: AnalyticsRow[]
  columns: string[]
  chart_type?: 'bar' | 'line' | 'pie' | 'table'
  cached?: boolean
}

export type AnalyticsDashboardResponse = {
  kpis: {
    total_tickets: number
    auto_resolution_rate: number
    avg_resolution_hours: number
    csat: number
    sla_compliance: number
  }
  ticket_volume_trend: Array<{ day: string; count: number }>
  resolution_type_breakdown: Array<{ label: string; value: number }>
  category_breakdown: Array<{ label: string; value: number }>
  cached?: boolean
}

export type SlaDashboardResponse = {
  total_with_sla: number
  breached_tickets: number
  compliance_rate: number
  priority_metrics: Array<{ priority: string; total: number; breached: number; compliance: number }>
}

export type SlaPolicy = {
  id: string
  name: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  first_response_hours: number
  resolution_hours: number
  business_hours_only: boolean
  is_default: boolean
}

async function fetchWithAuth<T>(path: string, init?: RequestInit): Promise<T> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    throw new Error('Session expired. Please sign in again.')
  }

  const response = await fetch(`/api/proxy/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...(init?.headers || {}),
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || 'Request failed')
  }
  return (await response.json()) as T
}

export function useAnalyticsDashboard() {
  return useQuery({
    queryKey: ['analytics-dashboard'],
    queryFn: () => fetchWithAuth<AnalyticsDashboardResponse>('/analytics/dashboard'),
  })
}

export function useAnalyticsQuery() {
  return useMutation({
    mutationFn: (question: string) =>
      fetchWithAuth<AnalyticsQueryResponse>('/analytics/query', {
        method: 'POST',
        body: JSON.stringify({ question }),
      }),
  })
}

export function useSlaDashboard() {
  return useQuery({
    queryKey: ['sla-dashboard'],
    queryFn: () => fetchWithAuth<SlaDashboardResponse>('/sla/dashboard'),
  })
}

export function useSlaPolicies() {
  return useQuery({
    queryKey: ['sla-policies'],
    queryFn: () => fetchWithAuth<SlaPolicy[]>('/sla/policies'),
  })
}

