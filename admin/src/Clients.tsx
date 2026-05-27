import { useEffect, useState } from 'react'
import { supabase } from './supabase'

interface Business {
  id: string
  name: string
  type: string
  is_active: boolean
  plan: string
  trial_ends_at: string | null
  suspended_at: string | null
  suspension_reason: string | null
  created_at: string
  user_id: string
  msg_count?: number
  contact_count?: number
  token_count?: number
  conv_count?: number
}

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

const AVATAR_COLORS = ['#a78bfa','#f59e0b','#22c55e','#f87171','#38bdf8','#e879f9']
function avatarColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

const PLANS = ['starter', 'pro', 'enterprise', 'trial']

export default function Clients() {
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Business | null>(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [showSuspendModal, setShowSuspendModal] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadBusinesses() }, [])

  async function loadBusinesses() {
    setLoading(true)
    const { data } = await supabase.from('businesses').select('*').order('created_at', { ascending: false })
    if (!data) { setLoading(false); return }

    const enriched = await Promise.all(data.map(async (b) => {
      const [
        { count: msg_count },
        { count: contact_count },
        { count: conv_count },
        { data: tokens }
      ] = await Promise.all([
        supabase.from('messages').select('*', { count: 'exact', head: true }),
        supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('business_id', b.id),
        supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('business_id', b.id),
        supabase.from('messages').select('tokens_used').eq('sender', 'assistant').not('tokens_used', 'is', null)
      ])
      const token_count = tokens?.reduce((s, m) => s + (m.tokens_used || 0), 0) ?? 0
      return { ...b, msg_count: msg_count ?? 0, contact_count: contact_count ?? 0, conv_count: conv_count ?? 0, token_count }
    }))

    setBusinesses(enriched)
    if (selected) setSelected(enriched.find(b => b.id === selected.id) ?? null)
    setLoading(false)
  }

  async function toggleActive(b: Business) {
    if (!b.is_active) {
      // Reactivar
      setSaving(true)
      await supabase.from('businesses').update({ is_active: true, suspended_at: null, suspension_reason: null }).eq('id', b.id)
      await loadBusinesses()
      setSaving(false)
    } else {
      // Mostrar modal para suspender
      setSuspendReason('')
      setShowSuspendModal(true)
    }
  }

  async function confirmSuspend() {
    if (!selected) return
    setSaving(true)
    await supabase.from('businesses').update({
      is_active: false,
      suspended_at: new Date().toISOString(),
      suspension_reason: suspendReason || 'Suspendido por administrador'
    }).eq('id', selected.id)
    setShowSuspendModal(false)
    await loadBusinesses()
    setSaving(false)
  }

  async function updatePlan(b: Business, plan: string) {
    await supabase.from('businesses').update({ plan }).eq('id', b.id)
    await loadBusinesses()
  }

  const filtered = businesses.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    (b.type ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex h-full overflow-hidden relative">
      {/* Lista */}
      <div className="w-72 border-r border-[#1e1e2e] flex flex-col bg-[#0d0d14]">
        <div className="p-3 border-b border-[#1e1e2e]">
          <div className="flex items-center gap-2 bg-[#111122] border border-[#2e2e4e] rounded-lg px-2.5 py-1.5">
            <i className="ti ti-search text-[#4a4a6a] text-xs" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="bg-transparent border-none text-xs text-[#e2e8f0] outline-none flex-1" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center text-[#4a4a6a] text-xs p-6">Cargando...</div>
          ) : filtered.map(b => {
            const color = avatarColor(b.id)
            return (
              <div key={b.id} onClick={() => setSelected(b)}
                className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer border-l-2 transition-all ${selected?.id === b.id ? 'bg-[#111122] border-l-[#a78bfa]' : 'border-l-transparent hover:bg-[#0f0f1a]'}`}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0 relative" style={{ color, background: color + '22' }}>
                  {b.name.slice(0,2).toUpperCase()}
                  {!b.is_active && <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 border border-[#0d0d14]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-[#c4c4d4] truncate">{b.name}</div>
                  <div className="text-[10px] text-[#4a4a6a]">{b.plan ?? 'starter'} · {b.type}</div>
                </div>
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${b.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
              </div>
            )
          })}
        </div>
        <div className="p-2 border-t border-[#1e1e2e] text-[10px] text-[#4a4a6a] text-center">
          {filtered.length} clientes · {filtered.filter(b => b.is_active).length} activos
        </div>
      </div>

      {/* Detalle */}
      {selected ? (
        <div className="flex-1 overflow-y-auto p-5">
          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium" style={{ color: avatarColor(selected.id), background: avatarColor(selected.id) + '22' }}>
              {selected.name.slice(0,2).toUpperCase()}
            </div>
            <div>
              <div className="text-base font-medium text-[#e2e8f0]">{selected.name}</div>
              <div className="text-xs text-[#4a4a6a]">{selected.type} · creado hace {timeAgo(selected.created_at)}</div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {/* Plan selector */}
              <select value={selected.plan ?? 'starter'} onChange={e => updatePlan(selected, e.target.value)}
                className="bg-[#1a1a2e] border border-[#2e2e4e] rounded-lg px-2 py-1 text-xs text-[#a78bfa] outline-none cursor-pointer">
                {PLANS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
              {/* Toggle activo/suspendido */}
              <button onClick={() => toggleActive(selected)} disabled={saving}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer transition-all disabled:opacity-50 ${selected.is_active ? 'bg-[#2e0e0e] border-red-500/30 text-red-400 hover:bg-red-500/20' : 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20'}`}>
                <i className={`ti ${selected.is_active ? 'ti-player-pause' : 'ti-player-play'} text-xs`} />
                {selected.is_active ? 'Suspender' : 'Reactivar'}
              </button>
            </div>
          </div>

          {/* Alerta suspendido */}
          {!selected.is_active && (
            <div className="flex items-start gap-2.5 bg-[#2e0e0e] border border-red-500/30 rounded-xl p-3.5 mb-4">
              <i className="ti ti-alert-circle text-red-400 text-base flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-medium text-red-400 mb-1">Servicio suspendido</div>
                <div className="text-[11px] text-red-400 opacity-80">{selected.suspension_reason ?? 'Sin motivo especificado'}</div>
                {selected.suspended_at && <div className="text-[10px] text-red-400 opacity-60 mt-1">Desde hace {timeAgo(selected.suspended_at)}</div>}
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              { label: 'Mensajes totales', value: (selected.msg_count ?? 0).toLocaleString(), icon: 'ti-message-2', color: '#a78bfa' },
              { label: 'Contactos', value: (selected.contact_count ?? 0).toLocaleString(), icon: 'ti-users', color: '#22c55e' },
              { label: 'Conversaciones', value: (selected.conv_count ?? 0).toLocaleString(), icon: 'ti-message-dots', color: '#38bdf8' },
              { label: 'Costo estimado', value: `$${((selected.token_count ?? 0) * 0.000003).toFixed(4)}`, icon: 'ti-currency-dollar', color: '#f59e0b' },
            ].map((s, i) => (
              <div key={i} className="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-3.5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0" style={{ color: s.color, background: s.color + '22' }}>
                  <i className={`ti ${s.icon}`} />
                </div>
                <div>
                  <div className="text-[11px] text-[#4a4a6a]">{s.label}</div>
                  <div className="text-lg font-medium text-[#e2e8f0]">{s.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Info técnica */}
          <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-3.5">
            <div className="text-xs font-medium text-[#8b8baa] mb-3">Info técnica</div>
            {[
              { label: 'Business ID', value: selected.id },
              { label: 'User ID', value: selected.user_id ?? 'Sin vincular' },
              { label: 'Plan', value: selected.plan ?? 'starter' },
              { label: 'Trial vence', value: selected.trial_ends_at ? new Date(selected.trial_ends_at).toLocaleDateString('es-AR') : '—' },
            ].map((row, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-[#1e1e2e] last:border-0">
                <span className="text-xs text-[#4a4a6a]">{row.label}</span>
                <span className="text-xs text-[#8b8baa] font-mono truncate max-w-[220px]">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-[#4a4a6a]">
          <i className="ti ti-buildings text-3xl mb-3" />
          <p className="text-xs">Seleccioná un cliente</p>
        </div>
      )}

      {/* Modal suspender */}
      {showSuspendModal && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#0d0d14] border border-[#2e2e4e] rounded-2xl p-6 w-96">
            <div className="text-sm font-medium text-[#e2e8f0] mb-1">Suspender servicio</div>
            <div className="text-xs text-[#4a4a6a] mb-4">El bot dejará de responder mensajes de este cliente.</div>
            <label className="text-xs font-medium text-[#8b8baa] block mb-2">Motivo (opcional)</label>
            <input value={suspendReason} onChange={e => setSuspendReason(e.target.value)}
              placeholder="Ej: Pago pendiente, cuenta vencida..."
              className="w-full bg-[#111122] border border-[#2e2e4e] rounded-lg px-3 py-2.5 text-xs text-[#e2e8f0] outline-none mb-4" />
            <div className="flex gap-2">
              <button onClick={() => setShowSuspendModal(false)}
                className="flex-1 bg-transparent border border-[#2e2e4e] rounded-lg py-2 text-xs text-[#4a4a6a] cursor-pointer">
                Cancelar
              </button>
              <button onClick={confirmSuspend} disabled={saving}
                className="flex-1 bg-red-500/20 border border-red-500/30 rounded-lg py-2 text-xs text-red-400 font-medium cursor-pointer disabled:opacity-50">
                {saving ? 'Suspendiendo...' : 'Confirmar suspensión'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
