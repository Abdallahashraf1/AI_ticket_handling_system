'use client'

import React from 'react'
import { 
  User, 
  Bell, 
  Shield, 
  Database, 
  Cpu, 
  Globe,
  Save
} from 'lucide-react'

export default function AgentSettings() {
  return (
    <div className="max-w-4xl space-y-8 animate-in fade-in slide-in-from-right-4 duration-700">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Agent Settings</h1>
        <p className="text-gray-400 mt-1">Configure your profile, notification preferences, and AI assistance parameters.</p>
      </div>

      <div className="space-y-6">
        {/* Profile Section */}
        <section className="bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden">
          <div className="p-6 border-b border-gray-800 flex items-center gap-3">
            <User className="text-blue-400" size={20} />
            <h2 className="text-xl font-bold text-white">Profile Information</h2>
          </div>
          <div className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Display Name</label>
                <input 
                  type="text" 
                  placeholder="Support Hero" 
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Email Address</label>
                <input 
                  type="email" 
                  disabled
                  value="test@gmail.com"
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-gray-500 cursor-not-allowed"
                />
              </div>
            </div>
          </div>
        </section>

        {/* AI Configuration */}
        <section className="bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden">
          <div className="p-6 border-b border-gray-800 flex items-center gap-3">
            <Cpu className="text-purple-400" size={20} />
            <h2 className="text-xl font-bold text-white">AI Assistance</h2>
          </div>
          <div className="p-8 space-y-6">
            <div className="flex items-center justify-between p-4 bg-gray-950 rounded-2xl border border-gray-800">
              <div className="space-y-1">
                <p className="font-semibold text-white">Auto-Drafting</p>
                <p className="text-sm text-gray-500">Enable AI to automatically draft responses for review.</p>
              </div>
              <div className="w-12 h-6 bg-blue-600 rounded-full relative">
                <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Confidence Threshold</label>
              <input type="range" className="w-full accent-blue-500" />
              <div className="flex justify-between text-[10px] text-gray-600 font-bold uppercase tracking-tighter">
                <span>Caution</span>
                <span>Optimistic</span>
              </div>
            </div>
          </div>
        </section>

        <div className="flex justify-end">
          <button className="flex items-center px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold transition-all shadow-xl shadow-blue-600/20">
            <Save className="mr-2 w-5 h-5" />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}
