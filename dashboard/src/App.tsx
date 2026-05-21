import './App.css'
import { useEffect, useState, useRef } from 'react'
import { createClient, RealtimeChannel } from '@supabase/supabase-js'
import Analytics from './Analytics'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// ── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  conversation_id: string
  sender: 'user' | 'assistant'
  content: string
  tokens_used?: number
  created_at: string
}

interface Contact {
  id: string
  phone: string
  name?: string
  interaction_count: number
}

interface Conversation {
  id: string
  contact_id: string
  status: 'active' | 'resolved' | 'pending'
  ai_enabled: boolean
  created_at: string
  updated_at: string
  contact?: Contact
  last_message?: Message
  unread?: boolean
}

interface Metrics {
  totalMessages: number
  todayMessages: number
  automationRate: number
  avgResponseTime: number
  uniqueContacts: number
  activeConversations: number
  pendingConversations: number
  escalations: number
  totalTokens: number
  estimatedCost: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(phone: string, name?: string): string {
  if (name) return name.slice(0, 2).toUpperCase()
  const digits = phone.replace(/\D/g, '')
  return digits.slice(-2)
}

function timeAgo(dateStr: string): string {
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

// ── Main Component ────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'inbox' | 'analytics' | 'contacts' | 'activity'

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [metrics, setMetrics] = useState<Metrics>({
    totalMessages: 0, todayMessages: 0, automationRate: 0,
    avgResponseTime: 0, uniqueContacts: 0, activeConversations: 0,
    pendingConversations: 0, escalations: 0, totalTokens: 0, estimatedCost: 0
  })
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  // ── Load data ───────────────────────────────────────────────────────────────

  useEffect(() => {
    loadAll()
    const channel = supabase
      .channel('realtime-dashboard')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new as Message
          setMessages(prev =>
            prev[0]?.conversation_id === msg.conversation_id
              ? [...prev, msg]
              : prev
          )
          loadConversations()
          loadMetrics()
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' },
        () => { loadConversations() }
      )
      .subscribe()
    channelRef.current = channel
    return () => { channel.unsubscribe() }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (selectedConv) loadMessages(selectedConv.id)
  }, [selectedConv])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadConversations(), loadMetrics()])
    setLoading(false)
  }

  async function loadConversations() {
    const { data: convs } = await supabase
      .from('conversations')
      .select('*, contact:contacts(*)')
      .order('updated_at', { ascending: false })
      .limit(50)

    if (!convs) return

    const withLastMsg = await Promise.all(
      convs.map(async (c) => {
        const { data: msgs } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', c.id)
          .order('created_at', { ascending: false })
          .limit(1)
        return { ...c, last_message: msgs?.[0] ?? null }
      })
    )
    setConversations(withLastMsg)
  }

  async function loadMessages(convId: string) {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(100)
    setMessages(data || [])
  }

  async function loadMetrics() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [
      { count: totalMessages },
      { count: todayMessages },
      { count: uniqueContacts },
      { count: activeConversations },
      { count: pendingConversations },
      { data: tokenData },
      { data: allMessages }
    ] = await Promise.all([
      supabase.from('messages').select('*', { count: 'exact', head: true }),
      supabase.from('messages').select('*', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
      supabase.from('contacts').select('*', { count: 'exact', head: true }),
      supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('messages').select('tokens_used').eq('sender', 'assistant').not('tokens_used', 'is', null),
      supabase.from('messages').select('sender').limit(1000)
    ])

    const totalTokens = tokenData?.reduce((sum, m) => sum + (m.tokens_used || 0), 0) ?? 0
    const estimatedCost = totalTokens * 0.000003 // ~$3 per 1M tokens sonnet

    const assistantCount = allMessages?.filter(m => m.sender === 'assistant').length ?? 0
    const userCount = allMessages?.filter(m => m.sender === 'user').length ?? 0
    const automationRate = userCount > 0 ? Math.round((assistantCount / userCount) * 100) : 0

    setMetrics({
      totalMessages: totalMessages ?? 0,
      todayMessages: todayMessages ?? 0,
      automationRate,
      avgResponseTime: 1.1,
      uniqueContacts: uniqueContacts ?? 0,
      activeConversations: activeConversations ?? 0,
      pendingConversations: pendingConversations ?? 0,
      escalations: 0,
      totalTokens,
      estimatedCost
    })
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function sendManualReply() {
    if (!replyText.trim() || !selectedConv || sending) return
    setSending(true)
    await supabase.from('messages').insert([{
      conversation_id: selectedConv.id,
      sender: 'assistant',
      content: replyText.trim()
    }])
    setReplyText('')
    setSending(false)
  }

  async function toggleAI(conv: Conversation) {
    const newVal = !conv.ai_enabled
    await supabase.from('conversations').update({ ai_enabled: newVal }).eq('id', conv.id)
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, ai_enabled: newVal } : c))
    if (selectedConv?.id === conv.id) setSelectedConv(s => s ? { ...s, ai_enabled: newVal } : s)
  }

  async function closeConversation(conv: Conversation) {
    await supabase.from('conversations').update({ status: 'resolved' }).eq('id', conv.id)
    loadConversations()
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const navItems: { id: Tab; icon: string; label: string }[] = [
    { id: 'dashboard', icon: 'ti-layout-dashboard', label: 'Dashboard' },
    { id: 'inbox', icon: 'ti-message-2', label: 'Inbox' },
    { id: 'analytics', icon: 'ti-chart-bar', label: 'Analytics' },
    { id: 'contacts', icon: 'ti-users', label: 'Contactos' },
    { id: 'activity', icon: 'ti-activity', label: 'Actividad' },
  ]

  return (
    <div style={s.shell}>
      {/* Sidebar */}
      <nav style={s.sidebar}>
        <div style={{ ...s.logo }}>AR</div>
        {navItems.map(n => (
          <button
            key={n.id}
            onClick={() => setTab(n.id)}
            title={n.label}
            style={{ ...s.sIcon, ...(tab === n.id ? s.sIconActive : {}) }}
          >
            <i className={`ti ${n.icon}`} aria-hidden="true" />
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button style={s.sIcon} title="Configuración">
          <i className="ti ti-settings" aria-hidden="true" />
        </button>
      </nav>

      {/* Main */}
      <div style={s.main}>
        {/* Topbar */}
        <div style={s.topbar}>
          <span style={s.topbarTitle}>
            {navItems.find(n => n.id === tab)?.label ?? 'Dashboard'}
          </span>
          <span style={s.badge}>Producción</span>
          {loading && <span style={{ ...s.badge, color: '#f59e0b', borderColor: '#3a2a0e' }}>Cargando...</span>}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#4a4a6a' }}>
              {new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <div style={s.liveDot} />
          </div>
        </div>

        {/* Dashboard tab */}
        {tab === 'dashboard' && (
          <div style={s.scrollArea}>
            <div style={s.metricsGrid}>
              <MetricCard label="Mensajes hoy" value={metrics.todayMessages.toLocaleString()} sub={`${metrics.totalMessages.toLocaleString()} total`} />
              <MetricCard label="Automatización" value={`${metrics.automationRate}%`} sub="respuestas IA" color="#22c55e" />
              <MetricCard label="Tokens / costo" value={`${(metrics.totalTokens / 1000).toFixed(1)}k`} sub={`~$${metrics.estimatedCost.toFixed(2)} USD`} color="#f59e0b" />
              <MetricCard label="Tiempo resp." value={`${metrics.avgResponseTime}s`} sub="promedio" />
              <MetricCard label="Contactos únicos" value={metrics.uniqueContacts.toLocaleString()} sub="registrados" />
              <MetricCard label="Convs. activas" value={metrics.activeConversations.toString()} sub="en curso" color="#22c55e" />
              <MetricCard label="Pendientes" value={metrics.pendingConversations.toString()} sub="sin responder" color={metrics.pendingConversations > 0 ? '#f59e0b' : undefined} />
              <MetricCard label="Escalaciones" value={metrics.escalations.toString()} sub="a humano hoy" color={metrics.escalations > 0 ? '#f87171' : undefined} />
            </div>

            <div style={s.sectionTitle}>Conversaciones recientes</div>
            <ConvList
              conversations={conversations.slice(0, 10)}
              selected={selectedConv}
              onSelect={(c) => { setSelectedConv(c); setTab('inbox') }}
            />
          </div>
        )}

        {/* Inbox tab */}
        {tab === 'inbox' && (
          <div style={s.inboxLayout}>
            {/* Conv list */}
            <div style={s.convPane}>
              <div style={s.convSearch}>
                <i className="ti ti-search" style={{ fontSize: 13, color: '#4a4a6a' }} aria-hidden="true" />
                <span style={{ fontSize: 12, color: '#4a4a6a' }}>Buscar conversaciones...</span>
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <ConvList
                  conversations={conversations}
                  selected={selectedConv}
                  onSelect={setSelectedConv}
                />
              </div>
            </div>

            {/* Chat pane */}
            {selectedConv ? (
              <div style={s.chatPane}>
                <div style={s.chatHeader}>
                  <div style={{ ...s.avatar, background: '#1a1a2e', color: avatarColor(selectedConv.id) }}>
                    {getInitials(selectedConv.contact?.phone ?? '', selectedConv.contact?.name)}
                  </div>
                  <div>
                    <div style={s.chatName}>{selectedConv.contact?.name ?? selectedConv.contact?.phone ?? 'Desconocido'}</div>
                    <div style={s.chatSub}>{selectedConv.contact?.phone} · {selectedConv.status}</div>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => toggleAI(selectedConv)}
                      style={{ ...s.chip, ...(selectedConv.ai_enabled ? {} : { color: '#4a4a6a', borderColor: '#1e1e2e' }) }}
                    >
                      <i className="ti ti-robot" style={{ fontSize: 11 }} aria-hidden="true" />
                      {selectedConv.ai_enabled ? ' IA activa' : ' IA pausada'}
                    </button>
                    {selectedConv.status !== 'resolved' && (
                      <button onClick={() => closeConversation(selectedConv)} style={{ ...s.chip, color: '#22c55e', borderColor: '#1a2e1e' }}>
                        <i className="ti ti-check" style={{ fontSize: 11 }} aria-hidden="true" /> resolver
                      </button>
                    )}
                  </div>
                </div>

                <div style={s.messageArea}>
                  {messages.map(msg => (
                    <div key={msg.id} style={{ alignSelf: msg.sender === 'user' ? 'flex-start' : 'flex-end', maxWidth: '80%' }}>
                      {msg.sender === 'assistant' && (
                        <div style={s.aiBadge}>
                          <i className="ti ti-sparkles" style={{ fontSize: 11 }} aria-hidden="true" /> Claude
                        </div>
                      )}
                      <div style={{ ...s.bubble, ...(msg.sender === 'user' ? s.bubbleUser : s.bubbleBot) }}>
                        {msg.content}
                      </div>
                      <div style={s.msgMeta}>{timeAgo(msg.created_at)}</div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                <div style={s.inputArea}>
                  <div style={s.inputRow}>
                    <textarea
                      style={s.textarea}
                      placeholder="Responder manualmente..."
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendManualReply() } }}
                      rows={2}
                    />
                    <button onClick={sendManualReply} disabled={sending || !replyText.trim()} style={s.sendBtn}>
                      <i className="ti ti-send" style={{ fontSize: 14 }} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={s.emptyPane}>
                <i className="ti ti-message-2" style={{ fontSize: 32, color: '#2e2e4e' }} aria-hidden="true" />
                <p style={{ color: '#4a4a6a', fontSize: 13, marginTop: 12 }}>Seleccioná una conversación</p>
              </div>
            )}
          </div>
        )}

        {/* Placeholder tabs */}
        {tab === 'analytics' && <Analytics />}

        {(tab === 'contacts' || tab === 'activity') && (
          <div style={s.emptyPane}>
            <i className="ti ti-tools" style={{ fontSize: 32, color: '#2e2e4e' }} aria-hidden="true" />
            <p style={{ color: '#4a4a6a', fontSize: 13, marginTop: 12 }}>
              {tab === 'contacts' && 'CRM Contactos — Fase 3'}
              {tab === 'activity' && 'Actividad en vivo — Fase 3'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div style={s.metricCard}>
      <div style={s.metricLabel}>{label}</div>
      <div style={s.metricValue}>{value}</div>
      <div style={{ ...s.metricSub, ...(color ? { color } : {}) }}>{sub}</div>
    </div>
  )
}

function ConvList({ conversations, selected, onSelect }: {
  conversations: Conversation[]
  selected: Conversation | null
  onSelect: (c: Conversation) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0' }}>
      {conversations.map(c => {
        const isActive = selected?.id === c.id
        const color = avatarColor(c.id)
        const name = c.contact?.name ?? c.contact?.phone ?? 'Desconocido'
        const preview = c.last_message?.content ?? 'Sin mensajes'
        const statusColor = c.status === 'active' ? '#22c55e' : c.status === 'pending' ? '#f59e0b' : '#4a4a6a'
        return (
          <div
            key={c.id}
            onClick={() => onSelect(c)}
            style={{ ...s.convRow, ...(isActive ? s.convRowActive : {}) }}
          >
            <div style={{ ...s.avatar, color, background: '#1a1a2e', flexShrink: 0 }}>
              {getInitials(c.contact?.phone ?? '', c.contact?.name)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: '#c4c4d4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
              </div>
              <div style={{ fontSize: 11, color: '#4a4a6a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preview}</div>
            </div>
            <div style={{ fontSize: 10, color: '#4a4a6a', flexShrink: 0 }}>
              {c.last_message ? timeAgo(c.last_message.created_at) : ''}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  shell: { display: 'grid', gridTemplateColumns: '52px 1fr', height: '100vh', background: '#0a0a0f', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', fontSize: 14, overflow: 'hidden' },
  sidebar: { background: '#0d0d14', borderRight: '0.5px solid #1e1e2e', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0', gap: 6 },
  logo: { width: 32, height: 32, borderRadius: 8, background: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 500, color: '#fff', marginBottom: 8, flexShrink: 0 },
  sIcon: { width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#4a4a6a', fontSize: 16, background: 'transparent', border: 'none' },
  sIconActive: { background: '#1a1a2e', color: '#a78bfa' },
  main: { display: 'grid', gridTemplateRows: 'auto 1fr', overflow: 'hidden' },
  topbar: { padding: '10px 16px', borderBottom: '0.5px solid #1e1e2e', display: 'flex', alignItems: 'center', gap: 10, background: '#0d0d14' },
  topbarTitle: { fontSize: 13, fontWeight: 500, color: '#e2e8f0' },
  badge: { background: '#1a1a2e', border: '0.5px solid #2e2e4e', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: '#a78bfa' },
  liveDot: { width: 6, height: 6, borderRadius: '50%', background: '#22c55e' },
  scrollArea: { overflowY: 'auto', padding: 16 },
  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 },
  metricCard: { background: '#0d0d14', border: '0.5px solid #1e1e2e', borderRadius: 10, padding: '10px 12px' },
  metricLabel: { fontSize: 11, color: '#4a4a6a', marginBottom: 4 },
  metricValue: { fontSize: 22, fontWeight: 500, color: '#e2e8f0', lineHeight: 1 },
  metricSub: { fontSize: 11, color: '#4a4a6a', marginTop: 3 },
  sectionTitle: { fontSize: 11, color: '#4a4a6a', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  inboxLayout: { display: 'grid', gridTemplateColumns: '280px 1fr', overflow: 'hidden', height: '100%' },
  convPane: { borderRight: '0.5px solid #1e1e2e', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0d0d14' },
  convSearch: { padding: '10px 12px', borderBottom: '0.5px solid #1e1e2e', display: 'flex', alignItems: 'center', gap: 8 },
  convRow: { display: 'grid', gridTemplateColumns: '28px 1fr auto', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer', borderLeft: '2px solid transparent' },
  convRowActive: { background: '#111122', borderLeftColor: '#a78bfa' },
  avatar: { width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 500 },
  chatPane: { display: 'grid', gridTemplateRows: 'auto 1fr auto', overflow: 'hidden' },
  chatHeader: { padding: '10px 16px', borderBottom: '0.5px solid #1e1e2e', display: 'flex', alignItems: 'center', gap: 10, background: '#0d0d14' },
  chatName: { fontSize: 13, fontWeight: 500, color: '#e2e8f0' },
  chatSub: { fontSize: 11, color: '#4a4a6a' },
  chip: { background: '#1a1a2e', border: '0.5px solid #2e2e4e', borderRadius: 6, padding: '4px 8px', fontSize: 11, color: '#a78bfa', cursor: 'pointer' },
  messageArea: { overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 },
  bubble: { padding: '7px 10px', borderRadius: 10, fontSize: 13, lineHeight: 1.5 },
  bubbleUser: { background: '#1a1a2e', color: '#c4c4d4', borderBottomLeftRadius: 3 },
  bubbleBot: { background: '#14142a', border: '0.5px solid #2e2e4e', color: '#c4c4d4', borderBottomRightRadius: 3 },
  aiBadge: { fontSize: 10, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: 3, marginBottom: 2 },
  msgMeta: { fontSize: 10, color: '#4a4a6a', marginTop: 2 },
  inputArea: { padding: '10px 16px', borderTop: '0.5px solid #1e1e2e', background: '#0d0d14' },
  inputRow: { display: 'flex', gap: 8, alignItems: 'flex-end' },
  textarea: { flex: 1, background: '#111122', border: '0.5px solid #2e2e4e', borderRadius: 8, padding: '8px 10px', color: '#e2e8f0', fontSize: 13, fontFamily: 'system-ui, sans-serif', resize: 'none' },
  sendBtn: { background: '#a78bfa', border: 'none', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 14, cursor: 'pointer', flexShrink: 0 },
  emptyPane: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, height: '100%' },
}
