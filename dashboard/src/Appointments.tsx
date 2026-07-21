import React, { useState } from 'react'
import { useT, useLang } from './i18n'
import { supabase } from './supabase'
import { useIsMobile } from './hooks/useIsMobile'
import { useEffect } from 'react'

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

type View = 'calendar' | 'list'

function formatTime(t: string) {
  return t?.slice(0, 5) ?? ''
}

function capWords(str: string) {
  return str.replace(/(^|\s)\S/g, c => c.toUpperCase())
}

// Baja la saturación de un color (lo "apaga") mezclándolo hacia su propia luminancia,
// para que los colores fuertes de las categorías no se vean flúo sobre el fondo oscuro.
function muteHex(hex: string, amount = 0.45): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return hex
  const n = parseInt(m[1], 16)
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const lum = 0.3 * r + 0.59 * g + 0.11 * b
  r = Math.round(r + (lum - r) * amount)
  g = Math.round(g + (lum - g) * amount)
  b = Math.round(b + (lum - b) * amount)
  const h = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

// Texto legible (claro u oscuro) según el brillo del color de fondo.
function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#fff'
  const n = parseInt(m[1], 16)
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return lum > 150 ? '#141414' : '#fff'
}

function formatDayHeader(dateStr: string, lang: 'es' | 'en') {
  const d = new Date(dateStr + 'T00:00:00')
  const locale = lang === 'en' ? 'en-US' : 'es-AR'
  const raw = d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
  return capWords(raw)
}

function formatFullDateTime(dateStr: string, timeStr: string, lang: 'es' | 'en') {
  const d = new Date(dateStr + 'T00:00:00')
  const locale = lang === 'en' ? 'en-US' : 'es-AR'
  const raw = d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return `${capWords(raw)}, ${formatTime(timeStr)}`
}

function toKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function getMonthGrid(monthDate: Date): (Date | null)[] {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const startOffset = (firstDay.getDay() + 6) % 7 // 0 = Monday
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  return cells
}

const pill = (label: string, color: string) => (
  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: color + '22', color, border: `1px solid ${color}44`, whiteSpace: 'nowrap' as const }}>
    {label}
  </span>
)

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

// ── Turno card (usado en Calendario y Lista) ────────────────────────────────

interface TurnoCardProps {
  appt: Appointment
  categories: AppointmentCategory[]
  variant: 'day' | 'list'
  today: string
  lang: 'es' | 'en'
  confirmingId: string | null
  setConfirmingId: (id: string | null) => void
  cancellingId: string | null
  cancelAppt: (id: string) => void
  editingNoteId: string | null
  setEditingNoteId: (id: string | null) => void
  noteText: string
  setNoteText: (t: string) => void
  saveNote: (id: string) => void
  t: (k: any) => string
  s: any
}

