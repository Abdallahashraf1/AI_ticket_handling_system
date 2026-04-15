import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LogOut, BookOpen, LayoutDashboard, Settings, Ticket } from 'lucide-react'
import { headers } from 'next/headers'

export default async function AgentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get profile to check role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAgent = profile && ['agent', 'manager', 'admin'].includes(profile.role)

  if (!isAgent) {
    redirect('/tickets')
  }

  // Get current path for active links
  const headerList = await headers()
  const fullPath = headerList.get('x-pathname') || ''

  const navItems = [
    { name: 'Dashboard', href: '/agent/dashboard', icon: LayoutDashboard },
    { name: 'Tickets', href: '/agent/tickets', icon: Ticket },
    { name: 'Knowledge Base', href: '/agent/knowledge', icon: BookOpen },
    { name: 'Settings', href: '/agent/settings', icon: Settings },
  ]

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col z-20 shadow-2xl">
        <div className="p-8">
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/20 group-hover:scale-110 transition-transform">
              <ShieldAlert size={18} className="text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              Agent Portal
            </span>
          </Link>
        </div>
        
        <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = fullPath.startsWith(item.href)
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
                <item.icon className={`mr-3 h-5 w-5 transition-colors ${isActive ? 'text-blue-400' : 'text-gray-500 group-hover:text-gray-400'}`} />
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div className="p-6 mt-auto">
          <div className="bg-gray-800/40 border border-gray-800 rounded-3xl p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{profile.role}</span>
                <span className="text-sm font-bold text-white truncate max-w-[120px]">{user.email?.split('@')[0]}</span>
              </div>
              <form action="/auth/signout" method="post">
                <button type="submit" className="p-2.5 bg-gray-950 text-gray-400 hover:text-white hover:bg-red-500/10 border border-gray-800 hover:border-red-500/20 rounded-xl transition-all group">
                  <LogOut className="h-5 w-5 group-hover:scale-110 transition-transform" />
                </button>
              </form>
            </div>
            <div className="h-1.5 w-full bg-gray-900 rounded-full overflow-hidden">
              <div className="h-full w-2/3 bg-blue-600 rounded-full shadow-[0_0_8px_rgba(37,99,235,0.5)]" />
            </div>
            <p className="text-[10px] text-gray-600 mt-2 font-bold uppercase">Workplace Sync: OK</p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 relative overflow-y-auto bg-gray-950/50 backdrop-blur-3xl scroll-smooth">
        {/* Animated Background Orbs */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/5 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="relative z-10 py-10 px-12">
          {children}
        </div>
      </main>
    </div>
  )
}

function ShieldAlert({ size, className }: { size: number, className: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      className={className}
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  )
}
