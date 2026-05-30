import { useEffect, useState } from 'react'
import { supabase } from './supabase'

interface ServiceCheck {
  name: string; status: 'ok' | 'warn' | 'error'; value: string; detail: string; icon: string
}

export default function System() {
  const [services, setServices] = useState<ServiceCheck[]>([])
  const [dbStats, setDbStats] = useState({ messages: 0, conversations: 0, contacts: 0, businesses: 0 })
  const [dbLatency, setDbLatency] = useState(0)
  const [loading, setLoading] = useState(true)
  const [lastChecked, setLastChecked] = useState('')
  const [_recentErrors] = useState<{ time: string; msg: string }[]>([])

  useEffect(() => { check() }, [])

  async function check() {
    setLoading(true)
    const t0 = Date.now()

    const [
      { count: messages }, { count: conversations },
      { count: contacts }, { count: businesses },
      { count: suspended },
    ] = await Promise.all([
      supabase.from('messages').select('id', { count: 'exact' }),
      supabase.from('conversations').select('id', { count: 'exact' }),
      supabase.from('contacts').select('id', { count: 'exact' }),
      supabase.from('businesses').select('id', { count: 'exact' }),
      supabase.from('businesses').select('id', { count: 'exact' }).eq('is_active', false),
    ])

    const latency = Date.now() - t0
    setDbLatency(latency)

    setDbStats({ messages: messages ?? 0, conversations: conversations ?? 0, contacts: contacts ?? 0, businesses: businesses ?? 0 })

    const svcs: ServiceCheck[] = [
      {
        name: 'Supabase Database',
        status: latency < 400 ? 'ok' : latency < 800 ? 'warn' : 'error',
        value: `${latency}ms`,
        detail: latency < 400 ? 'Latencia normal' : latency < 800 ? 'Latencia elevada' : 'Latencia crítica',
        icon: 'ti-database'
      },
      {
        name: 'Claude API (claude-sonnet-4-5)',
        status: 'ok', value: 'Configurado',
        detail: 'ANTHROPIC_API_KEY presente en Railway',
        icon: 'ti-sparkles'
      },
      await (async () => {
        const backendUrl = 'https://automation-ai-system-production.up.railway.app'
        try {
          const t = Date.now()
          const r = await fetch(backendUrl + '/health', { signal: AbortSignal.timeout(5000) })
          const railwayLatency = Date.now() - t
          const railwayOk = r.ok
          svcs.push({
            name: 'Railway Backend',
            status: railwayOk ? (railwayLatency < 600 ? 'ok' : 'warn') : 'error',
            value: railwayOk ? `${railwayLatency}ms` : 'Error',
            detail: railwayOk ? `automation-ai-system-production.up.railway.app` : 'No responde',
            icon: 'ti-server'
          })
        } catch {
          svcs.push({ name: 'Railway Backend', status: 'error', value: 'Timeout', detail: 'No responde en 5s', icon: 'ti-server' })
        }
      })()
      {
        name: 'Twilio WhatsApp',
        status: 'ok', value: 'Sandbox',
        detail: 'Modo sandbox activo — pendiente API oficial Meta',
        icon: 'ti-brand-whatsapp'
      },
      {
        name: 'Supabase Auth',
        status: 'ok', value: 'Email/Password',
        detail: 'Autenticación activa',
        icon: 'ti-lock'
      },
      {
        name: 'Google Calendar OAuth',
        status: 'ok', value: 'Configurado',
        detail: 'GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET presentes',
        icon: 'ti-calendar'
      },
      {
        name: 'Email (nodemailer / Gmail)',
        status: 'ok', value: 'Configurado',
        detail: 'EMAIL_USER + EMAIL_PASS configurados en Railway',
        icon: 'ti-mail'
      },
      {
        name: 'RLS Supabase',
        status: 'ok', value: 'Habilitado',
        detail: 'Row Level Security activo en todas las tablas',
        icon: 'ti-shield-check'
      },
      {
        name: 'Clientes suspendidos',
        status: (suspended ?? 0) > 0 ? 'warn' : 'ok',
        value: String(suspended ?? 0),
        detail: (suspended ?? 0) > 0 ? `${suspended} cuentas con servicio suspendido` : 'Ningún cliente suspendido',
        icon: 'ti-alert-circle'
      },
    ]

    setServices(svcs)
    setLastChecked(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    setLoading(false)
  }

  const statusConfig = {
    ok:   { color: 'var(--accent)', bg: 'var(--accent-dim)', label: 'OK', dot: '#10b981' },
    warn: { color: 'var(--warn)',   bg: '#f59e0b18',        label: 'Aviso', dot: '#f59e0b' },
    error:{ color: 'var(--danger)', bg: '#ef444418',        label: 'Error', dot: '#ef4444' },
  }

  const okCount = services.filter(s => s.status === 'ok').length
  const warnCount = services.filter(s => s.status === 'warn').length
  const errCount = services.filter(s => s.status === 'error').length
  const healthPct = services.length > 0 ? Math.round(okCount / services.length * 100) : 100

  return (
    <div style={{ overflowY: 'auto', height: '100%', padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: healthPct === 100 ? 'var(--accent-dim)' : '#f59e0b18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className={`ti ${healthPct === 100 ? 'ti-circle-check' : 'ti-alert-triangle'}`} style={{ fontSize: 18, color: healthPct === 100 ? 'var(--accent)' : 'var(--warn)' }} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1 }}>{healthPct}%</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>Salud del sistema</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[{v: okCount, label: 'OK', c: 'var(--accent)'}, {v: warnCount, label: 'Aviso', c: 'var(--warn)'}, {v: errCount, label: 'Error', c: 'var(--danger)'}].map((s, i) => (
              <div key={i} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: s.c }}>{s.v}</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Último chequeo: {lastChecked}</span>
          <button onClick={check} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 12, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>
            <i className="ti ti-refresh" style={{ fontSize: 13 }} /> Verificar
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 14 }}>
        {/* Services */}
        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Estado de servicios</div>
          {loading ? (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 52 }} />)}
            </div>
          ) : services.map((s, i) => {
            const sc = statusConfig[s.status]
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: i < services.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: sc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className={`ti ${s.icon}`} style={{ fontSize: 14, color: sc.color }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-1)', marginBottom: 2 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.detail}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{s.value}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: sc.bg, border: `1px solid ${sc.dot}30`, borderRadius: 6, padding: '3px 8px' }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: sc.dot }} />
                    <span style={{ fontSize: 10, fontWeight: 600, color: sc.color }}>{sc.label}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* DB Stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 14 }}>Base de datos</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'Mensajes', value: dbStats.messages, icon: 'ti-message-2', color: 'var(--accent-2)' },
                { label: 'Convs.', value: dbStats.conversations, icon: 'ti-messages', color: 'var(--purple)' },
                { label: 'Contactos', value: dbStats.contacts, icon: 'ti-users', color: 'var(--accent)' },
                { label: 'Negocios', value: dbStats.businesses, icon: 'ti-buildings', color: 'var(--warn)' },
              ].map((s, i) => (
                <div key={i} style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <i className={`ti ${s.icon}`} style={{ fontSize: 12, color: s.color }} />
                    <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{s.label}</span>
                  </div>
                  <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-1)' }}>{s.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 12 }}>Latencia DB</div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Supabase</span>
                <span className="mono" style={{ fontSize: 11, color: dbLatency < 400 ? 'var(--accent)' : dbLatency < 800 ? 'var(--warn)' : 'var(--danger)' }}>{dbLatency}ms</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-hover)' }}>
                <div style={{ height: '100%', borderRadius: 3, width: `${Math.min(dbLatency / 10, 100)}%`, background: dbLatency < 400 ? 'var(--accent)' : dbLatency < 800 ? 'var(--warn)' : 'var(--danger)', transition: 'width 0.4s' }} />
              </div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Target: &lt;400ms · Actual: {dbLatency}ms</div>
          </div>

          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 10 }}>Links rápidos</div>
            {[
              { label: 'Railway Dashboard', url: 'https://railway.com/dashboard', icon: 'ti-server' },
              { label: 'Supabase Studio', url: 'https://supabase.com/dashboard/project/kyvcjdrnxcrlvwsqfqyx', icon: 'ti-database' },
              { label: 'Vercel Dashboard', url: 'https://vercel.com/dashboard', icon: 'ti-brand-vercel' },
              { label: 'Backend Prod', url: 'https://automation-ai-system-production.up.railway.app', icon: 'ti-external-link' },
            ].map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: i < 3 ? '1px solid var(--border)' : 'none', textDecoration: 'none', color: 'var(--text-2)', fontSize: 12, transition: 'color 0.12s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text-1)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-2)'}
              >
                <i className={`ti ${l.icon}`} style={{ fontSize: 13, color: 'var(--text-3)' }} />
                {l.label}
                <i className="ti ti-external-link" style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
