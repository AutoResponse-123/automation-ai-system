import { useEffect, useState } from 'react'
import { supabase } from './supabase'

interface Alert {
  id: string
  type: 'warning' | 'danger' | 'info' | 'churn'
  title: string
  detail: string
  ago: string
  action?: string
  onAction?: () => void
}

interface AlertsProps { onCount: (n: number) => void }

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60) return `${Math.floor(diff)}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

const ALERT_STYLES = {
  danger:  { color: '#f87171', bg: '#2e0e0e', border: '#f8717144', icon: 'ti-alert-circle' },
  warning: { color: '#f59e0b', bg: '#1a120a', border: '#f59e0b44', icon: 'ti-alert-triangle' },
  info:    { color: '#38bdf8', bg: '#0e1e2e', border: '#38bdf844', icon: 'ti-info-circle' },
  churn:   { color: '#a78bfa', bg: '#1a1a2e', border: '#a78bfa44', icon: 'ti-user-off' },
}

export default function Alerts({ onCount }: AlertsProps) {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAlerts() }, [])

  async function loadAlerts() {
    setLoading(true)
    const newAlerts: Alert[] = []
    const now = new Date()

    // 1. Clientes suspendidos
    const { data: suspended } = await supabase
      .from('businesses')
      .select('id, name, suspended_at, suspension_reason')
      .eq('is_active', false)

    for (const b of suspended ?? []) {
      newAlerts.push({
        id: `suspended-${b.id}`,
        type: 'danger',
        title: `Servicio suspendido — ${b.name}`,
        detail: b.suspension_reason ?? 'Suspendido manualmente',
        ago: b.suspended_at ? timeAgo(b.suspended_at) : 'desconocido',
      })
    }

    // 2. Trials próximos a vencer (menos de 5 días)
    const in5days = new Date(now.getTime() + 5 * 86400000).toISOString()
    const { data: trialExpiring } = await supabase
      .from('businesses')
      .select('id, name, trial_ends_at')
      .eq('plan', 'trial')
      .eq('is_active', true)
      .not('trial_ends_at', 'is', null)
      .lte('trial_ends_at', in5days)

    for (const b of trialExpiring ?? []) {
      const daysLeft = Math.ceil((new Date(b.trial_ends_at).getTime() - now.getTime()) / 86400000)
      newAlerts.push({
        id: `trial-${b.id}`,
        type: 'warning',
        title: `Trial vence en ${daysLeft} día${daysLeft !== 1 ? 's' : ''} — ${b.name}`,
        detail: `Vence el ${new Date(b.trial_ends_at).toLocaleDateString('es-AR')}. Enviar propuesta de conversión.`,
        ago: '',
      })
    }

    // 3. Clientes sin actividad hace más de 7 días (churn risk)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString()
    const { data: businesses } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('is_active', true)

    for (const b of businesses ?? []) {
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo)

      if ((count ?? 0) === 0) {
        newAlerts.push({
          id: `churn-${b.id}`,
          type: 'churn',
          title: `Sin actividad — ${b.name}`,
          detail: 'No se registraron mensajes en los últimos 7 días. Riesgo de abandono.',
          ago: '+7d',
        })
      }
    }

    // 4. Alerta de seguridad RLS
    newAlerts.push({
      id: 'rls-warning',
      type: 'warning',
      title: 'RLS desactivado en todas las tablas',
      detail: 'Riesgo de seguridad en producción. Activar Row Level Security antes de escalar.',
      ago: 'siempre',
    })

    setAlerts(newAlerts)
    onCount(newAlerts.filter(a => a.type === 'danger' || a.type === 'warning').length)
    setLoading(false)
  }

  return (
    <div className="overflow-y-auto h-full p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-[#4a4a6a]">{alerts.length} alerta{alerts.length !== 1 ? 's' : ''} activa{alerts.length !== 1 ? 's' : ''}</span>
        <button onClick={loadAlerts} className="flex items-center gap-1.5 bg-[#1a1a2e] border border-[#2e2e4e] rounded-lg px-3 py-1.5 text-xs text-[#a78bfa] cursor-pointer">
          <i className="ti ti-refresh text-xs" /> Actualizar
        </button>
      </div>

      {loading ? (
        <div className="text-center text-[#4a4a6a] text-xs py-12">Analizando...</div>
      ) : alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[#4a4a6a]">
          <i className="ti ti-circle-check text-3xl mb-3 text-green-500" />
          <p className="text-sm font-medium text-[#8b8baa]">Sin alertas activas</p>
          <p className="text-xs mt-1">Todo está funcionando correctamente</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {alerts.map(alert => {
            const style = ALERT_STYLES[alert.type]
            return (
              <div key={alert.id} className="flex items-start gap-3 p-3.5 rounded-xl border" style={{ background: style.bg, borderColor: style.border }}>
                <i className={`ti ${style.icon} text-base flex-shrink-0 mt-0.5`} style={{ color: style.color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium mb-1" style={{ color: style.color }}>{alert.title}</div>
                  <div className="text-[11px] opacity-80" style={{ color: style.color }}>{alert.detail}</div>
                  {alert.ago && <div className="text-[10px] opacity-60 mt-1" style={{ color: style.color }}>Hace {alert.ago}</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
