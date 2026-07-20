import { useEffect, useState } from 'react'
import { supabase } from './supabase'

interface DayStat { date: string; messages: number; tokens: number; cost: number }
interface ClientStat { id: string; name: string; tokens: number; cost: number; msgs: number; plan: string }

const PLAN_PRICE: Record<string, number> = { trial: 0, basic: 19.99, pro: 39.99, premium: 89.99, starter: 19.99, enterprise: 89.99 }

export default function Revenue() {
  const [stats, setStats] = useState<DayStat[]>([])
  const [clientStats, setClientStats] = useState<ClientStat[]>([])
  const [range, setRange] = useState(30)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'clients'>('overview')

  useEffect(() => { load() }, [range])

  async function load() {
    setLoading(true)

    // Daily stats
    const from = new Date(); from.setDate(from.getDate() - range); from.setHours(0,0,0,0)
    const { data: msgs } = await supabase.from('messages').select('sender, tokens_used, created_at').gte('created_at', from.toISOString())

    const byDay: Record<string, { messages: number; tokens: number }> = {}
    for (let i = 0; i < range; i++) {
      const d = new Date(); d.setDate(d.getDate() - (range - 1 - i))
      byDay[d.toISOString().slice(0,10)] = { messages: 0, tokens: 0 }
    }
    ;(msgs ?? []).forEach(m => {
      const key = m.created_at.slice(0, 10)
      if (byDay[key]) { byDay[key].messages++; byDay[key].tokens += m.tokens_used ?? 0 }
    })
    setStats(Object.entries(byDay).map(([date, v]) => ({ date, messages: v.messages, tokens: v.tokens, cost: v.tokens * 0.000003 })))

    // Per-client stats
    const { data: businesses } = await supabase.from('businesses').select('id, name, plan').eq('is_active', true)
    if (businesses) {
      const cs = await Promise.all(businesses.map(async b => {
        const { data: convIds } = await supabase.from('conversations').select('id').eq('business_id', b.id)
        const ids = (convIds ?? []).map(c => c.id)
        let tokens = 0, msgCount = 0
        if (ids.length > 0) {
          const { data: bMsgs } = await supabase.from('messages').select('tokens_used, sender').in('conversation_id', ids)
          tokens = bMsgs?.reduce((s, m) => s + (m.tokens_used ?? 0), 0) ?? 0
          msgCount = bMsgs?.length ?? 0
        }
        return { id: b.id, name: b.name, tokens, cost: tokens * 0.000003, msgs: msgCount, plan: b.plan || 'trial' }
      }))
      setClientStats(cs.sort((a, b) => b.cost - a.cost))
    }

    setLoading(false)
  }

  const totalCost = stats.reduce((s, d) => s + d.cost, 0)
  const totalTokens = stats.reduce((s, d) => s + d.tokens, 0)
  const totalMessages = stats.reduce((s, d) => s + d.messages, 0)
  const maxMessages = Math.max(...stats.map(d => d.messages), 1)

  const totalMRR = clientStats.reduce((s, c) => s + (PLAN_PRICE[c.plan] || 0), 0)
  const totalApiCost = clientStats.reduce((s, c) => s + c.cost, 0)
  const margin = totalMRR > 0 ? ((totalMRR - totalApiCost) / totalMRR * 100) : 0

  return (
    <div style={{ overflowY: 'auto', height: '100%', padding: '20px 24px' }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {(['overview','clients'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            style={{ padding: '6px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: activeTab === t ? 600 : 400, background: activeTab === t ? 'var(--bg-hover)' : 'transparent', color: activeTab === t ? 'var(--text-1)' : 'var(--text-3)', fontFamily: 'inherit', transition: 'all 0.12s' }}>
            {t === 'overview' ? 'Overview' : 'Por cliente'}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          {/* Range */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18 }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Período:</span>
            {[7, 14, 30, 90].map(r => (
              <button key={r} onClick={() => setRange(r)}
                style={{ padding: '5px 12px', borderRadius: 7, border: `1px solid ${range === r ? 'var(--accent)' : 'var(--border)'}`, background: range === r ? 'var(--accent-dim)' : 'transparent', fontSize: 11, color: range === r ? 'var(--accent)' : 'var(--text-3)', cursor: 'pointer', fontFamily: 'inherit' }}>
                {r}d
              </button>
            ))}
          </div>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'MRR estimado', value: `$${totalMRR}`, sub: 'Ingresos mensuales', color: 'var(--accent)', icon: 'ti-currency-dollar' },
              { label: 'Margen bruto', value: `${margin.toFixed(1)}%`, sub: `Costo API: $${totalApiCost.toFixed(3)}`, color: margin > 70 ? 'var(--accent)' : 'var(--warn)', icon: 'ti-trending-up' },
              { label: 'Mensajes período', value: totalMessages.toLocaleString(), sub: `${range} días`, icon: 'ti-messages' },
              { label: 'Costo API período', value: `$${totalCost.toFixed(4)}`, sub: `${(totalTokens/1000).toFixed(1)}k tokens`, color: 'var(--warn)', icon: 'ti-sparkles' },
            ].map((s, i) => (
              <div key={i} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{s.label}</span>
                  <i className={`ti ${s.icon}`} style={{ fontSize: 14, color: s.color || 'var(--text-3)' }} />
                </div>
                <div style={{ fontSize: 22, fontWeight: 600, color: s.color || 'var(--text-1)', marginBottom: 4 }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 16 }}>Mensajes por día</div>
            {loading ? (
              <div className="skeleton" style={{ height: 100 }} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 100, paddingBottom: 20, position: 'relative' }}>
                {stats.map((d, i) => {
                  const pct = Math.max((d.messages / maxMessages) * 100, 2)
                  const isLast = i === stats.length - 1
                  const date = new Date(d.date + 'T00:00:00')
                  const showLabel = range <= 14 || i % Math.floor(range / 7) === 0 || isLast
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 3 }}>
                      <div style={{ width: '100%', borderRadius: '3px 3px 0 0', height: `${pct}%`, background: isLast ? 'var(--accent)' : 'var(--accent)50', transition: 'height 0.3s', minHeight: 2 }} title={`${d.messages} msgs · ${d.date}`} />
                      {showLabel && <div style={{ fontSize: 8, color: 'var(--text-3)', position: 'absolute', bottom: 0, whiteSpace: 'nowrap' }}>{date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}</div>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Table */}
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Detalle por día</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Fecha','Mensajes','Tokens','Costo API'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '9px 18px', fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.slice().reverse().map((d, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-raised)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '9px 18px', fontSize: 12, color: 'var(--text-2)' }}>{new Date(d.date + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</td>
                    <td style={{ padding: '9px 18px', fontSize: 12, color: 'var(--text-1)', fontWeight: 500 }}>{d.messages.toLocaleString()}</td>
                    <td className="mono" style={{ padding: '9px 18px', fontSize: 11, color: 'var(--warn)' }}>{d.tokens.toLocaleString()}</td>
                    <td className="mono" style={{ padding: '9px 18px', fontSize: 11, color: d.cost > 0 ? 'var(--danger)' : 'var(--text-3)' }}>${d.cost.toFixed(5)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === 'clients' && (
        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Rentabilidad por cliente</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Margen total: <span style={{ color: margin > 70 ? 'var(--accent)' : 'var(--warn)', fontWeight: 600 }}>{margin.toFixed(1)}%</span></span>
          </div>
          {loading ? (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 44 }} />)}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Cliente','Plan','Revenue','Costo API','Margen','Mensajes'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '9px 18px', fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientStats.map((c, i) => {
                  const revenue = PLAN_PRICE[c.plan] || 0
                  const clientMargin = revenue > 0 ? ((revenue - c.cost) / revenue * 100) : 0
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-raised)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '11px 18px', fontSize: 12, color: 'var(--text-1)', fontWeight: 500 }}>{c.name}</td>
                      <td style={{ padding: '11px 18px' }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: PLAN_COLORS[c.plan] || 'var(--text-3)', background: (PLAN_COLORS[c.plan] || '#888') + '18', borderRadius: 4, padding: '2px 6px', textTransform: 'uppercase' }}>{c.plan}</span>
                      </td>
                      <td style={{ padding: '11px 18px', fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>${revenue}/mo</td>
                      <td className="mono" style={{ padding: '11px 18px', fontSize: 11, color: 'var(--warn)' }}>${c.cost.toFixed(4)}</td>
                      <td style={{ padding: '11px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 60, height: 4, borderRadius: 2, background: 'var(--bg-hover)' }}>
                            <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(clientMargin, 100)}%`, background: clientMargin > 70 ? 'var(--accent)' : clientMargin > 40 ? 'var(--warn)' : 'var(--danger)' }} />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{clientMargin.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '11px 18px', fontSize: 12, color: 'var(--text-2)' }}>{c.msgs.toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

const PLAN_COLORS: Record<string, string> = { trial: '#f59e0b', basic: '#3b82f6', pro: '#10b981', premium: '#8b5cf6', starter: '#3b82f6', enterprise: '#8b5cf6' }
