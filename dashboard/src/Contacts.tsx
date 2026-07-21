import { useEffect, useState } from 'react'
import { useT } from './i18n'
import { supabase } from './supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Contact {
  id: string
  phone: string
  name?: string
  interaction_count: number
  created_at: string
  last_interaction?: string
  conversation_count?: number
  last_message?: string
  last_activity?: string
  status?: 'active' | 'inactive'
}

const PAGE_SIZE = 50

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr?: string): string {
  if (!dateStr) return '—'
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60) return 'ahora'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

const AVATAR_COLORS = [
  '#1585c7', '#f59e0b', '#22a7f0', '#f87171',
  '#38bdf8', '#fb923c', '#e879f9', '#4fc3f7'
]

function avatarColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getInitials(phone: string, name?: string): string {
  if (name) return name.slice(0, 2).toUpperCase()
  return phone.replace(/\D/g, '').slice(-2)
}

// Enriquece UNA página de contactos con datos de conversaciones/mensajes usando
// 2 consultas en bloque (no una por contacto). Antes esto hacía 2 queries por
// cada contacto (N+1); ahora son 2 fijas por página sin importar cuántos sean.
async function enrichPage(rows: Contact[]): Promise<Contact[]> {
  const ids = rows.map(r => r.id)
  if (!ids.length) return rows

  const { data: convs } = await supabase
    .from('conversations')
    .select('id, contact_id, updated_at')
    .in('contact_id', ids)
    .order('updated_at', { ascending: false })

  const byContact: Record<string, { count: number; lastConvId: string | null; lastActivity: string | null }> = {}
  for (const cv of convs || []) {
    const e = byContact[cv.contact_id] || (byContact[cv.contact_id] = { count: 0, lastConvId: null, lastActivity: null })
    e.count++
    if (!e.lastConvId) { e.lastConvId = cv.id; e.lastActivity = cv.updated_at }
  }

  const lastConvIds = Object.values(byContact).map(e => e.lastConvId).filter(Boolean) as string[]
  const lastMsgByConv: Record<string, string> = {}
  if (lastConvIds.length) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('conversation_id, content, created_at')
      .in('conversation_id', lastConvIds)
      .order('created_at', { ascending: false })
    for (const m of msgs || []) {
      if (!lastMsgByConv[m.conversation_id]) lastMsgByConv[m.conversation_id] = m.content
    }
  }

  return rows.map(r => {
    const e = byContact[r.id]
    const lastActivity = e?.lastActivity || r.last_interaction
    const days = lastActivity ? (Date.now() - new Date(lastActivity).getTime()) / 86400000 : 999
    return {
      ...r,
      conversation_count: e?.count ?? 0,
      last_message: e?.lastConvId ? (lastMsgByConv[e.lastConvId] || '') : '',
      last_activity: lastActivity || undefined,
      status: days < 7 ? 'active' : 'inactive',
    } as Contact
  })
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Contacts({ onOpenChat }: { onOpenChat?: (contactId: string) => void }) {
  const t = useT()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortBy, setSortBy] = useState<'last_activity' | 'interaction_count' | 'created_at'>('last_activity')

  // Debounce de la búsqueda (evita una consulta por cada tecla)
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  // Recarga desde cero al cambiar orden o búsqueda
  useEffect(() => {
    loadPage(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, debouncedSearch])

  function orderColumn() {
    if (sortBy === 'interaction_count') return { col: 'interaction_count', asc: false }
    if (sortBy === 'created_at') return { col: 'created_at', asc: false }
    return { col: 'last_interaction', asc: false } // last_activity
  }

  async function loadPage(reset: boolean) {
    if (reset) setLoading(true); else setLoadingMore(true)
    const offset = reset ? 0 : contacts.length
    const { col, asc } = orderColumn()

    let query = supabase
      .from('contacts')
      .select('id, phone, name, interaction_count, created_at, last_interaction', { count: 'exact' })
      .order(col, { ascending: asc, nullsFirst: false })
      .range(offset, offset + PAGE_SIZE - 1)

    if (debouncedSearch) {
      const q = debouncedSearch.replace(/[%,]/g, '')
      query = query.or(`phone.ilike.%${q}%,name.ilike.%${q}%`)
    }

    const { data, count } = await query
    const enriched = await enrichPage((data as Contact[]) || [])

    setContacts(prev => reset ? enriched : [...prev, ...enriched])
    setTotal(count ?? 0)
    setHasMore((offset + enriched.length) < (count ?? 0))
    setLoading(false)
    setLoadingMore(false)
  }

  function exportCSV() {
    const rows = [['Nombre', 'Teléfono', 'Interacciones', 'Último contacto']]
    contacts.forEach(c => rows.push([
      c.name || '', c.phone, String(c.interaction_count ?? 0),
      c.last_activity ? new Date(c.last_activity).toLocaleDateString('es-AR') : ''
    ]))
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `contactos_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const totalActive = contacts.filter(c => c.status === 'active').length

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <span style={s.headerTitle}>{t('contacts_title')}</span>
          <span style={s.headerCount}>{total} total · {totalActive} activos (cargados)</span>
        </div>
        <div style={s.headerRight}>
          <div style={s.searchBox}>
            <i className="ti ti-search" style={{ fontSize: 13, color: 'var(--text-3)' }} aria-hidden="true" />
            <input
              style={s.searchInput}
              placeholder={t('contacts_search')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border-mid)', background: 'transparent', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            <i className="ti ti-download" style={{ fontSize: 13 }} /> CSV
          </button>
          <div style={s.sortGroup}>
            {([
              { key: 'last_activity', label: t('contacts_sort_activity') },
              { key: 'interaction_count', label: t('contacts_sort_messages') },
              { key: 'created_at', label: t('contacts_sort_new') },
            ] as const).map(o => (
              <button
                key={o.key}
                onClick={() => setSortBy(o.key)}
                style={{ ...s.sortBtn, ...(sortBy === o.key ? s.sortBtnActive : {}) }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={s.loading}>{t('contacts_loading')}</div>
      ) : contacts.length === 0 ? (
        <div style={s.loading}>{t('contacts_empty')}</div>
      ) : (
        <>
          {/* Table header */}
          <div style={s.tableHeader}>
            <span style={{ gridColumn: '1 / 3' }}>{t('contacts_col_contact')}</span>
            <span>{t('contacts_col_conversations')}</span>
            <span>{t('contacts_col_last_message')}</span>
            <span>Actividad</span>
            <span>{t('contacts_col_status')}</span>
            <span></span>
          </div>

          {/* Rows */}
          <div style={s.tableBody}>
            {contacts.map(c => {
              const color = avatarColor(c.id)
              return (
                <div key={c.id} style={s.row}>
                  <div style={{ ...s.avatar, color, background: 'var(--bg-card)' }}>
                    {getInitials(c.phone, c.name)}
                  </div>
                  <div style={s.contactInfo}>
                    <div style={s.contactName}>{c.name ?? c.phone}</div>
                    {c.name && <div style={s.contactPhone}>{c.phone}</div>}
                  </div>
                  <div style={s.cell}>{c.conversation_count}</div>
                  <div style={{ ...s.cell, ...s.cellPreview }}>
                    {c.last_message ? c.last_message.slice(0, 40) + (c.last_message.length > 40 ? '...' : '') : '—'}
                  </div>
                  <div style={s.cell}>{timeAgo(c.last_activity)}</div>
                  <div style={s.cell}>
                    <span style={{ ...s.statusBadge, ...(c.status === 'active' ? s.statusActive : s.statusInactive) }}>
                      {c.status === 'active' ? t('contacts_active') : t('contacts_inactive')}
                    </span>
                  </div>
                  <div style={s.cell}>
                    {onOpenChat && (
                      <button onClick={() => onOpenChat(c.id)} style={s.chatBtn}>
                        <i className="ti ti-message-2" style={{ fontSize: 13 }} aria-hidden="true" /> Ver chat
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0' }}>
              <button onClick={() => loadPage(false)} disabled={loadingMore} style={s.loadMore}>
                {loadingMore ? t('contacts_loading') : `${t('contacts_load_more')} (${total - contacts.length})`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: { overflowY: 'auto', padding: 16, height: '100%' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' },
  headerTitle: { fontSize: 13, fontWeight: 500, color: 'var(--text-1)', marginRight: 10 },
  headerCount: { fontSize: 12, color: 'var(--text-3)' },
  headerRight: { display: 'flex', gap: 8, alignItems: 'center' },
  searchBox: { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-card)', border: '0.5px solid var(--border-mid)', borderRadius: 8, padding: '6px 10px' },
  searchInput: { background: 'transparent', border: 'none', color: 'var(--text-1)', fontSize: 12, outline: 'none', width: 220 },
  sortGroup: { display: 'flex', gap: 4 },
  sortBtn: { background: 'transparent', border: '0.5px solid var(--border-mid)', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: 'var(--text-3)', cursor: 'pointer' },
  sortBtnActive: { background: 'var(--bg-card)', borderColor: 'var(--border-mid)', color: '#1585c7' },
  loading: { color: 'var(--text-3)', fontSize: 13, padding: 32, textAlign: 'center' },
  loadMore: { background: 'var(--bg-card)', border: '0.5px solid var(--border-mid)', borderRadius: 8, padding: '8px 18px', fontSize: 12, color: '#1585c7', cursor: 'pointer', fontFamily: 'inherit' },
  tableHeader: { display: 'grid', gridTemplateColumns: '28px 1fr 100px 1fr 80px 80px 80px', gap: 12, padding: '6px 12px', fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '0.5px solid var(--border-mid)', marginBottom: 4 },
  tableBody: { display: 'flex', flexDirection: 'column', gap: 2 },
  row: { display: 'grid', gridTemplateColumns: '28px 1fr 100px 1fr 80px 80px 80px', gap: 12, padding: '8px 12px', alignItems: 'center', borderRadius: 8, cursor: 'default', background: 'var(--bg-card)', border: '0.5px solid transparent' },
  avatar: { width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 500, flexShrink: 0 },
  contactInfo: { minWidth: 0 },
  contactName: { fontSize: 12, fontWeight: 500, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  contactPhone: { fontSize: 11, color: 'var(--text-3)' },
  cell: { fontSize: 12, color: 'var(--text-2)' },
  cellPreview: { color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  statusBadge: { fontSize: 11, borderRadius: 4, padding: '2px 7px', border: '0.5px solid' },
  statusActive: { color: '#22a7f0', borderColor: '#1a2e1e', background: '#0a1a0e' },
  statusInactive: { color: 'var(--text-3)', borderColor: 'var(--border-mid)', background: 'transparent' },
  chatBtn: { background: 'var(--bg-card)', border: '0.5px solid var(--border-mid)', borderRadius: 6, padding: '3px 8px', fontSize: 11, color: '#1585c7', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 },
}
