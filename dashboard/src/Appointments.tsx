import { useEffect, useState } from 'react'
import { useT } from './i18n'
import { supabase } from './supabase'

interface Appointment {
  id: string
  title: string
  category: string | null
  client_name: string
  client_phone: string
  appointment_date: string
  appointment_time: string
  duration_minutes: number
  reminder_24h_sent: boolean
  reminder_1h_sent: boolean
  status: string
  notes: string | null
  created_at: string
}

interface AppointmentCategory {
  id: string
  name: string
  duration_minutes: number
  color: string
}

type Filter = 'upcoming' | 'past' | 'today'

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
}

function formatTime(t: string) {
  return t?.slice(0, 5) ?? ''
}

const pill = (label: string, color: string) => (
  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: color + '22', color, border: `1px solid ${color}44` }}>
    {label}
  </span>
)

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

export default function Appointments({ businessId }: { businessId: string }) {
  const t = useT()
  const [appts, setAppts] = useState<Appointment[]>([])
  const [filter, setFilter] = useState<Filter>('upcoming')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categories, setCategories] = useState<AppointmentCategory[]>([])
  const [activeCat, setActiveCat] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')

  async function saveNote(apptId: string) {
    await supabase.from('appointments').update({ notes: noteText || null }).eq('id', apptId)
    setAppts(prev => prev.map(a => a.id === apptId ? { ...a, notes: noteText || null } : a))
    setEditingNoteId(null)
  }

  function exportCSV() {
    const rows = [['Cliente', 'Teléfono', 'Servicio', 'Categoría', 'Fecha', 'Hora', 'Estado', 'Notas']]
    filtered.forEach(a => rows.push([
      a.client_name || '', a.client_phone || '', a.title || '',
      a.category || '', a.appointment_date, String(a.appointment_time).slice(0,5),
      a.status || 'scheduled', a.notes || ''
    ]))
    const csv = rows.map(r => r.map(v => '"' + v + '"').join(',')).join('\n')
    const el = document.createElement('a')
    el.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    el.download = 'turnos_' + new Date().toISOString().slice(0,10) + '.csv'
    el.click()
  }

  async function cancelAppt(apptId: string) {
    setCancellingId(apptId)
    setConfirmingId(null)
    try {
      const res = await fetch(`${BACKEND_URL}/api/webhooks/appointments/${apptId}/cancel`, { method: 'POST' })
      if (!res.ok) throw new Error('Error cancelando')
      setAppts(prev => prev.map(a => a.id === apptId ? { ...a, status: 'cancelled' } : a))
    } catch (e: any) {
      alert('No se pudo cancelar: ' + e.message)
    } finally {
      setCancellingId(null)
    }
  }

  useEffect(() => {
    if (!businessId) return
    loadAppts()
    loadCategories()
  }, [businessId, filter])

  async function loadCategories() {
    const { data } = await supabase.from('businesses').select('appointment_categories').eq('id', businessId).single()
    setCategories(data?.appointment_categories ?? [])
  }

  async function loadAppts() {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]
    let q = supabase.from('appointments').select('*').eq('business_id', businessId)
    if (filter === 'today') q = q.eq('appointment_date', today)
    else if (filter === 'upcoming') q = q.gte('appointment_date', today).order('appointment_date').order('appointment_time')
    else q = q.lt('appointment_date', today).order('appointment_date', { ascending: false }).order('appointment_time', { ascending: false })
    const { data } = await q.limit(100)
    setAppts(data ?? [])
    setLoading(false)
  }

  const filtered = appts.filter(a => {
    const matchSearch = !search ||
      a.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      a.client_phone?.includes(search) ||
      a.title?.toLowerCase().includes(search.toLowerCase())
    const matchCat = !activeCat || a.category === activeCat ||
      (!a.category && a.title?.toLowerCase() === activeCat.toLowerCase())
    return matchSearch && matchCat
  })

  const today = new Date().toISOString().split('T')[0]
  const todayCount = appts.filter(a => a.appointment_date === today).length

  const s = {
    wrap: { padding: '24px 28px', maxWidth: 900, margin: '0 auto' } as React.CSSProperties,
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap' as const, gap: 12 },
    title: { fontSize: 18, fontWeight: 700, color: 'var(--text-1)', margin: 0 },
    filters: { display: 'flex', gap: 6 },
    filterBtn: (active: boolean) => ({
      padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
      background: active ? 'var(--accent)' : 'var(--surface-2)',
      color: active ? '#fff' : 'var(--text-2)',
    } as React.CSSProperties),
    searchWrap: { position: 'relative' as const, marginBottom: 16 },
    search: { width: '100%', boxSizing: 'border-box' as const, padding: '9px 12px 9px 36px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)', fontSize: 13, outline: 'none' },
    searchIcon: { position: 'absolute' as const, left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', fontSize: 15, pointerEvents: 'none' as const },
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 16 } as React.CSSProperties,
    date: { minWidth: 72, textAlign: 'center' as const },
    dateDay: { fontSize: 22, fontWeight: 700, color: 'var(--accent)', lineHeight: 1 },
    dateLabel: { fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase' as const, marginTop: 2 },
    divider: { width: 1, height: 48, background: 'var(--border)' },
    info: { flex: 1, minWidth: 0 },
    clientName: { fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 3 },
    meta: { fontSize: 12, color: 'var(--text-2)', display: 'flex', gap: 10, flexWrap: 'wrap' as const, alignItems: 'center' },
    empty: { textAlign: 'center' as const, padding: '48px 0', color: 'var(--text-3)', fontSize: 14 },
    stat: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 18px', display: 'flex', flexDirection: 'column' as const, gap: 2 } as React.CSSProperties,
    statVal: { fontSize: 24, fontWeight: 700, color: 'var(--accent)' },
    statLabel: { fontSize: 11, color: 'var(--text-3)' },
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div>
          <h2 style={s.title}>📅 {t('appointments_title')}</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-mid)', background: 'transparent', color: '#8b8baa', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            <i className="ti ti-download" style={{ fontSize: 13 }} /> CSV
          </button>
          <div style={s.filters}>
          {(['upcoming', 'today', 'past'] as Filter[]).map(f => (
            <button key={f} style={s.filterBtn(filter === f)} onClick={() => setFilter(f)}>
              {f === 'upcoming' ? t('appointments_upcoming') : f === 'today' ? `${t('appointments_today')} (${todayCount})` : t('appointments_past')}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        <div style={s.stat}><span style={s.statVal}>{todayCount}</span><span style={s.statLabel}>{t('appointments_stat_today')}</span></div>
        <div style={s.stat}><span style={s.statVal}>{appts.filter(a => a.appointment_date >= today).length}</span><span style={s.statLabel}>{t('appointments_stat_upcoming')}</span></div>
        <div style={s.stat}><span style={s.statVal}>{appts.filter(a => a.reminder_24h_sent).length}</span><span style={s.statLabel}>{t('appointments_stat_reminders')}</span></div>
      </div>

      {/* Category filters */}
      {categories.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' as const }}>
          <button
            style={{ ...s.filterBtn(activeCat === null), fontSize: 11 }}
            onClick={() => setActiveCat(null)}>
            Todas
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCat(activeCat === cat.name ? null : cat.name)}
              style={{
                padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                border: activeCat === cat.name ? 'none' : `1px solid ${cat.color}44`,
                background: activeCat === cat.name ? cat.color : cat.color + '18',
                color: activeCat === cat.name ? '#fff' : cat.color,
              }}>
              {cat.name}
              <span style={{ marginLeft: 5, opacity: 0.7, fontSize: 10 }}>
                {appts.filter(a => a.category === cat.name || (!a.category && a.title?.toLowerCase() === cat.name.toLowerCase())).length}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <div style={s.searchWrap}>
        <i className="ti ti-search" style={s.searchIcon} />
        <input style={s.search} placeholder={t('appointments_search')} value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div style={s.empty}>{t('loading')}</div>
      ) : filtered.length === 0 ? (
        <div style={s.empty}>
          {filter === 'upcoming' ? t('appointments_no_upcoming') : filter === 'today' ? t('appointments_no_today') : t('appointments_no_past')}
        </div>
      ) : (
        filtered.map(appt => {
          const isToday = appt.appointment_date === today
          const isPast = appt.appointment_date < today
          return (
            <div key={appt.id} style={{ ...s.card, borderLeft: isToday ? '3px solid var(--accent)' : '3px solid transparent' }}>
              <div style={s.date}>
                <div style={s.dateDay}>{new Date(appt.appointment_date + 'T00:00:00').getDate()}</div>
                <div style={s.dateLabel}>{formatDate(appt.appointment_date).split(' ').slice(1).join(' ')}</div>
              </div>
              <div style={s.divider} />
              <div style={s.info}>
                <div style={s.clientName}>{appt.client_name || t('appointments_no_name')}</div>
                <div style={s.meta}>
                  <span>🕐 {formatTime(appt.appointment_time)}</span>
                  {appt.duration_minutes && <span>⏱ {appt.duration_minutes}min</span>}
                  {appt.client_phone && <span>📱 {appt.client_phone}</span>}
                  {appt.title && (() => {
                    const cat = categories.find(c => c.name === (appt.category || appt.title))
                    return <span style={{ color: cat?.color ?? 'var(--accent)', fontWeight: 500 }}>• {appt.title}</span>
                  })()}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                {appt.status === 'cancelled' && pill('❌ Cancelado', '#dc2626')}
                {appt.status !== 'cancelled' && isToday && pill(t('appointments_pill_today'), '#10b981')}
                {appt.status !== 'cancelled' && isPast && pill(t('appointments_pill_past'), '#6b7280')}
                {appt.reminder_24h_sent && pill('✓ 24h', '#7c3aed')}
                {appt.reminder_1h_sent && pill('✓ 1h', '#7c3aed')}
                {appt.status !== 'cancelled' && !isPast && (
                  confirmingId === appt.id ? (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: '#f87171' }}>¿Confirmar?</span>
                      <button onClick={() => cancelAppt(appt.id)} disabled={cancellingId === appt.id}
                        style={{ padding: '3px 8px', borderRadius: 5, border: 'none', background: '#dc2626', color: '#fff', fontSize: 11, cursor: 'pointer' }}>
                        {cancellingId === appt.id ? '...' : 'Sí'}
                      </button>
                      <button onClick={() => setConfirmingId(null)}
                        style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid #3a3a5a', background: 'transparent', color: '#8080a0', fontSize: 11, cursor: 'pointer' }}>
                        No
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmingId(appt.id)}
                      style={{ marginTop: 4, padding: '4px 10px', borderRadius: 6, border: '1px solid #dc262644', background: '#2e0a0a', color: '#f87171', fontSize: 11, cursor: 'pointer' }}>
                      Cancelar
                    </button>
                  )
                )}
              </div>
            </div>
            {/* Nota interna */}
            {appt.status !== 'cancelled' && (
              <div style={{ padding: '6px 14px 10px', borderTop: '1px solid #1a1a2e' }}>
                {editingNoteId === appt.id ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      autoFocus
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveNote(appt.id); if (e.key === 'Escape') setEditingNoteId(null) }}
                      placeholder="Nota interna..."
                      style={{ flex: 1, background: '#0d0d14', border: '1px solid #2d2d4a', borderRadius: 6, padding: '4px 8px', color: '#e2e8f0', fontSize: 12, outline: 'none' }}
                    />
                    <button onClick={() => saveNote(appt.id)} style={{ padding: '3px 8px', borderRadius: 5, border: 'none', background: 'var(--accent-dark)', color: '#fff', fontSize: 11, cursor: 'pointer' }}>Guardar</button>
                    <button onClick={() => setEditingNoteId(null)} style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid #3a3a5a', background: 'transparent', color: '#8080a0', fontSize: 11, cursor: 'pointer' }}>✕</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                    onClick={() => { setEditingNoteId(appt.id); setNoteText(appt.notes || '') }}>
                    <i className="ti ti-notes" style={{ fontSize: 12, color: '#4a4a6a' }} />
                    <span style={{ fontSize: 11, color: appt.notes ? '#9ca3af' : '#3a3a5a', fontStyle: appt.notes ? 'normal' : 'italic' }}>
                      {appt.notes || 'Agregar nota...'}
                    </span>
                  </div>
                )}
              </div>
            )}
          )
        })
      )}
    </div>
  )
}