function TurnoCard({ appt, categories, variant, today, lang, confirmingId, setConfirmingId, cancellingId, cancelAppt, editingNoteId, setEditingNoteId, noteText, setNoteText, saveNote, t, s }: TurnoCardProps) {
  const isToday = appt.appointment_date === today
  const isPast = appt.appointment_date < today
  const cat = categories.find(c => c.name === (appt.category || appt.title))
  const statusInfo = appt.status === 'cancelled'
    ? { label: t('appointments_status_cancelled'), color: '#dc2626' }
    : appt.status === 'completed'
      ? { label: t('appointments_status_completed'), color: '#38bdf8' }
      : { label: t('appointments_status_scheduled'), color: '#22a7f0' }
  const dtLabel = variant === 'list'
    ? formatFullDateTime(appt.appointment_date, appt.appointment_time, lang)
    : formatTime(appt.appointment_time)

  return (
    <div style={{ ...s.tcard, borderLeft: isToday && appt.status !== 'cancelled' ? '3px solid var(--accent)' : '3px solid transparent' }}>
      <div style={s.tcardTop}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={s.tcardDateTime}>
            <i className="ti ti-clock" style={{ fontSize: 14, color: 'var(--text-3)' }} />
            {dtLabel}
            {appt.duration_minutes ? <span style={{ color: 'var(--text-3)', fontWeight: 400, fontSize: 11 }}>· {appt.duration_minutes}min</span> : null}
          </div>
          {appt.title && (
            <div style={{ ...s.tcardCategory, color: cat ? muteHex(cat.color) : 'var(--accent)' }}>{appt.title}</div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', flexShrink: 0 }}>
          {pill(statusInfo.label, statusInfo.color)}
          <div style={{ display: 'flex', gap: 4 }}>
            {appt.reminder_24h_sent && pill('✓ 24h', '#226B43')}
            {appt.reminder_1h_sent && pill('✓ 1h', '#226B43')}
          </div>
        </div>
      </div>

      <div style={s.tcardMeta}>
        {appt.client_name && <span><i className="ti ti-user" style={{ fontSize: 12, marginRight: 4 }} />{appt.client_name || t('appointments_no_name')}</span>}
        {appt.client_phone && <span><i className="ti ti-phone" style={{ fontSize: 12, marginRight: 4 }} />{appt.client_phone}</span>}
        <span style={s.tcardId}>ID #{appt.id.slice(0, 8)}</span>
      </div>

      {appt.status !== 'cancelled' && !isPast && (
        confirmingId === appt.id ? (
          <div style={{ display: 'flex', gap: 4, marginTop: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#f87171' }}>¿Confirmar cancelación?</span>
            <button onClick={() => cancelAppt(appt.id)} disabled={cancellingId === appt.id}
              style={{ padding: '3px 8px', borderRadius: 5, border: 'none', background: '#dc2626', color: '#fff', fontSize: 11, cursor: 'pointer' }}>
              {cancellingId === appt.id ? '...' : 'Sí'}
            </button>
            <button onClick={() => setConfirmingId(null)}
              style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid var(--text-faint)', background: 'transparent', color: 'var(--text-2)', fontSize: 11, cursor: 'pointer' }}>
              No
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmingId(appt.id)}
            style={{ marginTop: 8, padding: '4px 10px', borderRadius: 6, border: '1px solid #dc262644', background: 'transparent', color: '#f87171', fontSize: 11, cursor: 'pointer' }}>
            Cancelar turno
          </button>
        )
      )}

      {appt.status !== 'cancelled' && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          {editingNoteId === appt.id ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                autoFocus
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveNote(appt.id); if (e.key === 'Escape') setEditingNoteId(null) }}
                placeholder="Nota interna..."
                style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border-mid)', borderRadius: 6, padding: '4px 8px', color: 'var(--text-1)', fontSize: 12, outline: 'none' }}
              />
              <button onClick={() => saveNote(appt.id)} style={{ padding: '3px 8px', borderRadius: 5, border: 'none', background: 'var(--accent-dark)', color: '#fff', fontSize: 11, cursor: 'pointer' }}>Guardar</button>
              <button onClick={() => setEditingNoteId(null)} style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid var(--text-faint)', background: 'transparent', color: 'var(--text-2)', fontSize: 11, cursor: 'pointer' }}>✕</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              onClick={() => { setEditingNoteId(appt.id); setNoteText(appt.notes || '') }}>
              <i className="ti ti-notes" style={{ fontSize: 12, color: 'var(--text-3)' }} />
              <span style={{ fontSize: 11, color: appt.notes ? 'var(--text-2)' : 'var(--text-faint)', fontStyle: appt.notes ? 'normal' : 'italic' }}>
                {appt.notes || 'Agregar nota...'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Mini calendario ──────────────────────────────────────────────────────────

interface MiniCalendarProps {
  month: Date
  setMonth: (updater: (d: Date) => Date) => void
  selectedDate: string
  setSelectedDate: (d: string) => void
  apptDates: Set<string>
  today: string
  lang: 'es' | 'en'
  t: (k: any) => string
  s: any
}

function MiniCalendar({ month, setMonth, selectedDate, setSelectedDate, apptDates, today, lang, t, s }: MiniCalendarProps) {
  const locale = lang === 'en' ? 'en-US' : 'es-AR'
  const monthLabel = month.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  const weekdayLabels = lang === 'en' ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] : ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO']
  const cells = getMonthGrid(month)

  return (
    <div style={s.calBox}>
      <div style={s.calHeader}>
        <button onClick={() => setMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} style={s.calNavBtn}>
          <i className="ti ti-chevron-left" style={{ fontSize: 14 }} />
        </button>
        <span style={s.calMonthLabel}>{monthLabel}</span>
        <button onClick={() => setMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} style={s.calNavBtn}>
          <i className="ti ti-chevron-right" style={{ fontSize: 14 }} />
        </button>
      </div>
      <div style={s.calWeekRow}>
        {weekdayLabels.map(w => <div key={w} style={s.calWeekday}>{w}</div>)}
      </div>
      <div style={s.calGrid}>
        {cells.map((d, i) => {
          if (!d) return <div key={'b' + i} />
          const key = toKey(d)
          const isSelected = key === selectedDate
          const isToday = key === today
          const hasAppts = apptDates.has(key)
          return (
            <button
              key={key}
              onClick={() => setSelectedDate(key)}
              style={{
                ...s.calDayCell,
                background: isSelected ? 'var(--accent)' : 'transparent',
                color: isSelected ? '#fff' : isToday ? 'var(--accent)' : 'var(--text-1)',
                fontWeight: isSelected || isToday ? 700 : 500,
                border: isToday && !isSelected ? '1px solid var(--accent)' : '1px solid transparent',
              }}>
              {d.getDate()}
              {hasAppts && <span style={{ ...s.calDot, background: isSelected ? '#fff' : 'var(--accent)' }} />}
            </button>
          )
        })}
      </div>
      <div style={s.calLegend}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={s.calLegendDotHas} />{t('appointments_legend_has')}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={s.calLegendDotSelected} />{t('appointments_legend_selected')}
        </span>
      </div>
    </div>
  )
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function Appointments({ businessId, label }: { businessId: string; label?: string }) {
  const isMobile = useIsMobile()
  const t = useT()
  const { lang } = useLang()
  const [appts, setAppts] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categories, setCategories] = useState<AppointmentCategory[]>([])
  const [activeCat, setActiveCat] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [view, setView] = useState<View>('calendar')
  const today = new Date().toISOString().split('T')[0]
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState<string>(today)

  async function saveNote(apptId: string) {
    await supabase.from('appointments').update({ notes: noteText || null }).eq('id', apptId)
    setAppts(prev => prev.map(a => a.id === apptId ? { ...a, notes: noteText || null } : a))
    setEditingNoteId(null)
  }

  function buildCSV(rowsIn: Appointment[]) {
    const rows = [['Cliente', 'Teléfono', 'Servicio', 'Categoría', 'Fecha', 'Hora', 'Estado', 'Notas']]
    rowsIn.forEach(a => rows.push([
      a.client_name || '', a.client_phone || '', a.title || '',
      a.category || '', a.appointment_date, String(a.appointment_time).slice(0, 5),
      a.status || 'scheduled', a.notes || ''
    ]))
    const esc = (v: any) => '"' + String(v ?? '').replace(/"/g, '""') + '"'
    const BOM = String.fromCharCode(0xfeff)
    // BOM => Excel detecta UTF-8 y no rompe los acentos.
    // Separador ';' => Excel en español separa en columnas correctamente.
    return BOM + rows.map(r => r.map(esc).join(';')).join('\r\n')
  }

  async function exportCSV() {
    const csv = buildCSV(listFiltered)
    const fname = 'turnos_' + new Date().toISOString().slice(0, 10) + '.csv'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const nav: any = navigator
    // En celular: usar el menú nativo de compartir (WhatsApp, mail, Drive…) si está disponible.
    try {
      const file = new File([blob], fname, { type: 'text/csv' })
      if (isMobile && nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: t('appointments_title'), text: 'Lista de turnos' })
        return
      }
    } catch { /* si el usuario cancela o falla, caemos a descarga */ }
    const el = document.createElement('a')
    el.href = URL.createObjectURL(blob)
    el.download = fname
    el.click()
    URL.revokeObjectURL(el.href)
  }

  async function cancelAppt(apptId: string) {
    setCancellingId(apptId)
    setConfirmingId(null)
    try {
      const { data: { session: _s } } = await supabase.auth.getSession()
      const res = await fetch(`${BACKEND_URL}/api/webhooks/appointments/${apptId}/cancel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${_s?.access_token ?? ''}` }
      })
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
  }, [businessId])

  async function loadCategories() {
    const { data } = await supabase.from('businesses').select('appointment_categories').eq('id', businessId).single()
    setCategories(data?.appointment_categories ?? [])
  }

  async function loadAppts() {
    setLoading(true)
    const { data } = await supabase.from('appointments').select('*').eq('business_id', businessId)
      .order('appointment_date', { ascending: true }).order('appointment_time', { ascending: true }).limit(1000)
    setAppts(data ?? [])
    setLoading(false)
  }

  const matchCat = (a: Appointment) => !activeCat || a.category === activeCat ||
    (!a.category && a.title?.toLowerCase() === activeCat.toLowerCase())
  const matchSearch = (a: Appointment) => !search ||
    a.client_name?.toLowerCase().includes(search.toLowerCase()) ||
    a.client_phone?.includes(search) ||
    a.title?.toLowerCase().includes(search.toLowerCase())

  // Un turno "pendiente / por delante": fecha de hoy en adelante y no cancelado ni completado.
  const isUpcoming = (a: Appointment) => a.appointment_date >= today && a.status !== 'cancelled' && a.status !== 'completed'

  const catFiltered = appts.filter(matchCat)
  const listFiltered = catFiltered.filter(matchSearch)

  // Calendario: turnos del mes visible (para los puntos) y del día seleccionado
  const monthKey = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}`
  const apptDatesInMonth = new Set(catFiltered.filter(a => a.appointment_date.startsWith(monthKey)).map(a => a.appointment_date))
  const dayAppts = catFiltered.filter(a => a.appointment_date === selectedDate)
    .sort((a, b) => a.appointment_time.localeCompare(b.appointment_time))

  // Lista: agrupado por estado
  const activeList = listFiltered.filter(isUpcoming)
    .sort((a, b) => (a.appointment_date + a.appointment_time).localeCompare(b.appointment_date + b.appointment_time))
  const completedList = listFiltered.filter(a => a.status === 'completed')
    .sort((a, b) => (b.appointment_date + b.appointment_time).localeCompare(a.appointment_date + a.appointment_time))
  const cancelledList = listFiltered.filter(a => a.status === 'cancelled')
    .sort((a, b) => (b.appointment_date + b.appointment_time).localeCompare(a.appointment_date + a.appointment_time))

  const todayCount = appts.filter(a => a.appointment_date === today).length

  const s = {
    wrap: { padding: '24px 28px', maxWidth: 900, margin: '0 auto' } as React.CSSProperties,
    filters: { display: 'flex', gap: 6 },
    filterBtn: (active: boolean) => ({
      padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
      background: active ? 'var(--accent)' : 'var(--surface-2)',
      color: active ? '#fff' : 'var(--text-2)',
    } as React.CSSProperties),
    searchWrap: { position: 'relative' as const, marginBottom: 16 },
    search: { width: '100%', boxSizing: 'border-box' as const, padding: '9px 12px 9px 36px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)', fontSize: 13, outline: 'none' },
    searchIcon: { position: 'absolute' as const, left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', fontSize: 15, pointerEvents: 'none' as const },
    empty: { textAlign: 'center' as const, padding: '48px 0', color: 'var(--text-3)', fontSize: 14 },
    stat: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 18px', display: 'flex', flexDirection: 'column' as const, gap: 2 } as React.CSSProperties,
    statVal: { fontSize: 27, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.02em', lineHeight: 1.1 },
    statLabel: { fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginTop: 3 },

    // Panel "Gestión de Turnos"
    panel: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: isMobile ? 16 : '22px 24px' } as React.CSSProperties,
    panelHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' as const, marginBottom: 18 },
    panelTitleRow: { display: 'flex', alignItems: 'center', gap: 8 },
    panelTitle: { fontSize: 17, fontWeight: 700, color: 'var(--text-1)', margin: 0 },
    panelSubtitle: { fontSize: 12.5, color: 'var(--text-3)', marginTop: 4 },
    headerActions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const },
    iconBtn: { display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-mid)', background: 'transparent', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
    viewToggle: { display: 'flex', gap: 2, background: 'var(--surface-2)', borderRadius: 9, padding: 3 } as React.CSSProperties,
    viewToggleBtn: (active: boolean) => ({
      display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, fontSize: 12.5, fontWeight: 600,
      border: 'none', cursor: 'pointer', fontFamily: 'inherit',
      background: active ? 'var(--accent)' : 'transparent',
      color: active ? '#fff' : 'var(--text-2)',
    } as React.CSSProperties),

    // Calendario
    calLayout: { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '280px 1fr', gap: 20, alignItems: 'start' } as React.CSSProperties,
    calBox: { background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 } as React.CSSProperties,
    calHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    calMonthLabel: { fontSize: 14, fontWeight: 700, color: 'var(--text-1)' },
    calNavBtn: { width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border-mid)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
    calWeekRow: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 },
    calWeekday: { textAlign: 'center' as const, fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase' as const, padding: '4px 0' },
    calGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 },
    calDayCell: { width: '100%', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, fontSize: 12.5, cursor: 'pointer', position: 'relative' as const, background: 'transparent' } as React.CSSProperties,
    calDot: { width: 4, height: 4, borderRadius: '50%', position: 'absolute' as const, bottom: 4, left: '50%', transform: 'translateX(-50%)' } as React.CSSProperties,
    calLegend: { display: 'flex', gap: 14, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-3)', flexWrap: 'wrap' as const },
    calLegendDotHas: { width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', opacity: 0.55, display: 'inline-block' } as React.CSSProperties,
    calLegendDotSelected: { width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' } as React.CSSProperties,
    dayPanelHeader: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginBottom: 14 },
    dayEmpty: { textAlign: 'center' as const, padding: '40px 20px', color: 'var(--text-3)' } as React.CSSProperties,
    dayEmptyIcon: { fontSize: 32, color: 'var(--text-faint)', marginBottom: 10, display: 'block' } as React.CSSProperties,

    // Lista
    listCount: { fontSize: 13, fontWeight: 600, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 },
    sectionLabel: (first: boolean) => ({ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-3)', margin: first ? '0 0 8px' : '18px 0 8px', textTransform: 'uppercase' as const }),

    // Card de turno
    tcard: { background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 8 } as React.CSSProperties,
    tcardTop: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
    tcardDateTime: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' },
    tcardCategory: { fontSize: 12, fontWeight: 500, marginTop: 3, marginLeft: 20 },
    tcardMeta: { display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'var(--text-2)', marginTop: 10, flexWrap: 'wrap' as const },
    tcardId: { fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'monospace', marginLeft: 'auto' as const },
  }

  return (
    <div style={s.wrap}>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        <div style={s.stat}><span style={s.statVal}>{todayCount}</span><span style={s.statLabel}>{t('appointments_stat_today')}</span></div>
        <div style={s.stat}><span style={s.statVal}>{appts.filter(a => a.appointment_date >= today && a.status !== 'cancelled').length}</span><span style={s.statLabel}>{t('appointments_stat_upcoming')}</span></div>
        <div style={s.stat}><span style={s.statVal}>{appts.filter(a => a.reminder_24h_sent).length}</span><span style={s.statLabel}>{t('appointments_stat_reminders')}</span></div>
      </div>

      {/* Category filters */}
      {categories.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' as const }}>
          <button style={{ ...s.filterBtn(activeCat === null), fontSize: 11 }} onClick={() => setActiveCat(null)}>
            {t('appointments_all_categories')}
          </button>
          {categories.map(cat => {
            const mc = muteHex(cat.color)
            const active = activeCat === cat.name
            return (
            <button
              key={cat.id}
              onClick={() => setActiveCat(active ? null : cat.name)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 11px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${active ? mc : 'var(--border-mid)'}`,
                background: active ? mc : 'var(--surface-2)',
                color: active ? readableOn(mc) : 'var(--text-2)',
              }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? readableOn(mc) : mc, flexShrink: 0 }} />
              {cat.name}
              <span style={{ marginLeft: 2, opacity: 0.65, fontSize: 10 }}>
                {appts.filter(a => isUpcoming(a) && (a.category === cat.name || (!a.category && a.title?.toLowerCase() === cat.name.toLowerCase()))).length}
              </span>
            </button>
            )
          })}
        </div>
      )}

      {/* Panel principal */}
      <div style={s.panel}>
        <div style={s.panelHeader}>
          <div>
            <div style={s.panelTitleRow}>
              <i className="ti ti-calendar-event" style={{ fontSize: 17, color: 'var(--accent)' }} />
              <h2 style={s.panelTitle}>{label || t('appointments_management_title')}</h2>
            </div>
            <div style={s.panelSubtitle}>
              {view === 'calendar' ? t('appointments_calendar_subtitle') : t('appointments_list_subtitle')}
            </div>
          </div>
          <div style={s.headerActions}>
            <button onClick={exportCSV} style={s.iconBtn}>
              <i className={isMobile ? 'ti ti-share' : 'ti ti-download'} style={{ fontSize: 13 }} /> {isMobile ? 'Compartir' : 'CSV'}
            </button>
            <div style={s.viewToggle}>
              <button style={s.viewToggleBtn(view === 'calendar')} onClick={() => setView('calendar')}>
                <i className="ti ti-calendar" style={{ fontSize: 13 }} /> {t('appointments_view_calendar')}
              </button>
              <button style={s.viewToggleBtn(view === 'list')} onClick={() => setView('list')}>
                <i className="ti ti-list" style={{ fontSize: 13 }} /> {t('appointments_view_list')}
              </button>
            </div>
          </div>
        </div>

        {view === 'list' && (
          <div style={s.searchWrap}>
            <i className="ti ti-search" style={s.searchIcon} />
            <input style={s.search} placeholder={t('appointments_search')} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        )}

        {loading ? (
          <div style={s.empty}>{t('loading')}</div>
        ) : view === 'calendar' ? (
          <div style={s.calLayout}>
            <MiniCalendar
              month={calendarMonth}
              setMonth={updater => setCalendarMonth(updater)}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              apptDates={apptDatesInMonth}
              today={today}
              lang={lang}
              t={t}
              s={s}
            />
            <div>
              <div style={s.dayPanelHeader}>
                <i className="ti ti-calendar" style={{ fontSize: 15, color: 'var(--accent)' }} />
                {formatDayHeader(selectedDate, lang)}
              </div>
              {dayAppts.length === 0 ? (
                <div style={s.dayEmpty}>
                  <i className="ti ti-calendar-off" style={s.dayEmptyIcon} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>{t('appointments_no_day')}</div>
                  <div style={{ fontSize: 12 }}>{t('appointments_no_day_sub')}</div>
                </div>
              ) : (
                <div style={{ maxHeight: isMobile ? 'none' : 460, overflowY: isMobile ? 'visible' : 'auto', paddingRight: isMobile ? 0 : 6, marginRight: isMobile ? 0 : -6 }}>
                  {dayAppts.map(appt => (
                    <TurnoCard
                      key={appt.id}
                      appt={appt}
                      categories={categories}
                      variant="day"
                      today={today}
                      lang={lang}
                      confirmingId={confirmingId}
                      setConfirmingId={setConfirmingId}
                      cancellingId={cancellingId}
                      cancelAppt={cancelAppt}
                      editingNoteId={editingNoteId}
                      setEditingNoteId={setEditingNoteId}
                      noteText={noteText}
                      setNoteText={setNoteText}
                      saveNote={saveNote}
                      t={t}
                      s={s}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : listFiltered.length === 0 ? (
          <div style={s.empty}>{t('appointments_empty')}</div>
        ) : (
          <div>
            <div style={s.listCount}>
              <i className="ti ti-list-details" style={{ fontSize: 14 }} />
              {listFiltered.length} {listFiltered.length === 1 ? t('appointments_total_singular') : t('appointments_total_plural')}
            </div>

            <div style={{ maxHeight: isMobile ? 'none' : 560, overflowY: isMobile ? 'visible' : 'auto', paddingRight: isMobile ? 0 : 6, marginRight: isMobile ? 0 : -6 }}>
            {activeList.length > 0 && (
              <>
                <div style={s.sectionLabel(true)}>{t('appointments_section_active')} ({activeList.length})</div>
                {activeList.map(appt => (
                  <TurnoCard
                    key={appt.id} appt={appt} categories={categories} variant="list" today={today} lang={lang}
                    confirmingId={confirmingId} setConfirmingId={setConfirmingId} cancellingId={cancellingId} cancelAppt={cancelAppt}
                    editingNoteId={editingNoteId} setEditingNoteId={setEditingNoteId} noteText={noteText} setNoteText={setNoteText}
                    saveNote={saveNote} t={t} s={s}
                  />
                ))}
              </>
            )}

            {completedList.length > 0 && (
              <>
                <div style={s.sectionLabel(activeList.length === 0)}>{t('appointments_section_completed')} ({completedList.length})</div>
                {completedList.map(appt => (
                  <TurnoCard
                    key={appt.id} appt={appt} categories={categories} variant="list" today={today} lang={lang}
                    confirmingId={confirmingId} setConfirmingId={setConfirmingId} cancellingId={cancellingId} cancelAppt={cancelAppt}
                    editingNoteId={editingNoteId} setEditingNoteId={setEditingNoteId} noteText={noteText} setNoteText={setNoteText}
                    saveNote={saveNote} t={t} s={s}
                  />
                ))}
              </>
            )}

            {cancelledList.length > 0 && (
              <>
                <div style={s.sectionLabel(activeList.length === 0 && completedList.length === 0)}>{t('appointments_section_cancelled')} ({cancelledList.length})</div>
                {cancelledList.map(appt => (
                  <TurnoCard
                    key={appt.id} appt={appt} categories={categories} variant="list" today={today} lang={lang}
                    confirmingId={confirmingId} setConfirmingId={setConfirmingId} cancellingId={cancellingId} cancelAppt={cancelAppt}
                    editingNoteId={editingNoteId} setEditingNoteId={setEditingNoteId} noteText={noteText} setNoteText={setNoteText}
                    saveNote={saveNote} t={t} s={s}
                  />
                ))}
              </>
            )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
