import { useEffect, useState } from 'react'
import { supabase } from './supabase'

interface OverviewProps {
  onNavigate: (tab: any) => void
  onAlertCount: (n: number) => void
}

interface Metrics {
  totalBusinesses: number
  activeBusinesses: number
  totalMessages: number
  todayMessages: number
  totalContacts: number
  totalTokens: number
  estimatedCost: number
  estimatedMRR: number
  automationRate: number
  activeConversations: number
  pendingConversations: number
}

interface Activity {
  id: string
  text: string
  sub: string
  ago: string
  color: string
  icon: string
}

function timeAgo(d: string) {
  const s = (Date.now() - new Date(d).getTime()) / 1000
  if (s < 60) return `${Math.floor(s)}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

function Stat({ label, value, sub, color, icon, onClick }: { label: string; value: string; sub: string; color?: string; icon: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '16px 18px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => onClick && (e.currentTarget.style.borderColor = 'var(--border-2)')}
      onMouseLeave={e => onClick && (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>{label}</span>
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: (color || 'var(--accent)') + '18',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <i className={`ti ${icon}`} style={{ fontSize: 14, color: color || 'var(--accent)' }} />
        </div>
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.1, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: color || 'var(--text-3)' }}>{sub}</div>
    </div>
  )
}


export default function Overview({ onNavigate, onAlertCount }: OverviewProps) {
  const [m, setM] = useState<Metrics | null>(null)
  const [activity, setActivity] = useState<Activity[]>([])
  const [weekData, setWeekData] = useState<number[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
    const ch = supabase.channel('ov-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, load)
      .subscribe()
    return () => { ch.unsubscribe() }
  }, [])

  async function load() {
    const today = new Date(); today.setHours(0, 0, 0, 0)

    const [
      { count: totalB }, { count: activeB },
      { count: totalMsg }, { count: todayMsg },
      { count: totalC },
      { count: activeConv }, { count: pendConv },
      { data: tokenRows }, { data: recentMsgs }
    ] = await Promise.all([
      supabase.from('businesses').select('id', { count: 'exact' }),
      supabase.from('businesses').select('id', { count: 'exact' }).eq('is_active', true),
      supabase.from('messages').select('id', { count: 'exact' }),
      supabase.from('messages').select('id', { count: 'exact' }).gte('created_at', today.toISOString()),
      supabase.from('contacts').select('id', { count: 'exact' }),
      supabase.from('conversations').select('id', { count: 'exact' }).eq('status', 'active'),
      supabase.from('conversations').select('id', { count: 'exact' }).eq('status', 'pending'),
      supabase.from('messages').select('tokens_used').eq('sender', 'assistant').not('tokens_used', 'is', null),
      supabase.from('messages').select('id,sender,content,created_at').order('created_at', { ascending: false }).limit(10)
    ])

    const totalTokens = tokenRows?.reduce((s, r) => s + (r.tokens_used || 0), 0) ?? 0

    // Week data (last 7 days message counts)
    const days: number[] = []
    for (let i = 6; i >= 0; i--) {
      const from = new Date(); from.setDate(from.getDate() - i); from.setHours(0, 0, 0, 0)
      const to = new Date(from); to.setHours(23, 59, 59, 999)
      const { count } = await supabase.from('messages').select('id', { count: 'exact' })
        .gte('created_at', from.toISOString()).lte('created_at', to.toISOString())
      days.push(count ?? 0)
    }
    setWeekData(days)

    // Automation rate
    const { data: allM } = await supabase.from('messages').select('sender').limit(1000)
    const assistN = allM?.filter(x => x.sender === 'assistant').length ?? 0
    const userN = allM?.filter(x => x.sender === 'user').length ?? 0
    const automationRate = userN > 0 ? Math.min(100, Math.round((assistN / userN) * 100)) : 0

    setM({
      totalBusinesses: totalB ?? 0, activeBusinesses: activeB ?? 0,
      totalMessages: totalMsg ?? 0, todayMessages: todayMsg ?? 0,
      totalContacts: totalC ?? 0, totalTokens, estimatedCost: totalTokens * 0.000003,
      estimatedMRR: (activeB ?? 0) * 39,
      automationRate, activeConversations: activeConv ?? 0, pendingConversations: pendConv ?? 0
    })

    setActivity((recentMsgs ?? []).map(msg => ({
      id: msg.id,
      text: msg.content?.slice(0, 60) + (msg.content?.length > 60 ? '…' : '') || '',
      sub: msg.sender === 'assistant' ? 'Respuesta IA' : 'Mensaje cliente',
      ago: timeAgo(msg.created_at),
      color: msg.sender === 'assistant' ? 'var(--accent)' : 'var(--accent-2)',
      icon: msg.sender === 'assistant' ? 'ti-sparkles' : 'ti-message-2'
    })))

    onAlertCount(pendConv ?? 0)
    setLoading(false)
  }

  if (loading) return (
    <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 96 }} />
      ))}
    </div>
  )
  if (!m) return null

  const planRevenue = [
    { plan: 'Enterprise', clients: Math.max(0, Math.floor((m.activeBusinesses || 0) * 0.1)), price: 150 },
    { plan: 'Pro', clients: Math.max(0, Math.floor((m.activeBusinesses || 0) * 0.4)), price: 39 },
    { plan: 'Starter', clients: Math.max(0, m.activeBusinesses - Math.floor((m.activeBusinesses || 0) * 0.5)), price: 15 },
  ]

  return (
    <div style={{ overflowY: 'auto', height: '100%', padding: '20px 24px' }}>
      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <Stat label="MRR estimado" value={`$${m.estimatedMRR}`} sub={`${m.activeBusinesses} clientes activos`} color="var(--accent)" icon="ti-currency-dollar" onClick={() => onNavigate('revenue')} />
        <Stat label="Mensajes hoy" value={m.todayMessages.toLocaleString()} sub={`${m.totalMessages.toLocaleString()} total histórico`} icon="ti-messages" />
        <Stat label="Tasa de automatización" value={`${m.automationRate}%`} sub="Respuestas sin intervención humana" color="var(--accent)" icon="ti-robot" />
        <Stat label="Conversaciones activas" value={m.activeConversations.toString()} sub={m.pendingConversations > 0 ? `⚠ ${m.pendingConversations} pendientes` : 'Sin escalaciones pendientes'} color={m.pendingConversations > 0 ? 'var(--danger)' : undefined} icon="ti-message-dots" onClick={() => onNavigate('conversations')} />
        <Stat label="Clientes totales" value={m.totalBusinesses.toString()} sub={`${m.activeBusinesses} activos · ${m.totalBusinesses - m.activeBusinesses} suspendidos`} icon="ti-buildings" onClick={() => onNavigate('clients')} />
        <Stat label="Contactos únicos" value={m.totalContacts.toLocaleString()} sub="En todas las cuentas" icon="ti-users" />
        <Stat label="Tokens consumidos" value={`${(m.totalTokens / 1000).toFixed(1)}k`} sub={`Costo API ~$${m.estimatedCost.toFixed(3)} USD`} color="var(--warn)" icon="ti-sparkles" />
        <Stat label="Costo por cliente" value={m.activeBusinesses > 0 ? `$${(m.estimatedCost / m.activeBusinesses).toFixed(3)}` : '$0'} sub="Promedio por cliente activo" icon="ti-calculator" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 14 }}>
        {/* Left col */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Actividad */}
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Actividad reciente</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Tiempo real</span>
            </div>
            <div>
              {activity.map((a, i) => (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '10px 18px', borderBottom: i < activity.length - 1 ? '1px solid var(--border)' : 'none'
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                    background: a.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <i className={`ti ${a.icon}`} style={{ fontSize: 13, color: a.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.text}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{a.sub}</div>
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0, paddingTop: 2 }}>{a.ago}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Últimos 7 días */}
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Mensajes — últimos 7 días</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                  Total: {weekData.reduce((a, b) => a + b, 0)} mensajes
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
              {weekData.map((v, i) => {
                const max = Math.max(...weekData, 1)
                const pct = Math.max((v / max) * 100, 3)
                const days = ['D-6','D-5','D-4','D-3','D-2','D-1','Hoy']
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-3)' }}>{v > 0 ? v : ''}</div>
                    <div style={{
                      width: '100%', borderRadius: 4,
                      height: `${pct}%`, minHeight: 3,
                      background: i === 6 ? 'var(--accent)' : 'var(--accent)' + '40',
                      transition: 'height 0.3s'
                    }} />
                    <div style={{ fontSize: 9, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{days[i]}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right col */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Revenue por plan */}
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 14 }}>Revenue por plan</div>
            {planRevenue.map((p, i) => {
              const rev = p.clients * p.price
              const pct = m.estimatedMRR > 0 ? (rev / m.estimatedMRR) * 100 : 0
              const colors = ['var(--accent)', 'var(--accent-2)', 'var(--purple)']
              return (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{p.plan}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 500 }}>${rev}/mo</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-hover)' }}>
                    <div style={{ height: '100%', borderRadius: 3, width: `${pct}%`, background: colors[i], transition: 'width 0.4s' }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>{p.clients} clientes · ${p.price}/mes</div>
                </div>
              )
            })}
          </div>

          {/* Accesos rápidos */}
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 12 }}>Accesos rápidos</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { icon: 'ti-buildings', label: 'Gestionar clientes', tab: 'clients', color: 'var(--accent)' },
                { icon: 'ti-messages', label: 'Ver conversaciones', tab: 'conversations', color: 'var(--accent-2)' },
                { icon: 'ti-chart-bar', label: 'Revenue y costos', tab: 'revenue', color: 'var(--purple)' },
                { icon: 'ti-bell', label: `Alertas activas${m.pendingConversations > 0 ? ` (${m.pendingConversations})` : ''}`, tab: 'alerts', color: 'var(--warn)' },
              ].map((item, i) => (
                <button key={i} onClick={() => onNavigate(item.tab)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)',
                    background: 'var(--bg-raised)', cursor: 'pointer', textAlign: 'left',
                    transition: 'all 0.12s', fontFamily: 'inherit', width: '100%'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-raised)' }}
                >
                  <i className={`ti ${item.icon}`} style={{ fontSize: 14, color: item.color }} />
                  <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1 }}>{item.label}</span>
                  <i className="ti ti-chevron-right" style={{ fontSize: 12, color: 'var(--text-3)' }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
