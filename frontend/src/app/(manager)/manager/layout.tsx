import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BarChart3, LogOut, Users, ChartColumn, FileBarChart2, AlarmClockCheck } from 'lucide-react'
import { headers } from 'next/headers'
import NotificationBell from '@/components/layout/NotificationBell'

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    redirect('/agent/dashboard')
  }

  const headerList = await headers()
  const fullPath = headerList.get('x-pathname') || ''
  const nav = [
    { name: 'Overview', href: '/manager/overview', icon: BarChart3 },
    { name: 'Analytics', href: '/manager/analytics', icon: ChartColumn },
    { name: 'Reports', href: '/manager/reports', icon: FileBarChart2 },
    { name: 'SLA', href: '/manager/sla', icon: AlarmClockCheck },
    { name: 'Teams', href: '/manager/teams', icon: Users },
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="w-64 bg-white border-r border-gray-200 p-6 flex flex-col">
        <Link href="/manager/overview" className="text-xl font-bold mb-8">Manager Portal</Link>
        <nav className="space-y-2">
          {nav.map((item) => {
            const active = fullPath.startsWith(item.href)
            return (
              <Link key={item.name} href={item.href} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${active ? 'bg-black text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            )
          })}
        </nav>
        <div className="mt-auto space-y-4">
          <NotificationBell />
          <form action="/auth/signout" method="post">
            <button type="submit" className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100">
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
