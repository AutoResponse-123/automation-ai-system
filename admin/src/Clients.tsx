import { useEffect, useState } from 'react'
import { supabase } from './supabase'

interface Business {
  id: string; name: string; type: string; is_active: boolean; plan: string
  trial_ends_at: string | null; suspended_at: string | null; suspension_reason: string | null
  created_at: string; user_id: string; phone_whatsapp: string; escalation_email: string
  msg_count?: number; contact_count?: number; token_count?: number; conv_count?: number
}

function timeAgo(d: string) {
  const s = (Date.now() - new Date(d).getTime()) / 1000
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

const PLAN_COLORS: Record<string, string> = {
  trial: 'var(--warn)', starter: 'var(--accent-2)', pro: 'var(--accent)', enterprise: 'var(--purple)'
}
const PLANS = ['trial', 'starter', 'pro', 'enterprise']

const SEED_COLORS = ['#10b981','#f59e0b','#3b82f6','#8b5cf6','#ef4444','#ec4899']
function seedColor(id: string) {
  let h = 0; for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h)
  return SEED_COLORS[Math.abs(h) % SEED_COLORS.length]
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, color, background: color + '18', borderRadius: 4, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {label}
    </span>
  )
}

export default function Clients() {
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Business | null>(null)
  const [search, setSearch] = useState('')
  const [filterPlan, _setFilterPlan] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [suspendReason, setSuspendReason] = useState('')
  const [showSuspend, setShowSuspend] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState('')
  const [newForm, setNewForm] = useState({ name: '', email: '', plan: 'trial', trial_days: '14' })

  async function handleCreateClient() {
    if (!newForm.name || !newForm.email) { setCreateError('Nombre y email son requeridos'); return }
    setSaving(true); setCreateError('')
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'https://automation-ai-system-production.up.railway.app'
      const res = await fetch(backendUrl + '/api/admin/create-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': import.meta.env.VITE_ADMIN_SECRET || '' },
        body: JSON.stringify({ name: newForm.name, email: newForm.email, plan: newForm.plan, trial_days: Number(newForm.trial_days) }),
      })
      const data = await res.json()
      if (!res.ok) { setCreateError(data.error || 'Error al crear cliente'); return }
      setShowCreate(false)
      setNewForm({ name: '', email: '', plan: 'trial', trial_days: '14' })
      loadBusinesses()
    } catch (e: any) {
      setCreateError(e.message)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => { loadBusinesses() }, [])

  async function loadBusinesses() {
    setLoading(true)
    const { data } = await supabase.from('businesses').select('*').order('created_at', { ascending: false })
    if (!data) { setLoading(false); return }

    const enriched = await Promise.all(data.map(async b => {
      const [{ count: msg_count }, { count: contact_count }, { count: conv_count }, { data: tokens }] = await Promise.all([
        supabase.from('messages').select('id', { count: 'exact' }),
        supabase.from('contacts').select('id', { count: 'exact' }).eq('business_id', b.id),
        supabase.from('conversations').select('id', { count: 'exact' }).eq('business_id', b.id),
        supabase.from('messages').select('tokens_used').eq('sender', 'assistant').not('tokens_used', 'is', null)
      ])
      return { ...b, msg_count: msg_count ?? 0, contact_count: contact_count ?? 0, conv_count: conv_count ?? 0, token_count: tokens?.reduce((s, r) => s + (r.tokens_used || 0), 0) ?? 0 }
    }))

    setBusinesses(enriched)
    if (selected) setSelected(enriched.find(b => b.id === selected.id) ?? null)
    setLoading(false)
  }

  async function toggleActive(b: Business) {
    if (!b.is_active) {
      setSaving(true)
      await supabase.from('businesses').update({ is_active: true, suspended_at: null, suspension_reason: null }).eq('id', b.id)
      await loadBusinesses(); setSaving(false)
    } else {
      setSuspendReason(''); setShowSuspend(true)
    }
  }

  async function confirmSuspend() {
    if (!selected) return
    setSaving(true)
    await supabase.from('businesses').update({
      is_active: false, suspended_at: new Date().toISOString(),
      suspension_reason: suspendReason || 'Suspendido por administrador'
    }).eq('id', selected.id)
    setShowSuspend(false); await loadBusinesses(); setSaving(false)
  }

  async function updatePlan(b: Business, plan: string) {
    await supabase.from('businesses').update({ plan }).eq('id', b.id)
    await loadBusinesses()
  }

  const filtered = businesses.filter(b => {
    const matchSearch = b.name?.toLowerCase().includes(search.toLowerCase()) || (b.phone_whatsapp || '').includes(search)
    const matchPlan = filterPlan === 'all' || b.plan === filterPlan
    const matchStatus = filterStatus === 'all' || (filterStatus === 'active' ? b.is_active : !b.is_active)
    return matchSearch && matchPlan && matchStatus
  })

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', position: 'relative' }}>
      {/* List panel */}
      <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)' }}>
        {/* Search + filters */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', marginBottom: 8 }}>
            <i className="ti ti-search" style={{ fontSize: 13, color: 'var(--text-3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cliente..."
              style={{ background: 'none', border: 'none', outline: 'none', fontSize: 12, color: 'var(--text-1)', flex: 1, fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['all','active','suspended'].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                style={{ flex: 1, padding: '4px 0', borderRadius: 6, border: '1px solid ' + (filterStatus === s ? 'var(--accent)' : 'var(--border)'), background: filterStatus === s ? 'var(--accent-dim)' : 'transparent', fontSize: 10, color: filterStatus === s ? 'var(--accent)' : 'var(--text-3)', cursor: 'pointer', fontFamily: 'inherit' }}>
                {s === 'all' ? 'Todos' : s === 'active' ? 'Activos' : 'Suspendidos'}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 52 }} />)}
            </div>
          ) : filtered.map(b => {
            const color = seedColor(b.id)
            const active = selected?.id === b.id
            return (
              <div key={b.id} onClick={() => setSelected(b)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', cursor: 'pointer',
                  borderLeft: `3px solid ${active ? 'var(--accent)' : 'transparent'}`,
                  background: active ? 'var(--bg-hover)' : 'transparent',
                  transition: 'all 0.1s', borderBottom: '1px solid var(--border)'
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-raised)' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 8, background: color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color, flexShrink: 0, position: 'relative' }}>
                  {b.name?.slice(0,2).toUpperCase() || '??'}
                  {!b.is_active && <div style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', border: '2px solid var(--bg-panel)' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{b.plan || 'trial'} · {b.msg_count || 0} msgs</div>
                </div>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: b.is_active ? 'var(--accent)' : 'var(--danger)', flexShrink: 0 }} />
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{filtered.length} clientes · {filtered.filter(b => b.is_active).length} activos</span>
          <button onClick={() => setShowCreate(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--accent)', border: 'none', borderRadius: 6, padding: '5px 9px', fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
            <i className="ti ti-plus" style={{ fontSize: 12 }} /> Nuevo
          </button>
        </div>
      </div>

      {/* Detail panel */}
      {selected ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }} className="fade-in">
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: seedColor(selected.id) + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: seedColor(selected.id), flexShrink: 0 }}>
              {selected.name?.slice(0,2).toUpperCase() || '??'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>{selected.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Badge label={selected.plan || 'trial'} color={PLAN_COLORS[selected.plan] || 'var(--text-2)'} />
                <Badge label={selected.is_active ? 'activo' : 'suspendido'} color={selected.is_active ? 'var(--accent)' : 'var(--danger)'} />
                {selected.type && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{selected.type}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={selected.plan || 'trial'} onChange={e => updatePlan(selected, e.target.value)}
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 10px', fontSize: 12, color: 'var(--text-1)', cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }}>
                {PLANS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
              <button onClick={() => toggleActive(selected)} disabled={saving}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                  borderRadius: 7, border: `1px solid ${selected.is_active ? '#ef444440' : '#10b98140'}`,
                  background: selected.is_active ? '#ef444412' : '#10b98112',
                  color: selected.is_active ? 'var(--danger)' : 'var(--accent)',
                  fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit'
                }}>
                <i className={`ti ${selected.is_active ? 'ti-player-pause' : 'ti-player-play'}`} style={{ fontSize: 12 }} />
                {selected.is_active ? 'Suspender' : 'Reactivar'}
              </button>
            </div>
          </div>

          {/* Suspension alert */}
          {!selected.is_active && (
            <div style={{ display: 'flex', gap: 12, background: '#ef444410', border: '1px solid #ef444430', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
              <i className="ti ti-alert-circle" style={{ fontSize: 16, color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)', marginBottom: 3 }}>Servicio suspendido</div>
                <div style={{ fontSize: 11, color: 'var(--danger)', opacity: 0.75 }}>{selected.suspension_reason || 'Sin motivo'}</div>
                {selected.suspended_at && <div style={{ fontSize: 10, color: 'var(--danger)', opacity: 0.5, marginTop: 3 }}>Desde hace {timeAgo(selected.suspended_at)}</div>}
              </div>
            </div>
          )}

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Mensajes', value: (selected.msg_count || 0).toLocaleString(), icon: 'ti-message-2', color: 'var(--accent-2)' },
              { label: 'Contactos', value: (selected.contact_count || 0).toLocaleString(), icon: 'ti-users', color: 'var(--accent)' },
              { label: 'Conversaciones', value: (selected.conv_count || 0).toLocaleString(), icon: 'ti-messages', color: 'var(--purple)' },
              { label: 'Costo API', value: `$${((selected.token_count || 0) * 0.000003).toFixed(4)}`, icon: 'ti-currency-dollar', color: 'var(--warn)' },
            ].map((s, i) => (
              <div key={i} style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <i className={`ti ${s.icon}`} style={{ fontSize: 14, color: s.color }} />
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{s.label}</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-1)' }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Info */}
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Información técnica</div>
            {[
              { label: 'Business ID', value: selected.id, mono: true },
              { label: 'User ID', value: selected.user_id || '—', mono: true },
              { label: 'WhatsApp', value: selected.phone_whatsapp || '—', mono: true },
              { label: 'Email escalación', value: selected.escalation_email || '—' },
              { label: 'Trial vence', value: selected.trial_ends_at ? new Date(selected.trial_ends_at).toLocaleDateString('es-AR') : '—' },
              { label: 'Creado hace', value: timeAgo(selected.created_at) },
            ].map((r, i, arr) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)', width: 140, flexShrink: 0 }}>{r.label}</span>
                <span className={r.mono ? 'mono' : ''} style={{ fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
          <i className="ti ti-buildings" style={{ fontSize: 36, marginBottom: 10 }} />
          <p style={{ fontSize: 13, margin: 0 }}>Seleccioná un cliente</p>
        </div>
      )}

      {/* Modal: Suspender */}
      {showSuspend && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '28px 28px', width: 380 }} className="fade-in">
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 6 }}>Suspender servicio</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20 }}>El bot dejará de responder mensajes de {selected?.name}.</div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Motivo</label>
            <input value={suspendReason} onChange={e => setSuspendReason(e.target.value)}
              placeholder="Pago pendiente, cuenta vencida..."
              style={{ width: '100%', background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit', marginBottom: 20 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowSuspend(false)} style={{ flex: 1, background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '9px', fontSize: 12, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={confirmSuspend} disabled={saving} style={{ flex: 1, background: '#ef444418', border: '1px solid #ef444440', borderRadius: 8, padding: '9px', fontSize: 12, fontWeight: 600, color: 'var(--danger)', cursor: 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'Suspendiendo...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Nuevo cliente */}
      {showCreate && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '28px 28px', width: 400 }} className="fade-in">
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>Nuevo cliente</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 22 }}>Crea una cuenta manualmente.</div>
            {[
              { label: 'Nombre del negocio', key: 'name', placeholder: 'Ej: Peluquería Ana' },
              { label: 'Email del dueño', key: 'email', placeholder: 'cliente@email.com' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>{f.label}</label>
                <input value={(newForm as any)[f.key]} onChange={e => setNewForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={{ width: '100%', background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit' }} />
              </div>
            ))}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Plan inicial</label>
              <select value={newForm.plan} onChange={e => setNewForm(prev => ({ ...prev, plan: e.target.value }))}
                style={{ width: '100%', background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: 'var(--text-1)', cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }}>
                {PLANS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Días de trial</label>
              <input type="number" value={newForm.trial_days} onChange={e => setNewForm(prev => ({ ...prev, trial_days: e.target.value }))}
                min="1" max="90" disabled={newForm.plan !== 'trial'}
                style={{ width: '100%', background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: newForm.plan !== 'trial' ? 'var(--text-3)' : 'var(--text-1)', outline: 'none', fontFamily: 'inherit' }} />
            </div>
            {createError && <div style={{ background: '#ef444418', border: '1px solid #ef444440', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#ef4444', marginBottom: 14 }}>{createError}</div>}
            <div style={{ background: 'var(--warn)18', border: '1px solid var(--warn)40', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--warn)', marginBottom: 20 }}>
              <i className="ti ti-info-circle" style={{ marginRight: 6 }} />
              Se crea el usuario en Auth y el negocio en la DB. El cliente recibirá un email para configurar su contraseña.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowCreate(false); setCreateError('') }} disabled={saving} style={{ flex: 1, background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '9px', fontSize: 12, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={handleCreateClient} disabled={saving} style={{ flex: 1, background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '9px', fontSize: 12, fontWeight: 600, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: 'inherit' }}>
                {saving ? 'Creando...' : 'Crear cliente →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
