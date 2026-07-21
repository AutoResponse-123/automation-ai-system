import { useEffect, useState } from 'react'
import { useT } from './i18n'
import { supabase } from './supabase'

// ── Embudo de clientes (kanban estilo Kommo) ─────────────────────────────────
// Cada tarjeta es un contacto. Las columnas son las etapas (contacts.stage).
// El bot las mueve solo (nuevo→contactado→agendó→atendió→recurrente); acá el
// dueño puede arrastrar para corregir o mandar a "perdido".

interface Contact {
  id: string
  phone: string
  name?: string
  stage: string
  interaction_count: number
  summary?: string
  last_interaction?: string
}

interface StageDef { key: string; color: string }

const STAGES: StageDef[] = [
  { key: 'nuevo',      color: '#38bdf8' },
  { key: 'contactado', color: '#1585c7' },
  { key: 'agendó',     color: '#f59e0b' },
  { key: 'atendió',    color: '#22a7f0' },
  { key: 'recurrente', color: '#e879f9' },
  { key: 'perdido',    color: '#f87171' },
]

const AVATAR_COLORS = ['#1585c7', '#f59e0b', '#22a7f0', '#f87171', '#38bdf8', '#fb923c', '#e879f9', '#4fc3f7']
function avatarColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}
function getInitials(phone: string, name?: string): string {
  if (name) return name.slice(0, 2).toUpperCase()
  return phone.replace(/\D/g, '').slice(-2)
}

export default function Pipeline({ onOpenChat }: { onOpenChat?: (contactId: string) => void }) {
  const t = useT()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    // Tope de 500 tarjetas (las más recientes por movimiento de etapa) para no
    // cargar miles de contactos de una en el tablero.
    const { data } = await supabase
      .from('contacts')
      .select('id, phone, name, stage, interaction_count, summary, last_interaction')
      .order('stage_updated_at', { ascending: false })
      .limit(500)
    setContacts((data as Contact[]) || [])
    setLoading(false)
  }

  async function moveTo(contactId: string, stage: string) {
    const prev = contacts
    // Optimista: actualizamos la UI ya y revertimos si falla.
    setContacts(cs => cs.map(c => c.id === contactId ? { ...c, stage } : c))
    const { error } = await supabase
      .from('contacts')
      .update({ stage, stage_updated_at: new Date().toISOString() })
      .eq('id', contactId)
    if (error) setContacts(prev)
  }

  function onDrop(stageKey: string) {
    if (dragId) {
      const c = contacts.find(x => x.id === dragId)
      if (c && c.stage !== stageKey) moveTo(dragId, stageKey)
    }
    setDragId(null)
    setOverStage(null)
  }

  const stageLabel = (k: string) => t(`pipeline_stage_${k}` as any) || k

  if (loading) return <div style={s.loading}>{t('contacts_loading')}</div>

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span style={s.headerTitle}>{t('pipeline_title')}</span>
        <span style={s.headerCount}>{contacts.length} {t('pipeline_clients')}</span>
      </div>

      <div style={s.board}>
        {STAGES.map(st => {
          const cards = contacts.filter(c => (c.stage || 'nuevo') === st.key)
          const isOver = overStage === st.key
          return (
            <div
              key={st.key}
              style={{ ...s.column, ...(isOver ? s.columnOver : {}) }}
              onDragOver={e => { e.preventDefault(); setOverStage(st.key) }}
              onDragLeave={() => setOverStage(o => o === st.key ? null : o)}
              onDrop={() => onDrop(st.key)}
            >
              <div style={s.colHeader}>
                <span style={{ ...s.colDot, background: st.color }} />
                <span style={s.colTitle}>{stageLabel(st.key)}</span>
                <span style={s.colCount}>{cards.length}</span>
              </div>

              <div style={s.cards}>
                {cards.map(c => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => { setDragId(null); setOverStage(null) }}
                    style={{ ...s.card, ...(dragId === c.id ? s.cardDragging : {}) }}
                  >
                    <div style={s.cardTop}>
                      <div style={{ ...s.avatar, color: avatarColor(c.id) }}>{getInitials(c.phone, c.name)}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={s.cardName}>{c.name || c.phone}</div>
                        {c.name && <div style={s.cardPhone}>{c.phone}</div>}
                      </div>
                    </div>
                    {c.summary && <div style={s.cardSummary}>{c.summary.slice(0, 90)}{c.summary.length > 90 ? '…' : ''}</div>}
                    <div style={s.cardFoot}>
                      <span style={s.cardMeta}>{c.interaction_count ?? 0} msgs</span>
                      {onOpenChat && (
                        <button onClick={() => onOpenChat(c.id)} style={s.chatBtn}>
                          <i className="ti ti-message-2" style={{ fontSize: 12 }} /> {t('pipeline_open_chat')}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {cards.length === 0 && <div style={s.emptyCol}>—</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: { padding: 16, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 },
  headerTitle: { fontSize: 13, fontWeight: 500, color: 'var(--text-1)' },
  headerCount: { fontSize: 12, color: 'var(--text-3)' },
  loading: { color: 'var(--text-3)', fontSize: 13, padding: 32, textAlign: 'center' },
  board: { display: 'flex', gap: 12, overflowX: 'auto', flex: 1, paddingBottom: 8, alignItems: 'flex-start' },
  column: { flex: '0 0 240px', width: 240, background: 'var(--bg-card)', borderRadius: 10, border: '0.5px solid var(--border-mid)', padding: 8, maxHeight: '100%', display: 'flex', flexDirection: 'column' },
  columnOver: { borderColor: 'var(--accent)', background: 'var(--bg-hover, var(--bg-card))' },
  colHeader: { display: 'flex', alignItems: 'center', gap: 7, padding: '4px 6px 10px' },
  colDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  colTitle: { fontSize: 12, fontWeight: 600, color: 'var(--text-1)', textTransform: 'capitalize' },
  colCount: { marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)', background: 'var(--bg-2, transparent)', borderRadius: 10, padding: '1px 7px', border: '0.5px solid var(--border-mid)' },
  cards: { display: 'flex', flexDirection: 'column', gap: 7, overflowY: 'auto', flex: 1 },
  card: { background: 'var(--bg-2, var(--bg-card))', border: '0.5px solid var(--border-mid)', borderRadius: 8, padding: 9, cursor: 'grab' },
  cardDragging: { opacity: 0.4 },
  cardTop: { display: 'flex', gap: 8, alignItems: 'center' },
  avatar: { width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, background: 'var(--bg-card)', flexShrink: 0 },
  cardName: { fontSize: 12, fontWeight: 500, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  cardPhone: { fontSize: 10, color: 'var(--text-3)' },
  cardSummary: { fontSize: 11, color: 'var(--text-3)', marginTop: 7, lineHeight: 1.4 },
  cardFoot: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  cardMeta: { fontSize: 10, color: 'var(--text-3)' },
  chatBtn: { background: 'transparent', border: '0.5px solid var(--border-mid)', borderRadius: 6, padding: '3px 7px', fontSize: 10, color: '#1585c7', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 },
  emptyCol: { fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: 12, opacity: 0.5 },
}
