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
  conversation_count?: number
  last_message?: string
  last_activity?: string
  status?: 'active' | 'inactive'
}

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
  '#a78bfa', '#f59e0b', '#22c55e', '#f87171',
  '#38bdf8', '#fb923c', '#e879f9', '#34d399'
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

// ── Main component ────────────────────────────────────────────────────────────

export default function Contacts({ onOpenChat }: { onOpenChat?: (contactId: string) => void }) {
  const t = useT()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'last_activity' | 'interaction_count' | 'created_at'>('last_activity')

  function exportCSV() {
    const rows = [['Nombre', 'Teléfono', 'Interacciones', 'Último contacto']]
    filtered.forEach(c => rows.push([
      c.name || '', c.phone, String(c.interaction_count ?? 0),
      c.last_interaction ? new Date(c.last_interaction).toLocaleDateString('es-AR') : ''
    ]))
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `contactos_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  useEffect(() => {
    loadContacts()
  }, [])

  async function loadContacts() {
    setLoading(true)

    const { data: contactsData } = await supabase
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false })

    if (!contactsData) { setLoading(false); return }

    const enriched = await Promise.all(
      contactsData.map(async (c) => {
        // Get conversation count and last activity
        const { data: convs } = await supabase
          .from('conversations')
          .select('id, updated_at')
          .eq('contact_id', c.id)
          .order('updated_at', { ascending: false })

        const lastConvId = convs?.[0]?.id
        const lastActivity = convs?.[0]?.updated_at

        let lastMessage = ''
        if (lastConvId) {
          const { data: msgs } = await supabase
            .from('messages')
            .select('content')
            .eq('conversation_id', lastConvId)
            .order('created_at', { ascending: false })
            .limit(1)
          lastMessage = msgs?.[0]?.content ?? ''
        }

        const daysSinceActivity = lastActivity
          ? (Date.now() - new Date(lastActivity).getTime()) / 86400000
          : 999

        return {
          ...c,
          conversation_count: convs?.length ?? 0,
          last_message: lastMessage,
          last_activity: lastActivity,
          status: daysSinceActivity < 7 ? 'active' : 'inactive'
        } as Contact
      })
    )

    setContacts(enriched)
    setLoading(false)
  }

  const filtered = contacts
    .filter(c => {
      const q = search.toLowerCase()
      return (
        c.phone.includes(q) ||
        (c.name ?? '').toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      if (sortBy === 'interaction_count') return (b.interaction_count ?? 0) - (a.interaction_count ?? 0)
      if (sortBy === 'created_at') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      return new Date(b.last_activity ?? 0).getTime() - new Date(a.last_activity ?? 0).getTime()
    })

  const totalActive = contacts.filter(c => c.status === 'active').length

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <span style={s.headerTitle}>{t('contacts_title')}</span>
          <span style={s.headerCount}>{contacts.length} total · {totalActive} activos</span>
        </div>
        <div style={s.headerRight}>
          <div style={s.searchBox}>
            <i className="ti ti-search" style={{ fontSize: 13, color: '#4a4a6a' }} aria-hidden="true" />
            <input
              style={s.searchInput}
              placeholder={t('contacts_search')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border-mid)', background: 'transparent', color: '#8b8baa', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
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
      ) : filtered.length === 0 ? (
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
            {filtered.map(c => {
              const color = avatarColor(c.id)
              return (
                <div key={c.id} style={s.row}>
                  <div style={{ ...s.avatar, color, background: '#1a1a2e' }}>
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
        </>
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: { overflowY: 'auto', padding: 16, height: '100%' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' },
  headerTitle: { fontSize: 13, fontWeight: 500, color: '#e2e8f0', marginRight: 10 },
  headerCount: { fontSize: 12, color: '#4a4a6a' },
  headerRight: { display: 'flex', gap: 8, alignItems: 'center' },
  searchBox: { display: 'flex', alignItems: 'center', gap: 8, background: '#0d0d14', border: '0.5px solid #1e1e2e', borderRadius: 8, padding: '6px 10px' },
  searchInput: { background: 'transparent', border: 'none', color: '#e2e8f0', fontSize: 12, outline: 'none', width: 220 },
  sortGroup: { display: 'flex', gap: 4 },
  sortBtn: { background: 'transparent', border: '0.5px solid #1e1e2e', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: '#4a4a6a', cursor: 'pointer' },
  sortBtnActive: { background: '#1a1a2e', borderColor: '#2e2e4e', color: '#a78bfa' },
  loading: { color: '#4a4a6a', fontSize: 13, padding: 32, textAlign: 'center' },
  tableHeader: { display: 'grid', gridTemplateColumns: '28px 1fr 100px 1fr 80px 80px 80px', gap: 12, padding: '6px 12px', fontSize: 11, color: '#4a4a6a', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '0.5px solid #1e1e2e', marginBottom: 4 },
  tableBody: { display: 'flex', flexDirection: 'column', gap: 2 },
  row: { display: 'grid', gridTemplateColumns: '28px 1fr 100px 1fr 80px 80px 80px', gap: 12, padding: '8px 12px', alignItems: 'center', borderRadius: 8, cursor: 'default', background: '#0d0d14', border: '0.5px solid transparent' },
  avatar: { width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 500, flexShrink: 0 },
  contactInfo: { minWidth: 0 },
  contactName: { fontSize: 12, fontWeight: 500, color: '#c4c4d4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  contactPhone: { fontSize: 11, color: '#4a4a6a' },
  cell: { fontSize: 12, color: '#8b8baa' },
  cellPreview: { color: '#4a4a6a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  statusBadge: { fontSize: 11, borderRadius: 4, padding: '2px 7px', border: '0.5px solid' },
  statusActive: { color: '#22c55e', borderColor: '#1a2e1e', background: '#0a1a0e' },
  statusInactive: { color: '#4a4a6a', borderColor: '#1e1e2e', background: 'transparent' },
  chatBtn: { background: '#1a1a2e', border: '0.5px solid #2e2e4e', borderRadius: 6, padding: '3px 8px', fontSize: 11, color: '#a78bfa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 },
}
