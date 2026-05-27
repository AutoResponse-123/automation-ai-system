import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import AdminLogin from './AdminLogin'
import Overview from './Overview'
import Clients from './Clients'
import Revenue from './Revenue'
import System from './System'
import Alerts from './Alerts'

type Tab = 'overview' | 'clients' | 'revenue' | 'system' | 'alerts'

const ADMIN_EMAILS = ['zaza42069zaza69@gmail.com'] // agregar emails de admins

export default function AdminApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('overview')
  const [alertCount, setAlertCount] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (authLoading) return (
    <div className="h-screen flex items-center justify-center bg-[#0a0a0f] text-[#4a4a6a] text-sm">
      Cargando...
    </div>
  )

  if (!session || !ADMIN_EMAILS.includes(session.user.email ?? '')) {
    return <AdminLogin />
  }

  const navItems: { id: Tab; icon: string; label: string }[] = [
    { id: 'overview', icon: 'ti-layout-dashboard', label: 'Overview' },
    { id: 'clients',  icon: 'ti-buildings',         label: 'Clientes' },
    { id: 'revenue',  icon: 'ti-currency-dollar',   label: 'Revenue' },
    { id: 'system',   icon: 'ti-server',            label: 'Sistema' },
    { id: 'alerts',   icon: 'ti-bell',              label: 'Alertas' },
  ]

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-[#e2e8f0] font-sans text-sm overflow-hidden">
      {/* Sidebar */}
      <nav className="w-[52px] bg-[#0d0d14] border-r border-[#1e1e2e] flex flex-col items-center py-3 gap-1">
        <div className="w-8 h-8 rounded-lg bg-[#7c3aed] flex items-center justify-center text-xs font-semibold text-white mb-2">AR</div>
        {navItems.map(n => (
          <button key={n.id} onClick={() => setTab(n.id)} title={n.label}
            className={`w-9 h-9 rounded-lg flex items-center justify-center text-base border-none cursor-pointer relative transition-all ${tab === n.id ? 'bg-[#1a1a2e] text-[#a78bfa]' : 'bg-transparent text-[#4a4a6a] hover:bg-[#111122]'}`}>
            <i className={`ti ${n.icon}`} />
            {n.id === 'alerts' && alertCount > 0 && (
              <span className="absolute top-1 right-1 bg-red-500 text-white text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">{alertCount}</span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={() => supabase.auth.signOut()}
          title="Cerrar sesión"
          className="w-7 h-7 rounded-full bg-[#1a1a2e] border border-[#2e2e4e] flex items-center justify-center text-xs text-[#a78bfa] font-medium cursor-pointer">
          {session.user.email?.slice(0,1).toUpperCase()}
        </button>
      </nav>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <div className="h-10 bg-[#0d0d14] border-b border-[#1e1e2e] flex items-center px-4 gap-2.5 flex-shrink-0">
          <span className="text-[13px] font-medium">{navItems.find(n => n.id === tab)?.label}</span>
          <span className="bg-[#1a1a2e] border border-[#2e2e4e] rounded px-2 py-0.5 text-[11px] text-[#a78bfa]">Admin Panel</span>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] text-[#4a4a6a]" id="adminClock"></span>
            <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {tab === 'overview' && <Overview onNavigate={setTab} onAlertCount={setAlertCount} />}
          {tab === 'clients'  && <Clients />}
          {tab === 'revenue'  && <Revenue />}
          {tab === 'system'   && <System />}
          {tab === 'alerts'   && <Alerts onCount={setAlertCount} />}
        </div>
      </div>
    </div>
  )
}
