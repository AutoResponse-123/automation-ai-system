import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Contact {
  name: string | null
  phone: string
  interaction_count: number
  last_interaction: string | null
}

interface DayStat {
  date: string
  total: number
  user: number
  assistant: number
  tokens: number
  automationRate: number
}

type Range = '7d' | '14d' | '30d' | '90d' | '6m' | '1y'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

function maxOf(stats: DayStat[], key: keyof DayStat): number {
  return Math.max(...stats.map(s => s[key] as number), 1)
}

// ── Bar chart with hover tooltips ─────────────────────────────────────────────

function BarChart({ stats, valueKey, color, label, format }: {
  stats: DayStat[]
  valueKey: keyof DayStat
  color: string
  label: string
  format?: (v: number) => string
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const max = maxOf(stats, valueKey)
  const fmt = format ?? ((v: number) => String(v))

  return (
    <div style={s.chartCard}>
      <div style={s.chartTitle}>{label}</div>
      <div style={s.barsArea}>
        {stats.map((d, i) => {
          const val = d[valueKey] as number
          const pct = Math.round((val / max) * 100)
          const isHovered = hoveredIdx === i
          return (
            <div key={d.date} style={s.barCol}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}>
              {/* Tooltip */}
              <div style={{
                ...s.barTooltip,
                color: isHovered ? '#e2e8f0' : '#4a4a6a',
                fontWeight: isHovered ? 500 : 400,
                transition: 'color 0.15s',
              }}>
                {fmt(val)}
              </div>
              <div style={s.barTrack}>
                <div style={{
                  ...s.barFill,
                  height: `${pct}%`,
                  background: isHovered ? color : color + '99',
                  boxShadow: isHovered ? `0 0 8px ${color}66` : 'none',
                  transition: 'background 0.15s, box-shadow 0.15s, height 0.3s',
                }} />
              </div>
              <div style={{
                ...s.barLabel,
                color: isHovered ? '#8b8baa' : '#3a3a5a',
                transition: 'color 0.15s',
              }}>
                {formatDate(d.date)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Stacked bar chart ─────────────────────────────────────────────────────────

function StackedChart({ stats }: { stats: DayStat[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const max = maxOf(stats, 'total')

  return (
    <div style={s.chartCard}>
      <div style={s.chartTitle}>Mensajes por día</div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={s.legendItem}><div style={{ ...s.legendDot, background: '#a78bfa' }} />Usuario</div>
        <div style={s.legendItem}><div style={{ ...s.legendDot, background: '#22c55e' }} />IA</div>
      </div>
      <div style={s.barsArea}>
        {stats.map((d, i) => {
          const userPct  = Math.round((d.user      / max) * 100)
          const botPct   = Math.round((d.assistant / max) * 100)
          const isHovered = hoveredIdx === i
          return (
            <div key={d.date} style={s.barCol}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}>
              <div style={{ ...s.barTooltip, color: isHovered ? '#e2e8f0' : '#4a4a6a', fontWeight: isHovered ? 500 : 400, transition: 'color 0.15s' }}>
                {d.total}
              </div>
              <div style={s.barTrack}>
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', height: `${userPct + botPct}%`, transition: 'height 0.3s' }}>
                  <div style={{ flex: botPct, background: isHovered ? '#22c55e' : '#22c55e99', borderRadius: '3px 3px 0 0', transition: 'background 0.15s' }} />
                  <div style={{ flex: userPct, background: isHovered ? '#a78bfa' : '#a78bfa99', transition: 'background 0.15s' }} />
                </div>
              </div>
              <div style={{ ...s.barLabel, color: isHovered ? '#8b8baa' : '#3a3a5a', transition: 'color 0.15s' }}>
                {formatDate(d.date)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Analytics({ businessId }: { businessId: string | null }) {
  const [stats, setStats] = useState<DayStat[]>([])
  const [range, setRange] = useState<Range>('7d')
  const [loading, setLoading] = useState(true)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loadingContacts, setLoadingContacts] = useState(false)

  useEffect(() => { loadStats() }, [range])
  useEffect(() => { if (businessId) loadContacts() }, [businessId])

  async function loadContacts() {
    if (!businessId) return
    setLoadingContacts(true)
    const { data } = await supabase
      .from('contacts')
      .select('name, phone, interaction_count, last_interaction')
      .eq('business_id', businessId)
      .order('interaction_count', { ascending: false })
      .limit(10)
    setContacts(data ?? [])
    setLoadingContacts(false)
  }

  async function loadStats() {
    setLoading(true)
    const days = range === '7d' ? 7 : range === '14d' ? 14 : range === '30d' ? 30 : range === '90d' ? 90 : range === '6m' ? 182 : 365
    const from = new Date()
    from.setDate(from.getDate() - days)
    from.setHours(0, 0, 0, 0)

    const { data } = await supabase
      .from('messages')
      .select('sender, tokens_used, created_at')
      .gte('created_at', from.toISOString())
      .order('created_at', { ascending: true })

    if (!data) { setLoading(false); return }

    const byDay: Record<string, { user: number; assistant: number; tokens: number }> = {}
    for (let i = 0; i < days; i++) {
      const d = new Date()
      d.setDate(d.getDate() - (days - 1 - i))
      const key = d.toISOString().slice(0, 10)
      byDay[key] = { user: 0, assistant: 0, tokens: 0 }
    }

    data.forEach(msg => {
      const key = msg.created_at.slice(0, 10)
      if (!byDay[key]) byDay[key] = { user: 0, assistant: 0, tokens: 0 }
      if (msg.sender === 'user') byDay[key].user++
      else byDay[key].assistant++
      byDay[key].tokens += msg.tokens_used ?? 0
    })

    const result: DayStat[] = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        total: v.user + v.assistant,
        user: v.user,
        assistant: v.assistant,
        tokens: v.tokens,
        automationRate: v.user > 0 ? Math.min(100, Math.round((v.assistant / v.user) * 100)) : 0
      }))

    setStats(result)
    setLoading(false)
  }

  const totalMsgs     = stats.reduce((s, d) => s + d.total, 0)
  const totalTokens   = stats.reduce((s, d) => s + d.tokens, 0)
  const activeDays    = stats.filter(d => d.total > 0)
  const avgAutomation = activeDays.length > 0
    ? Math.round(activeDays.reduce((s, d) => s + d.automationRate, 0) / activeDays.length)
    : 0
  const estimatedCost  = totalTokens * 0.000003
  const peakDay        = stats.reduce((a, b) => b.total > a.total ? b : a, stats[0] ?? { date: '', total: 0 })

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.headerTitle}>Analytics</span>
        <div style={s.rangeGroup}>
          {(['7d', '14d', '30d', '90d', '6m', '1y'] as Range[]).map(r => (
            <button key={r} onClick={() => setRange(r)}
              style={{ ...s.rangeBtn, ...(range === r ? s.rangeBtnActive : {}) }}>
              {r === '7d' ? '7d' : r === '14d' ? '14d' : r === '30d' ? '30d' : r === '90d' ? '90d' : r === '6m' ? '6 meses' : '1 año'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={s.loading}>
          {Array(4).fill(0).map((_, i) => (
            <div key={i} style={{ ...s.summaryCard, display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
              <div className="skeleton" style={{ height: 10, width: '60%', borderRadius: 4 }} />
              <div className="skeleton" style={{ height: 26, width: '40%', borderRadius: 4 }} />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Summary */}
          <div style={s.summaryGrid}>
            <SummaryCard label="Mensajes en período" value={totalMsgs.toLocaleString()} />
            <SummaryCard label="Automatización promedio" value={`${avgAutomation}%`} color="#22c55e" />
            <SummaryCard label="Tokens consumidos" value={`${(totalTokens / 1000).toFixed(1)}k`} />
            <SummaryCard label="Costo estimado" value={`$${estimatedCost.toFixed(2)}`} color="#f59e0b" />
            <SummaryCard label="Días activos" value={`${activeDays.length}/${stats.length}`} />
            <SummaryCard label="Pico del período"
              value={peakDay?.total > 0 ? `${peakDay.total} msgs` : '—'}
              sub={peakDay?.total > 0 ? formatDate(peakDay.date) : ''} />
          </div>

          {/* Charts */}
          <div style={s.chartsGrid}>
            <StackedChart stats={stats} />
            <BarChart stats={stats} valueKey="automationRate" color="#22c55e" label="Tasa de automatización (%)"
              format={v => `${v}%`} />
            <BarChart stats={stats} valueKey="tokens" color="#a78bfa" label="Tokens por día"
              format={v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : String(v)} />
            <BarChart stats={stats} valueKey="assistant" color="#38bdf8" label="Respuestas de IA por día" />
          </div>

          {/* Top contacts */}
          <div style={{ ...s.chartCard, marginTop: 10 }}>
            <div style={s.chartTitle}>Clientes frecuentes — Top 10</div>
            {loadingContacts ? (
              <div style={{ fontSize: 12, color: '#4a4a6a' }}>Cargando...</div>
            ) : contacts.length === 0 ? (
              <div style={{ fontSize: 12, color: '#4a4a6a' }}>Sin datos aún</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '0.5px solid #1e1e2e' }}>
                    <th style={{ textAlign: 'left' as const, color: '#4a4a6a', fontWeight: 400, padding: '4px 8px 6px 0' }}>#</th>
                    <th style={{ textAlign: 'left' as const, color: '#4a4a6a', fontWeight: 400, padding: '4px 8px 6px 0' }}>Nombre</th>
                    <th style={{ textAlign: 'left' as const, color: '#4a4a6a', fontWeight: 400, padding: '4px 8px 6px 0' }}>Teléfono</th>
                    <th style={{ textAlign: 'right' as const, color: '#4a4a6a', fontWeight: 400, padding: '4px 0 6px 8px' }}>Mensajes</th>
                    <th style={{ textAlign: 'right' as const, color: '#4a4a6a', fontWeight: 400, padding: '4px 0 6px 8px' }}>Última interacción</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c, i) => (
                    <tr key={c.phone} style={{ borderBottom: '0.5px solid #0d0d20' }}>
                      <td style={{ padding: '5px 8px 5px 0', color: '#3a3a5a' }}>{i + 1}</td>
                      <td style={{ padding: '5px 8px 5px 0', color: '#c4c4d4' }}>{c.name || '—'}</td>
                      <td style={{ padding: '5px 8px 5px 0', color: '#8b8baa', fontFamily: 'monospace' }}>{c.phone}</td>
                      <td style={{ padding: '5px 0 5px 8px', color: '#a78bfa', fontWeight: 500, textAlign: 'right' as const }}>{c.interaction_count}</td>
                      <td style={{ padding: '5px 0 5px 8px', color: '#4a4a6a', textAlign: 'right' as const }}>
                        {c.last_interaction ? new Date(c.last_interaction).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="metric-card" style={s.summaryCard}>
      <div style={s.summaryLabel}>{label}</div>
      <div style={{ ...s.summaryValue, ...(color ? { color } : {}) }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#4a4a6a', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: { overflowY: 'auto', padding: 16, height: '100%' },
  header: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 },
  headerTitle: { fontSize: 13, fontWeight: 500, color: '#e2e8f0' },
  rangeGroup: { display: 'flex', gap: 4, marginLeft: 'auto' },
  rangeBtn: { background: 'transparent', border: '0.5px solid #1e1e2e', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: '#4a4a6a', cursor: 'pointer', transition: 'all 0.15s' },
  rangeBtnActive: { background: '#1a1a2e', borderColor: '#2e2e4e', color: '#a78bfa' },
  loading: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '8px 0' },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 16 },
  summaryCard: { background: '#0d0d14', border: '0.5px solid #1e1e2e', borderRadius: 10, padding: '10px 12px' },
  summaryLabel: { fontSize: 11, color: '#4a4a6a', marginBottom: 4 },
  summaryValue: { fontSize: 20, fontWeight: 500, color: '#e2e8f0', lineHeight: 1 },
  chartsGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 },
  chartCard: { background: '#0d0d14', border: '0.5px solid #1e1e2e', borderRadius: 10, padding: '12px 14px' },
  chartTitle: { fontSize: 12, color: '#8b8baa', marginBottom: 12, fontWeight: 500 },
  barsArea: { display: 'flex', alignItems: 'flex-end', gap: 4, height: 130 },
  barCol: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', cursor: 'default' },
  barTooltip: { fontSize: 10, height: 14, lineHeight: '14px' },
  barTrack: { flex: 1, width: '100%', position: 'relative', background: '#1a1a2e', borderRadius: 3 },
  barFill: { position: 'absolute', bottom: 0, left: 0, right: 0, borderRadius: 3 },
  barLabel: { fontSize: 9, whiteSpace: 'nowrap' },
  legendItem: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#4a4a6a' },
  legendDot: { width: 8, height: 8, borderRadius: '50%' },
}
