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
  escalationsToday: number
}

interface RecentActivity {
  id: string
  type: string
  text: string
  ago: string
  color: string
  bg: string
  icon: string
}

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60) return `${Math.floor(diff)}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

export default function Overview({ onNavigate, onAlertCount }: OverviewProps) {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [activity, setActivity] = useState<RecentActivity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAll()
    const channel = supabase
      .channel('admin-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => loadAll())
      .subscribe()
    return () => { channel.unsubscribe() }
  }, [])

  async function loadAll() {
    const today = new Date(); today.setHours(0,0,0,0)

    const [
      { count: totalBusinesses },
      { count: activeBusinesses },
      { count: totalMessages },
      { count: todayMessages },
      { count: totalContacts },
      { count: activeConversations },
      { count: pendingConversations },
      { data: tokenData },
      { data: recentMsgs }
    ] = await Promise.all([
      supabase.from('businesses').select('*', { count: 'exact', head: true }),
      supabase.from('businesses').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('messages').select('*', { count: 'exact', head: true }),
      supabase.from('messages').select('*', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
      supabase.from('contacts').select('*', { count: 'exact', head: true }),
      supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('messages').select('tokens_used').eq('sender', 'assistant').not('tokens_used', 'is', null),
      supabase.from('messages').select('id, sender, content, created_at, conversation_id').order('created_at', { ascending: false }).limit(8)
    ])

    const totalTokens = tokenData?.reduce((s, m) => s + (m.tokens_used || 0), 0) ?? 0
    const estimatedCost = totalTokens * 0.000003

    const acts: RecentActivity[] = (recentMsgs ?? []).map(m => ({
      id: m.id,
      type: m.sender === 'assistant' ? 'ai' : 'user',
      text: m.sender === 'assistant' ? `Claude respondió: ${m.content.slice(0,50)}...` : `Mensaje recibido: ${m.content.slice(0,50)}...`,
      ago: timeAgo(m.created_at),
      color: m.sender === 'assistant' ? '#a78bfa' : '#38bdf8',
      bg: m.sender === 'assistant' ? '#1a1a2e' : '#0e1e2e',
      icon: m.sender === 'assistant' ? 'ti-sparkles' : 'ti-message-2'
    }))

    const allMsgs = await supabase.from('messages').select('sender').limit(500)
    const assistantCount = allMsgs.data?.filter(m => m.sender === 'assistant').length ?? 0
    const userCount = allMsgs.data?.filter(m => m.sender === 'user').length ?? 0
    const automationRate = userCount > 0 ? Math.round((assistantCount / userCount) * 100) : 0

    const alerts = (pendingConversations ?? 0)
    onAlertCount(alerts)

    setMetrics({
      totalBusinesses: totalBusinesses ?? 0,
      activeBusinesses: activeBusinesses ?? 0,
      totalMessages: totalMessages ?? 0,
      todayMessages: todayMessages ?? 0,
      totalContacts: totalContacts ?? 0,
      totalTokens,
      estimatedCost,
      estimatedMRR: (activeBusinesses ?? 0) * 120,
      automationRate,
      activeConversations: activeConversations ?? 0,
      pendingConversations: pendingConversations ?? 0,
      escalationsToday: pendingConversations ?? 0
    })
    setActivity(acts)
    setLoading(false)
  }

  if (loading) return <div className="flex items-center justify-center h-full text-[#4a4a6a] text-sm">Cargando...</div>
  if (!metrics) return null

  const metricCards = [
    { label: 'MRR estimado',        value: `$${metrics.estimatedMRR}`,                    sub: `${metrics.activeBusinesses} clientes activos`, color: '#22c55e' },
    { label: 'Clientes totales',     value: metrics.totalBusinesses.toString(),             sub: `${metrics.activeBusinesses} activos`,          color: '#22c55e' },
    { label: 'Msgs hoy',             value: metrics.todayMessages.toLocaleString(),         sub: `${metrics.totalMessages.toLocaleString()} total` },
    { label: 'Automatización',       value: `${metrics.automationRate}%`,                  sub: 'respuestas IA',                                color: '#22c55e' },
    { label: 'Tokens / costo total', value: `${(metrics.totalTokens/1000).toFixed(1)}k`,   sub: `~$${metrics.estimatedCost.toFixed(2)} USD`,    color: '#f59e0b' },
    { label: 'Contactos únicos',     value: metrics.totalContacts.toLocaleString(),         sub: 'en todas las cuentas' },
    { label: 'Convs. activas',       value: metrics.activeConversations.toString(),         sub: 'ahora mismo',                                  color: '#22c55e' },
    { label: 'Pendientes / escal.',  value: metrics.pendingConversations.toString(),        sub: 'requieren atención',                           color: metrics.pendingConversations > 0 ? '#f87171' : undefined },
  ]

  return (
    <div className="overflow-y-auto h-full p-4">
      {/* Metrics */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {metricCards.map((m, i) => (
          <div key={i} className="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-3">
            <div className="text-[11px] text-[#4a4a6a] mb-1">{m.label}</div>
            <div className="text-xl font-medium leading-none mb-1">{m.value}</div>
            <div className="text-[11px]" style={{ color: m.color ?? '#4a4a6a' }}>{m.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Actividad reciente */}
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-3.5">
          <div className="text-xs font-medium text-[#8b8baa] mb-3 flex items-center gap-1.5">
            <i className="ti ti-activity" /> Actividad reciente
          </div>
          <div className="flex flex-col gap-0">
            {activity.map(a => (
              <div key={a.id} className="flex items-start gap-2 py-1.5 border-b border-[#1e1e2e] last:border-0">
                <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 text-xs" style={{ color: a.color, background: a.bg }}>
                  <i className={`ti ${a.icon}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-[#c4c4d4] truncate">{a.text}</div>
                </div>
                <div className="text-[10px] text-[#4a4a6a] flex-shrink-0">{a.ago}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Accesos rápidos */}
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-3.5">
          <div className="text-xs font-medium text-[#8b8baa] mb-3 flex items-center gap-1.5">
            <i className="ti ti-bolt" /> Accesos rápidos
          </div>
          <div className="flex flex-col gap-2">
            {[
              { icon: 'ti-buildings', label: 'Ver todos los clientes', tab: 'clients', color: '#a78bfa' },
              { icon: 'ti-currency-dollar', label: 'Análisis de revenue', tab: 'revenue', color: '#22c55e' },
              { icon: 'ti-server', label: 'Estado del sistema', tab: 'system', color: '#38bdf8' },
              { icon: 'ti-bell', label: `Alertas activas (${metrics.pendingConversations})`, tab: 'alerts', color: '#f59e0b' },
            ].map((item, i) => (
              <button key={i} onClick={() => onNavigate(item.tab)}
                className="flex items-center gap-2.5 p-2.5 bg-[#111122] border border-[#1e1e2e] rounded-lg text-left cursor-pointer hover:border-[#2e2e4e] transition-colors w-full">
                <div className="w-7 h-7 rounded-md flex items-center justify-center text-sm flex-shrink-0" style={{ color: item.color, background: item.color + '22' }}>
                  <i className={`ti ${item.icon}`} />
                </div>
                <span className="text-xs text-[#c4c4d4]">{item.label}</span>
                <i className="ti ti-chevron-right text-[#4a4a6a] text-xs ml-auto" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
