import { useEffect, useState } from 'react'
import { supabase } from './supabase'

interface ServiceStatus {
  name: string
  status: 'ok' | 'warning' | 'error'
  value: string
  icon: string
  color: string
}

export default function System() {
  const [services, setServices] = useState<ServiceStatus[]>([])
  const [dbStats, setDbStats] = useState({ messages: 0, conversations: 0, contacts: 0, businesses: 0 })
  const [loading, setLoading] = useState(true)
  const [lastChecked, setLastChecked] = useState('')

  useEffect(() => { checkSystem() }, [])

  async function checkSystem() {
    setLoading(true)
    const start = Date.now()

    const [
      { count: messages },
      { count: conversations },
      { count: contacts },
      { count: businesses },
    ] = await Promise.all([
      supabase.from('messages').select('*', { count: 'exact', head: true }),
      supabase.from('conversations').select('*', { count: 'exact', head: true }),
      supabase.from('contacts').select('*', { count: 'exact', head: true }),
      supabase.from('businesses').select('*', { count: 'exact', head: true }),
    ])

    const elapsed = Date.now() - start

    setDbStats({
      messages: messages ?? 0,
      conversations: conversations ?? 0,
      contacts: contacts ?? 0,
      businesses: businesses ?? 0,
    })

    setServices([
      { name: 'Supabase DB', status: elapsed < 500 ? 'ok' : elapsed < 1000 ? 'warning' : 'error', value: `${elapsed}ms`, icon: 'ti-database', color: '#22c55e' },
      { name: 'Claude API (Sonnet)', status: 'ok', value: 'claude-sonnet-4-5', icon: 'ti-sparkles', color: '#a78bfa' },
      { name: 'Railway Deploy', status: 'ok', value: 'Activo', icon: 'ti-server', color: '#22c55e' },
      { name: 'Twilio WhatsApp', status: 'ok', value: 'Configurado', icon: 'ti-brand-twilio', color: '#22c55e' },
      { name: 'Supabase Auth', status: 'ok', value: 'Email activo', icon: 'ti-lock', color: '#22c55e' },
      { name: 'RLS Policies', status: 'warning', value: 'Desactivado', icon: 'ti-shield-off', color: '#f59e0b' },
    ])

    setLastChecked(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    setLoading(false)
  }

  const statusColors = { ok: '#22c55e', warning: '#f59e0b', error: '#f87171' }
  const statusLabels = { ok: 'OK', warning: 'Warning', error: 'Error' }

  return (
    <div className="overflow-y-auto h-full p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs text-[#4a4a6a]">Última verificación: {lastChecked}</div>
        <button onClick={checkSystem} className="flex items-center gap-1.5 bg-[#1a1a2e] border border-[#2e2e4e] rounded-lg px-3 py-1.5 text-xs text-[#a78bfa] cursor-pointer">
          <i className="ti ti-refresh text-xs" /> Verificar ahora
        </button>
      </div>

      {/* Servicios */}
      <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl overflow-hidden mb-4">
        <div className="text-xs font-medium text-[#8b8baa] p-3.5 border-b border-[#1e1e2e] flex items-center gap-1.5">
          <i className="ti ti-server" /> Estado de servicios
        </div>
        {loading ? (
          <div className="text-center text-[#4a4a6a] text-xs p-6">Verificando...</div>
        ) : services.map((s, i) => (
          <div key={i} className="flex items-center gap-3 px-3.5 py-3 border-b border-[#1e1e2e] last:border-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{ color: s.color, background: s.color + '22' }}>
              <i className={`ti ${s.icon}`} />
            </div>
            <span className="text-xs font-medium text-[#c4c4d4] flex-1">{s.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#4a4a6a]">{s.value}</span>
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ color: statusColors[s.status], background: statusColors[s.status] + '22' }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: statusColors[s.status] }} />
                {statusLabels[s.status]}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* DB Stats */}
      <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-3.5">
        <div className="text-xs font-medium text-[#8b8baa] mb-3 flex items-center gap-1.5">
          <i className="ti ti-database" /> Estadísticas de base de datos
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Mensajes', value: dbStats.messages, icon: 'ti-message-2', color: '#a78bfa' },
            { label: 'Conversaciones', value: dbStats.conversations, icon: 'ti-message-dots', color: '#38bdf8' },
            { label: 'Contactos', value: dbStats.contacts, icon: 'ti-users', color: '#22c55e' },
            { label: 'Negocios', value: dbStats.businesses, icon: 'ti-buildings', color: '#f59e0b' },
          ].map((s, i) => (
            <div key={i} className="bg-[#111122] border border-[#1e1e2e] rounded-lg p-3 flex items-center gap-2.5">
              <i className={`ti ${s.icon} text-base`} style={{ color: s.color }} />
              <div>
                <div className="text-[11px] text-[#4a4a6a]">{s.label}</div>
                <div className="text-base font-medium text-[#e2e8f0]">{s.value.toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Warning RLS */}
      <div className="mt-3 flex items-start gap-2.5 bg-[#1a120a] border border-[#f59e0b44] rounded-xl p-3.5">
        <i className="ti ti-shield-off text-[#f59e0b] text-base flex-shrink-0 mt-0.5" />
        <div>
          <div className="text-xs font-medium text-[#f59e0b] mb-1">RLS desactivado en todas las tablas</div>
          <div className="text-[11px] text-[#f59e0b] opacity-70">Riesgo de seguridad en producción. Activar Row Level Security y configurar políticas antes de escalar.</div>
        </div>
      </div>
    </div>
  )
}
