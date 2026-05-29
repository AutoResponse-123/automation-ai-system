import { useEffect, useState } from 'react'
import { supabase } from './supabase'

interface Alert {
  id: string; severity: 'critical' | 'warning' | 'info'
  title: string; detail: string; ago: string; icon: string
  action?: string; onAction?: () => void
}

interface AlertsProps { onCount: (n: number) => void }

function timeAgo(d: string) {
  const s = (Date.now() - new Date(d).getTime()) / 1000
  if (s < 60) return `${Math.floor(s)}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

const STYPE = {
  critical: { color: 'var(--danger)',   bg: '#ef444412', border: '#ef444430', icon: 'ti-alert-circle',   label: 'Crítico' },
  warning:  { color: 'var(--warn)',     bg: '#f59e0b12', border: '#f59e0b30', icon: 'ti-alert-triangle', label: 'Aviso' },
  info:     { color: 'var(--accent-2)', bg: '#3b82f612', border: '#3b82f630', icon: 'ti-info-circle',    label: 'Info' },
}

export default function Alerts({ onCount }: AlertsProps) {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => { loadAlerts() }, [])

  async function loadAlerts() {
    setLoading(true)
    const now = new Date()
    const all: Alert[] = []

    // 1. Conversaciones pendientes de escalación
    const { data: pendConvs } = await supabase
      .from('conversations')
      .select('id, updated_at, businesses(name), contacts(phone)')
      .eq('status', 'pending')
      .order('updated_at', { ascending: true })

    for (const c of pendConvs ?? []) {
      const b = (c as any).businesses
      const contact = (c as any).contacts
      all.push({
        id: `pending-${c.id}`, severity: 'critical',
        title: `Conversación escalada — ${b?.name || 'Negocio desconocido'}`,
        detail: `El cliente ${contact?.phone || 'desconocido'} está esperando atención humana.`,
        ago: timeAgo(c.updated_at), icon: 'ti-message-exclamation'
      })
    }

    // 2. Clientes suspendidos
    const { data: suspended } = await supabase
      .from('businesses').select('id, name, suspended_at, suspension_reason').eq('is_active', false)
    for (const b of suspended ?? []) {
      all.push({
        id: `suspended-${b.id}`, severity: 'critical',
        title: `Servicio suspendido — ${b.name}`,
        detail: b.suspension_reason || 'Sin motivo especificado',
        ago: b.suspended_at ? timeAgo(b.suspended_at) : '—', icon: 'ti-player-pause'
      })
    }

    // 3. Trials próximos a vencer (< 5 días)
    const in5 = new Date(now.getTime() + 5 * 86400000).toISOString()
    const { data: expiring } = await supabase
      .from('businesses').select('id, name, trial_ends_at').eq('plan', 'trial').eq('is_active', true)
      .not('trial_ends_at', 'is', null).lte('trial_ends_at', in5)
    for (const b of expiring ?? []) {
      const daysLeft = Math.ceil((new Date(b.trial_ends_at).getTime() - now.getTime()) / 86400000)
      all.push({
        id: `trial-${b.id}`, severity: 'warning',
        title: `Trial vence en ${daysLeft}d — ${b.name}`,
        detail: `Vence el ${new Date(b.trial_ends_at).toLocaleDateString('es-AR')}. Convertir a plan pago.`,
        ago: '', icon: 'ti-clock-hour-4'
      })
    }

    // 4. Clientes sin actividad 7+ días (churn risk)
    const sevenAgo = new Date(now.getTime() - 7 * 86400000).toISOString()
    const { data: bizList } = await supabase.from('businesses').select('id, name').eq('is_active', true)
    for (const b of bizList ?? []) {
      const { data: convIds } = await supabase.from('conversations').select('id').eq('business_id', b.id)
      const ids = (convIds ?? []).map((c: any) => c.id)
      if (ids.length === 0) continue
      const { count } = await supabase.from('messages').select('*', { count: 'exact', head: true }).in('conversation_id', ids).gte('created_at', sevenAgo)
      if ((count ?? 0) === 0) {
        all.push({
          id: `churn-${b.id}`, severity: 'warning',
          title: `Sin actividad — ${b.name}`,
          detail: 'No se registraron mensajes en los últimos 7 días. Riesgo de abandono.',
          ago: '+7d', icon: 'ti-user-off'
        })
      }
    }

    // 5. Info: Railway trial
    all.push({
      id: 'railway-trial', severity: 'info',
      title: 'Railway: Trial activo',
      detail: 'Plan de prueba con límite de $4.87 o 22 días. Actualizar antes de vencer.',
      ago: '', icon: 'ti-server'
    })

    setAlerts(all)
    onCount(all.filter(a => a.severity === 'critical' || a.severity === 'warning').length)
    setLoading(false)
  }

  const dismiss = (id: string) => setDismissed(prev => new Set([...prev, id]))
  const visible = alerts.filter(a => !dismissed.has(a.id))

  const criticals = visible.filter(a => a.severity === 'critical')
  const warnings = visible.filter(a => a.severity === 'warning')
  const infos = visible.filter(a => a.severity === 'info')
  const grouped = [
    { label: 'Críticos', items: criticals },
    { label: 'Avisos', items: warnings },
    { label: 'Información', items: infos },
  ].filter(g => g.items.length > 0)

  return (
    <div style={{ overflowY: 'auto', height: '100%', padding: '20px 24px' }}>
      {/* Summary bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { count: criticals.length, label: 'Críticos', color: 'var(--danger)' },
            { count: warnings.length, label: 'Avisos', color: 'var(--warn)' },
            { count: infos.length, label: 'Info', color: 'var(--accent-2)' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'var(--bg-panel)', border: `1px solid ${s.color}30`, borderRadius: 9, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.count}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{s.label}</span>
            </div>
          ))}
        </div>
        <button onClick={loadAlerts}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 12, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>
          <i className="ti ti-refresh" style={{ fontSize: 13 }} /> Actualizar
        </button>
        {dismissed.size > 0 && (
          <button onClick={() => setDismissed(new Set())}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 12, color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Restaurar {dismissed.size} ocultas
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 72 }} />)}
        </div>
      ) : visible.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 80, color: 'var(--text-3)' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <i className="ti ti-circle-check" style={{ fontSize: 24, color: 'var(--accent)' }} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>Todo en orden</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>No hay alertas activas en este momento</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {grouped.map(group => (
            <div key={group.label}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{group.label}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.items.map(alert => {
                  const st = STYPE[alert.severity]
                  return (
                    <div key={alert.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 10, background: st.bg, border: `1px solid ${st.border}`, transition: 'opacity 0.2s' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: st.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <i className={`ti ${alert.icon}`} style={{ fontSize: 15, color: st.color }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: st.color, marginBottom: 4 }}>{alert.title}</div>
                        <div style={{ fontSize: 12, color: st.color, opacity: 0.75 }}>{alert.detail}</div>
                        {alert.ago && <div style={{ fontSize: 10, color: st.color, opacity: 0.5, marginTop: 4 }}>Hace {alert.ago}</div>}
                      </div>
                      <button onClick={() => dismiss(alert.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: st.color, opacity: 0.5, padding: 4, display: 'flex', flexShrink: 0 }}
                        title="Ocultar">
                        <i className="ti ti-x" style={{ fontSize: 13 }} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
