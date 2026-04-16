'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, LayoutDashboard, Settings, Ticket } from 'lucide-react'

const navItems = [
  { name: 'Dashboard', href: '/agent/dashboard', icon: LayoutDashboard },
  { name: 'Tickets', href: '/agent/tickets', icon: Ticket },
  { name: 'Knowledge Base', href: '/agent/knowledge', icon: BookOpen },
  { name: 'Settings', href: '/agent/settings', icon: Settings },
]

export default function AgentNav() {
  const pathname = usePathname()

  return (
    <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto">
      {navItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.name}
            href={item.href}
            className={`flex items-center px-4 py-3 text-sm font-semibold rounded-2xl transition-all duration-200 group ${
              isActive
                ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20 shadow-[0_0_20px_rgba(37,99,235,0.05)]'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
            }`}
          >
            <item.icon
              className={`mr-3 h-5 w-5 transition-colors ${
                isActive ? 'text-blue-400' : 'text-gray-500 group-hover:text-gray-400'
              }`}
            />
            {item.name}
          </Link>
        )
      })}
    </nav>
  )
}
