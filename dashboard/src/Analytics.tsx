import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// ── Types ─────────────────────────────────────────────────────────────────────

interface DayStat {
  date: string
  total: number
  user: number
  assistant: number
  tokens: number
  automationRate: number
}

type Range = '7d' | '14d' | '30d'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

function maxOf(stats: DayStat[], key: keyof DayStat): number {
  return Math.max(...stats.map(s => s[key] as number), 1)
}

// ── Bar chart ─────────────────────────────────────────────────────────────────

function BarChart({ stats, valueKey, color, label }: {
  stats: DayStat[]
  valueKey: keyof DayStat
  color: string
  label: string
}) {
  const max = maxOf(stats, valueKey)
  return (
    <div style={s.chartCard}>
      <div style={s.chartTitle}>{label}</div>
      <div style={s.barsArea}>
        {stats.map(d => {
          const val = d[valueKey] as number
          const pct = Math.round((val / max) * 100)
          return (
            <div key={d.date} style={s.barCol}>
              <div style={s.barTooltip}>{valueKey === 'automationRate' ? `${val}%` : val}</div>
              <div style={s.barTrack}>
                <div style={{ ...s.barFill, height: `${pct}%`, background: color }} />
              </div>
              <div style={s.barLabel}>{formatDate(d.date)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Stacked bar chart ─────────────────────────────────────────────────────────

function StackedChart({ stats }: { stats: DayStat[] }) {
  const max = maxOf(stats, 'total')
  return (
    <div style={s.chartCard}>
      <div style={s.chartTitle}>Mensajes por día</div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={s.legendItem}><div style={{ ...s.legendDot, background: '#a78bfa' }} />Usuario</div>
        <div style={s.legendItem}><div style={{ ...s.legendDot, background: '#22c55e' }} />IA</div>
      </div>
      <div style={s.barsArea}>
        {stats.map(d => {
          const userPct = Math.round((d.user / max) * 100)
          const botPct = Math.round((d.assistant / max) * 100)
          return (
            <div key={d.date} style={s.barCol}>
              <div style={s.barTooltip}>{d.total}</div>
              <div style={s.barTrack}>
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', height: `${userPct + botPct}%` }}>
                  <div style={{ flex: botPct, background: '#22c55e', borderRadius: '3px 3px 0 0' }} />
                  <div style={{ flex: userPct, background: '#a78bfa' }} />
                </div>
              </div>
              <div style={s.barLabel}>{formatDate(d.date)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Analytics() {
  const [stats, setStats] = useState<DayStat[]>([])
  const [range, setRange] = useState<Range>('7d')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [range])

  async function loadStats() {
    setLoading(true)

    const days = range === '7d' ? 7 : range === '14d' ? 14 : 30
    const from = new Date()
    from.setDate(from.getDate() - days)
    from.setHours(0, 0, 0, 0)

    const { data } = await supabase
      .from('messages')
      .select('sender, tokens_used, created_at')
      .gte('created_at', from.toISOString())
      .order('created_at', { ascending: true })

    if (!data) { setLoading(false); return }

    // Group by day
    const byDay: Record<string, { user: number; assistant: number; tokens: number }> = {}

    // Pre-fill all days so empty days show as 0
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
        automationRate: v.user > 0 ? Math.round((v.assistant / v.user) * 100) : 0
      }))

    setStats(result)
    setLoading(false)
  }

  // Summary cards
  const totalMsgs = stats.reduce((s, d) => s + d.total, 0)
  const totalTokens = stats.reduce((s, d) => s + d.tokens, 0)
  const avgAutomation = stats.length > 0
    ? Math.round(stats.reduce((s, d) => s + d.automationRate, 0) / stats.filter(d => d.total > 0).length || 0)
    : 0
  const estimatedCost = totalTokens * 0.000003

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.headerTitle}>Analytics</span>
        <div style={s.rangeGroup}>
          {(['7d', '14d', '30d'] as Range[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{ ...s.rangeBtn, ...(range === r ? s.rangeBtnActive : {}) }}
            >
              {r === '7d' ? '7 días' : r === '14d' ? '14 días' : '30 días'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={s.loading}>Cargando...</div>
      ) : (
        <>
          {/* Summary */}
          <div style={s.summaryGrid}>
            <div style={s.summaryCard}>
              <div style={s.summaryLabel}>Mensajes en período</div>
              <div style={s.summaryValue}>{totalMsgs.toLocaleString()}</div>
            </div>
            <div style={s.summaryCard}>
              <div style={s.summaryLabel}>Automatización promedio</div>
              <div style={{ ...s.summaryValue, color: '#22c55e' }}>{avgAutomation}%</div>
            </div>
            <div style={s.summaryCard}>
              <div style={s.summaryLabel}>Tokens consumidos</div>
              <div style={s.summaryValue}>{(totalTokens / 1000).toFixed(1)}k</div>
            </div>
            <div style={s.summaryCard}>
              <div style={s.summaryLabel}>Costo estimado</div>
              <div style={{ ...s.summaryValue, color: '#f59e0b' }}>${estimatedCost.toFixed(2)}</div>
            </div>
          </div>

          {/* Charts */}
          <div style={s.chartsGrid}>
            <StackedChart stats={stats} />
            <BarChart stats={stats} valueKey="automationRate" color="#22c55e" label="Tasa de automatización (%)" />
            <BarChart stats={stats} valueKey="tokens" color="#a78bfa" label="Tokens consumidos por día" />
            <BarChart stats={stats} valueKey="assistant" color="#38bdf8" label="Respuestas de IA por día" />
          </div>
        </>
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: { overflowY: 'auto', padding: 16, height: '100%' },
  header: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 },
  headerTitle: { fontSize: 13, fontWeight: 500, color: '#e2e8f0' },
  rangeGroup: { display: 'flex', gap: 4, marginLeft: 'auto' },
  rangeBtn: { background: 'transparent', border: '0.5px solid #1e1e2e', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: '#4a4a6a', cursor: 'pointer' },
  rangeBtnActive: { background: '#1a1a2e', borderColor: '#2e2e4e', color: '#a78bfa' },
  loading: { color: '#4a4a6a', fontSize: 13, padding: 32, textAlign: 'center' },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 },
  summaryCard: { background: '#0d0d14', border: '0.5px solid #1e1e2e', borderRadius: 10, padding: '10px 12px' },
  summaryLabel: { fontSize: 11, color: '#4a4a6a', marginBottom: 4 },
  summaryValue: { fontSize: 22, fontWeight: 500, color: '#e2e8f0', lineHeight: 1 },
  chartsGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 },
  chartCard: { background: '#0d0d14', border: '0.5px solid #1e1e2e', borderRadius: 10, padding: '12px 14px' },
  chartTitle: { fontSize: 12, color: '#8b8baa', marginBottom: 12, fontWeight: 500 },
  barsArea: { display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 },
  barCol: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%' },
  barTooltip: { fontSize: 10, color: '#4a4a6a', height: 14, lineHeight: '14px' },
  barTrack: { flex: 1, width: '100%', position: 'relative', background: '#1a1a2e', borderRadius: 3 },
  barFill: { position: 'absolute', bottom: 0, left: 0, right: 0, borderRadius: 3, transition: 'height .3s' },
  barLabel: { fontSize: 10, color: '#4a4a6a', whiteSpace: 'nowrap' },
  legendItem: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#4a4a6a' },
  legendDot: { width: 8, height: 8, borderRadius: '50%' },
}
