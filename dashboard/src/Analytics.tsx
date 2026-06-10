import { useEffect, useState } from 'react'
import { useT } from './i18n'
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

interface HourStat {
  hour: number
  count: number
}

interface CategoryStat {
  name: string
  count: number
  color: string
}

type Range = '7d' | '14d' | '30d' | '90d' | '6m' | '1y'

const CAT_COLORS = ['#a78bfa','#22c55e','#38bdf8','#f59e0b','#f87171','#e879f9','#fb923c','#34d399']

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

function maxOf(stats: DayStat[], key: keyof DayStat): number {
  return Math.max(...stats.map(s => s[key] as number), 1)
}

function ChartEmpty({ label }: { label: string }) {
  return (
    <div style={s.chartCard}>
      <div style={s.chartTitle}>{label}</div>
      <div style={{ height: 130, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#3a3a5a' }}>
        <i className="ti ti-chart-bar-off" style={{ fontSize: 28, opacity: 0.7 }} />
        <span style={{ fontSize: 12 }}>Sin datos en este período</span>
      </div>
    </div>
  )
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
  if (stats.every(d => (d[valueKey] as number) === 0)) return <ChartEmpty label={label} />

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
              <div style={{ ...s.barTooltip, color: isHovered ? '#e2e8f0' : '#4a4a6a', fontWeight: isHovered ? 500 : 400, transition: 'color 0.15s' }}>
                {fmt(val)}
              </div>
              <div style={s.barTrack}>
                <div style={{ ...s.barFill, height: `${pct}%`, background: isHovered ? color : color + '99', boxShadow: isHovered ? `0 0 8px ${color}66` : 'none', transition: 'background 0.15s, box-shadow 0.15s, height 0.3s' }} />
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

// ── Stacked bar chart ─────────────────────────────────────────────────────────

function StackedChart({ stats }: { stats: DayStat[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const max = maxOf(stats, 'total')
  if (stats.every(d => d.total === 0)) return <ChartEmpty label="Mensajes por día" />

  return (
    <div style={s.chartCard}>
      <div style={s.chartTitle}>Mensajes por día</div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={s.legendItem}><div style={{ ...s.legendDot, background: '#a78bfa' }} />Usuario</div>
        <div style={s.legendItem}><div style={{ ...s.legendDot, background: '#22c55e' }} />IA</div>
      </div>
      <div style={s.barsArea}>
        {stats.map((d, i) => {
          const userPct = Math.round((d.user / max) * 100)
          const botPct  = Math.round((d.assistant / max) * 100)
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

// ── Hourly heatmap ────────────────────────────────────────────────────────────

function HourlyChart({ hours }: { hours: HourStat[] }) {
  const max = Math.max(...hours.map(h => h.count), 1)
  const [hovered, setHovered] = useState<number | null>(null)
  if (hours.every(h => h.count === 0)) return <ChartEmpty label="Horario pico — mensajes por hora del día" />

  return (
    <div style={s.chartCard}>
      <div style={s.chartTitle}>Horario pico — mensajes por hora del día</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 100 }}>
        {hours.map(h => {
          const pct = Math.round((h.count / max) * 100)
          const isHot = h.count >= max * 0.75
          const isHovered = hovered === h.hour
          return (
            <div key={h.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, height: '100%', cursor: 'default' }}
              onMouseEnter={() => setHovered(h.hour)}
              onMouseLeave={() => setHovered(null)}>
              <div style={{ fontSize: 9, color: isHovered ? '#e2e8f0' : 'transparent', transition: 'color 0.1s', height: 12, lineHeight: '12px' }}>
                {h.count || ''}
              </div>
              <div style={{ flex: 1, width: '100%', position: 'relative', background: '#1a1a2e', borderRadius: 2 }}>
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0, borderRadius: 2,
                  height: `${pct}%`,
                  background: isHot ? '#f59e0b' : '#a78bfa',
                  opacity: isHovered ? 1 : 0.7,
                  transition: 'height 0.3s, opacity 0.15s',
                }} />
              </div>
              <div style={{ fontSize: 8, color: isHovered ? '#8b8baa' : '#3a3a5a', transition: 'color 0.15s' }}>
                {h.hour.toString().padStart(2, '0')}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <div style={s.legendItem}><div style={{ ...s.legendDot, background: '#f59e0b' }} />Hora pico (≥75%)</div>
        <div style={s.legendItem}><div style={{ ...s.legendDot, background: '#a78bfa' }} />Normal</div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Analytics({ businessId }: { businessId: string | null }) {
  const t = useT()
  const [stats, setStats] = useState<DayStat[]>([])
  const [range, setRange] = useState<Range>('7d')
  const [loading, setLoading] = useState(true)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [hours, setHours] = useState<HourStat[]>([])
  const [apptTotal, setApptTotal] = useState(0)
  const [apptCategories, setApptCategories] = useState<CategoryStat[]>([])
  const [escalationCount, setEscalationCount] = useState(0)
  const [totalConvs, setTotalConvs] = useState(0)

  useEffect(() => { if (businessId) { loadStats(); loadExtras() } }, [range, businessId])

  async function loadExtras() {
    if (!businessId) return

    // Contacts top 10
    const { data: contactData } = await supabase
      .from('contacts')
      .select('name, phone, interaction_count, last_interaction')
      .eq('business_id', businessId)
      .order('interaction_count', { ascending: false })
      .limit(10)
    setContacts(contactData ?? [])

    // Turnos en período
    const days = range === '7d' ? 7 : range === '14d' ? 14 : range === '30d' ? 30 : range === '90d' ? 90 : range === '6m' ? 182 : 365
    const from = new Date(); from.setDate(from.getDate() - days); from.setHours(0,0,0,0)

    const { data: appts } = await supabase
      .from('appointments')
      .select('title, category')
      .eq('business_id', businessId)
      .gte('created_at', from.toISOString())
    setApptTotal(appts?.length ?? 0)

    // Agrupar por categoría
    const catMap: Record<string, number> = {}
    appts?.forEach(a => {
      const key = a.category || a.title || 'Sin categoría'
      catMap[key] = (catMap[key] ?? 0) + 1
    })
    setApptCategories(
      Object.entries(catMap)
        .sort(([,a],[,b]) => b - a)
        .map(([name, count], i) => ({ name, count, color: CAT_COLORS[i % CAT_COLORS.length] }))
    )

    // Escalaciones
    const { count: escalated } = await supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('status', 'pending')
      .gte('created_at', from.toISOString())

    const { count: total } = await supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('created_at', from.toISOString())

    setEscalationCount(escalated ?? 0)
    setTotalConvs(total ?? 0)
  }

  async function loadStats() {
    if (!businessId) return
    setLoading(true)
    const days = range === '7d' ? 7 : range === '14d' ? 14 : range === '30d' ? 30 : range === '90d' ? 90 : range === '6m' ? 182 : 365
    const from = new Date(); from.setDate(from.getDate() - days); from.setHours(0,0,0,0)

    // Mensajes del período — filtrado por businessId via conversaciones
    const { data: convIds } = await supabase
      .from('conversations')
      .select('id')
      .eq('business_id', businessId)

    const ids = convIds?.map(c => c.id) ?? []
    if (ids.length === 0) { setStats([]); setHours(Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }))); setLoading(false); return }

    const { data } = await supabase
      .from('messages')
      .select('sender, tokens_used, created_at')
      .in('conversation_id', ids)
      .gte('created_at', from.toISOString())
      .order('created_at', { ascending: true })

    if (!data) { setLoading(false); return }

    // By day
    const byDay: Record<string, { user: number; assistant: number; tokens: number }> = {}
    for (let i = 0; i < days; i++) {
      const d = new Date(); d.setDate(d.getDate() - (days - 1 - i))
      byDay[d.toISOString().slice(0, 10)] = { user: 0, assistant: 0, tokens: 0 }
    }

    // By hour
    const byHour: number[] = Array(24).fill(0)

    data.forEach(msg => {
      const key = msg.created_at.slice(0, 10)
      if (!byDay[key]) byDay[key] = { user: 0, assistant: 0, tokens: 0 }
      if (msg.sender === 'user') {
        byDay[key].user++
        const h = new Date(msg.created_at).getHours()
        byHour[h]++
      } else {
        byDay[key].assistant++
      }
      byDay[key].tokens += msg.tokens_used ?? 0
    })

    setStats(
      Object.entries(byDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({
          date, total: v.user + v.assistant, user: v.user, assistant: v.assistant, tokens: v.tokens,
          automationRate: v.user > 0 ? Math.min(100, Math.round((v.assistant / v.user) * 100)) : 0
        }))
    )

    setHours(byHour.map((count, hour) => ({ hour, count })))
    setLoading(false)
  }

  const totalMsgs      = stats.reduce((s, d) => s + d.total, 0)
  const totalTokens    = stats.reduce((s, d) => s + d.tokens, 0)
  const activeDays     = stats.filter(d => d.total > 0)
  const avgAutomation  = activeDays.length > 0 ? Math.round(activeDays.reduce((s, d) => s + d.automationRate, 0) / activeDays.length) : 0
  const estimatedCost  = totalTokens * 0.000003
  const peakDay        = stats.reduce((a, b) => b.total > a.total ? b : a, stats[0] ?? { date: '', total: 0 })
  const escalationRate = totalConvs > 0 ? Math.round((escalationCount / totalConvs) * 100) : 0
  const peakHour       = hours.reduce((a, b) => b.count > a.count ? b : a, { hour: 0, count: 0 })

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.headerTitle}>Analytics</span>
        <div style={s.rangeGroup}>
          {(['7d', '14d', '30d', '90d', '6m', '1y'] as Range[]).map(r => (
            <button key={r} onClick={() => setRange(r)}
              style={{ ...s.rangeBtn, ...(range === r ? s.rangeBtnActive : {}) }}>
              {r === '7d' ? '7d' : r === '14d' ? '14d' : r === '30d' ? '30d' : r === '90d' ? '90d' : r === '6m' ? '6m' : '1a'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={s.loading}>
          {Array(6).fill(0).map((_, i) => (
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
            <SummaryCard label={t('analytics_messages_period')} value={totalMsgs.toLocaleString()} />
            <SummaryCard label={t('analytics_avg_automation')} value={`${avgAutomation}%`} color="#22c55e" />
            <SummaryCard label={t('analytics_appts_total')} value={String(apptTotal)} color="#38bdf8" />
            <SummaryCard label={t('analytics_escalation_rate')} value={escalationRate > 0 ? `${escalationRate}%` : '0%'} color={escalationRate > 20 ? '#f87171' : '#4a4a6a'} sub={`${escalationCount} de ${totalConvs} convs`} />
            <SummaryCard label={t('analytics_peak_hour')} value={peakHour.count > 0 ? `${peakHour.hour.toString().padStart(2,'0')}:00` : '—'} color="#f59e0b" sub={peakHour.count > 0 ? `${peakHour.count} msgs` : ''} />
            <SummaryCard label={t('analytics_cost')} value={`$${estimatedCost.toFixed(3)}`} color="#f59e0b" sub={`${(totalTokens/1000).toFixed(1)}k tokens`} />
          </div>

          {/* Charts row 1 */}
          <div style={s.chartsGrid}>
            <StackedChart stats={stats} />
            <BarChart stats={stats} valueKey="automationRate" color="#22c55e" label={t('analytics_chart_automation')} format={v => `${v}%`} />
          </div>

          {/* Horario pico — full width */}
          <div style={{ marginTop: 10 }}>
            <HourlyChart hours={hours} />
          </div>

          {/* Charts row 2 */}
          <div style={{ ...s.chartsGrid, marginTop: 10 }}>
            <BarChart stats={stats} valueKey="tokens" color="#a78bfa" label={t('analytics_chart_tokens')} format={v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : String(v)} />
            <BarChart stats={stats} valueKey="assistant" color="#38bdf8" label={t('analytics_chart_ai_responses')} />
          </div>

          {/* Turnos por categoría + Top contacts */}
          <div style={{ ...s.chartsGrid, marginTop: 10 }}>

            {/* Turnos por categoría */}
            <div style={s.chartCard}>
              <div style={s.chartTitle}>{t('analytics_by_category_title')}</div>
              {apptTotal === 0 ? (
                <div style={{ fontSize: 12, color: '#4a4a6a', padding: '16px 0' }}>{t('analytics_no_appts')}</div>
              ) : apptCategories.length === 0 ? (
                <div style={{ fontSize: 12, color: '#4a4a6a' }}>{t('analytics_no_categories')}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {apptCategories.map(cat => (
                    <div key={cat.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: '#c4c4d4' }}>{cat.name}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: cat.color }}>{cat.count}</span>
                      </div>
                      <div style={{ height: 6, background: '#1a1a2e', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.round((cat.count / apptTotal) * 100)}%`, background: cat.color, borderRadius: 3, transition: 'width 0.4s' }} />
                      </div>
                    </div>
                  ))}
                  <div style={{ fontSize: 11, color: '#4a4a6a', marginTop: 4 }}>Total: {apptTotal} turnos</div>
                </div>
              )}
            </div>

            {/* Top contacts */}
            <div style={s.chartCard}>
              <div style={s.chartTitle}>Clientes frecuentes — Top 10</div>
              {contacts.length === 0 ? (
                <div style={{ fontSize: 12, color: '#4a4a6a' }}>Sin datos aún</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid #1e1e2e' }}>
                      <th style={{ textAlign: 'left' as const, color: '#4a4a6a', fontWeight: 400, padding: '4px 8px 6px 0' }}>#</th>
                      <th style={{ textAlign: 'left' as const, color: '#4a4a6a', fontWeight: 400, padding: '4px 8px 6px 0' }}>Nombre</th>
                      <th style={{ textAlign: 'right' as const, color: '#4a4a6a', fontWeight: 400, padding: '4px 0 6px 8px' }}>Msgs</th>
                      <th style={{ textAlign: 'right' as const, color: '#4a4a6a', fontWeight: 400, padding: '4px 0 6px 8px' }}>Última</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((c, i) => (
                      <tr key={c.phone} style={{ borderBottom: '0.5px solid #0d0d20' }}>
                        <td style={{ padding: '5px 8px 5px 0', color: '#3a3a5a' }}>{i + 1}</td>
                        <td style={{ padding: '5px 8px 5px 0', color: '#c4c4d4', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || c.phone}</td>
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
          </div>

          {/* Pico del período */}
          {peakDay?.total > 0 && (
            <div style={{ marginTop: 10, padding: '10px 14px', background: '#0d0d14', border: '0.5px solid #1e1e2e', borderRadius: 10, fontSize: 12, color: '#4a4a6a' }}>
              Día más activo del período: <strong style={{ color: '#e2e8f0' }}>{formatDate(peakDay.date)}</strong> con <strong style={{ color: 'var(--accent)' }}>{peakDay.total} mensajes</strong>
            </div>
          )}
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
      {sub && <div style={{ fontSize: 10, color: '#4a4a6a', marginTop: 2 }}>{sub}</div>}
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
  loading: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, padding: '8px 0' },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 16 },
  summaryCard: { background: '#0d0d14', border: '0.5px solid #1e1e2e', borderRadius: 10, padding: '10px 12px' },
  summaryLabel: { fontSize: 10, color: '#4a4a6a', marginBottom: 4 },
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
