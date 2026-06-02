import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import AdminLogin from './AdminLogin'
import Overview from './Overview'
import Clients from './Clients'
import Conversations from './Conversations'
import Revenue from './Revenue'
import System from './System'
import Alerts from './Alerts'

type Tab = 'overview' | 'clients' | 'conversations' | 'revenue' | 'system' | 'alerts'

const ADMIN_EMAILS = ['zaza42069zaza69@gmail.com']

const NAV = [
  {
    group: 'Principal',
    items: [
      { id: 'overview' as Tab,       icon: 'ti-layout-dashboard', label: 'Overview' },
      { id: 'clients' as Tab,        icon: 'ti-buildings',         label: 'Clientes' },
      { id: 'conversations' as Tab,  icon: 'ti-messages',          label: 'Conversaciones' },
    ]
  },
  {
    group: 'Finanzas',
    items: [
      { id: 'revenue' as Tab,   icon: 'ti-chart-bar',         label: 'Revenue & Costos' },
    ]
  },
  {
    group: 'Operaciones',
    items: [
      { id: 'system' as Tab,  icon: 'ti-server',   label: 'Sistema' },
      { id: 'alerts' as Tab,  icon: 'ti-bell',     label: 'Alertas' },
    ]
  },
]

function Clock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.04em' }}>
      {time.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  )
}

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (authLoading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', color: 'var(--text-3)', fontSize: 13 }}>
      <i className="ti ti-loader-2" style={{ marginRight: 8 }} /> Cargando...
    </div>
  )

  if (!session || !ADMIN_EMAILS.includes(session.user.email ?? '')) return <AdminLogin />

  const initial = session.user.email?.slice(0, 1).toUpperCase() ?? 'A'

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-base)', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220, flexShrink: 0,
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto', overflowX: 'hidden'
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, #10b981, #059669)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: 'JetBrains Mono, monospace',
              flexShrink: 0
            }}>A</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.2 }}><span style={{ color: 'var(--accent)' }}>Was</span>so</div>
              <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Admin</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 10px' }}>
          {NAV.map(group => (
            <div key={group.group} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0 8px', marginBottom: 4 }}>
                {group.group}
              </div>
              {group.items.map(item => {
                const active = tab === item.id
                return (
                  <button key={item.id} onClick={() => setTab(item.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9,
                      width: '100%', padding: '7px 8px', borderRadius: 7,
                      border: 'none', cursor: 'pointer', textAlign: 'left',
                      background: active ? 'var(--bg-hover)' : 'transparent',
                      color: active ? 'var(--text-1)' : 'var(--text-2)',
                      fontSize: 13, fontFamily: 'inherit', marginBottom: 1,
                      transition: 'all 0.12s', position: 'relative'
                    }}
                    onMouseEnter={e => { if (!active) (e.currentTarget.style.background = 'var(--bg-raised)') }}
                    onMouseLeave={e => { if (!active) (e.currentTarget.style.background = 'transparent') }}
                  >
                    {active && (
                      <div style={{
                        position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                        width: 3, height: 16, borderRadius: 2, background: 'var(--accent)'
                      }} />
                    )}
                    <i className={`ti ${item.icon}`} style={{ fontSize: 15, color: active ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0 }} />
                    <span style={{ fontWeight: active ? 500 : 400 }}>{item.label}</span>
                    {item.id === 'alerts' && alertCount > 0 && (
                      <span style={{
                        marginLeft: 'auto', background: 'var(--danger)', color: '#fff',
                        fontSize: 10, fontWeight: 700, borderRadius: 10,
                        padding: '1px 6px', lineHeight: '16px'
                      }}>{alertCount}</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: '12px 10px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px', borderRadius: 8, background: 'var(--bg-raised)' }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 600, color: '#fff', flexShrink: 0
            }}>{initial}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {session.user.email}
              </div>
              <div style={{ fontSize: 10, color: 'var(--accent)' }}>Super Admin</div>
            </div>
            <button onClick={() => supabase.auth.signOut()}
              title="Cerrar sesión"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex' }}>
              <i className="ti ti-logout" style={{ fontSize: 14 }} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <header style={{
          height: 48, flexShrink: 0,
          background: 'var(--bg-panel)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
            {NAV.flatMap(g => g.items).find(n => n.id === tab)?.label}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
            <Clock />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Sistema online</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'hidden' }} className="fade-in" key={tab}>
          {tab === 'overview'       && <Overview onNavigate={setTab} onAlertCount={setAlertCount} />}
          {tab === 'clients'        && <Clients />}
          {tab === 'conversations'  && <Conversations />}
          {tab === 'revenue'        && <Revenue />}
          {tab === 'system'         && <System />}
          {tab === 'alerts'         && <Alerts onCount={setAlertCount} />}
        </div>
      </div>
    </div>
  )
}
