'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AlarmClockCheck, BarChart3, ChartColumn, FileBarChart2, Users } from 'lucide-react'

const nav = [
  { name: 'Overview', href: '/manager/overview', icon: BarChart3 },
  { name: 'Analytics', href: '/manager/analytics', icon: ChartColumn },
  { name: 'Reports', href: '/manager/reports', icon: FileBarChart2 },
  { name: 'SLA', href: '/manager/sla', icon: AlarmClockCheck },
  { name: 'Teams', href: '/manager/teams', icon: Users },
]

export default function ManagerNav() {
  const pathname = usePathname()

  return (
    <nav className="space-y-2">
      {nav.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.name}
            href={item.href}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
              active ? 'bg-black text-white' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <item.icon className="h-4 w-4" />
            {item.name}
          </Link>
        )
      })}
    </nav>
  )
}
