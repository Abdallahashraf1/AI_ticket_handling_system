'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    
    router.push('/tickets')
    router.refresh()
  }

  return (
    <div className="sm:mx-auto sm:w-full sm:max-w-md">
      <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
        Sign in to Payment Support
      </h2>
      <div className="mt-8 bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
        <form className="space-y-6" onSubmit={handleLogin}>
          <div>
            <label className="block text-sm font-medium text-gray-700">Email address</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm px-3 py-2 border focus:outline-none focus:ring-black focus:border-black" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm px-3 py-2 border focus:outline-none focus:ring-black focus:border-black" />
          </div>
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <button type="submit" disabled={loading} className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-black hover:bg-gray-800 disabled:opacity-50">
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <div className="mt-6 text-center text-sm">
          <Link href="/register" className="text-gray-600 hover:text-black">
            Don't have an account? Sign up
          </Link>
        </div>
      </div>
    </div>
  )
}
