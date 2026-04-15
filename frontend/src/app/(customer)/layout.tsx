import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LogOut } from 'lucide-react'
import NotificationBell from '@/components/layout/NotificationBell'

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <Link href="/tickets" className="text-xl font-bold text-gray-900">
                  Payment Support
                </Link>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <NotificationBell />
              <span className="text-sm text-gray-500">{user.email}</span>
              <form action="/auth/signout" method="post">
                <button type="submit" className="text-gray-500 hover:text-gray-700">
                  <LogOut className="h-5 w-5" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </nav>
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  )
}
