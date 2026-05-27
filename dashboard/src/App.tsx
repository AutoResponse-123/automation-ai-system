import './App.css'
import { useEffect, useState, useRef } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import Analytics from './Analytics'
import Contacts from './Contacts'
import Activity from './Activity'
import Settings from './Settings'
import Login from './Login'


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

interface Toast {
  id: string
  message: string
  type: 'info' | 'success' | 'warning'
}

function getInitials(phone: string, name?: string): string {
  if (name) return name.slice(0, 2).toUpperCase()
  return phone.replace(/\D/g, '').slice(-2)
}

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60) return 'ahora'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

function fullTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

const AVATAR_COLORS = ['#a78bfa','#f59e0b','#22c55e','#f87171','#38bdf8','#fb923c','#e879f9','#34d399']
function avatarColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

type Tab = 'dashboard' | 'inbox' | 'analytics' | 'contacts' | 'activity' | 'settings'

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [businessId, setBusinessId] = useState<string | null>(null)
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
  const [convFilter, setConvFilter] = useState<'all' | 'active' | 'resolved' | 'pending'>('all')
  const [convSearch, setConvSearch] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [hoveredTime, setHoveredTime] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) loadBusiness()
  }, [session])

  async function loadBusiness() {
    const { data } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', session!.user.id)
      .single()
    if (data) {
      setBusinessId(data.id)
    }
  }

  useEffect(() => {
    if (businessId) loadAll()
  }, [businessId])

  useEffect(() => {
    const selectedConvId = selectedConv?.id
    const channel = supabase
      .channel('realtime-dashboard')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new as Message
          if (selectedConvId && msg.conversation_id === selectedConvId) {
            loadMessages(selectedConvId)
          } else {
            setUnreadCount(p => p + 1)
            showToast(msg.sender === 'user' ? '💬 Nuevo mensaje recibido' : '🤖 Claude respondió', 'info')
          }
          loadConversations()
          loadMetrics()
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' },
        () => loadConversations()
      )
      .subscribe()
    channelRef.current = channel
    return () => { channel.unsubscribe() }
  }, [selectedConv])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (selectedConv) {
      loadMessages(selectedConv.id)
      setUnreadCount(0)
    }
  }, [selectedConv])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadConversations(), loadMetrics()])
    setLoading(false)
  }

  async function loadConversations() {
    if (!businessId) return
    const { data: convs } = await supabase
      .from('conversations')
      .select('*')
      .eq('business_id', businessId)
      .order('updated_at', { ascending: false })
      .limit(50)
    if (!convs) return

    const withDetails = await Promise.all(
      convs.map(async (c) => {
        const [{ data: contactData }, { data: msgs }] = await Promise.all([
          supabase.from('contacts').select('*').eq('id', c.contact_id).single(),
          supabase.from('messages').select('*').eq('conversation_id', c.id).order('created_at', { ascending: false }).limit(1)
        ])
        return { ...c, contact: contactData ?? undefined, last_message: msgs?.[0] ?? null }
      })
    )
    setConversations(withDetails)
  }

  async function loadMessages(convId: string) {
    const { data } = await supabase
      .from('messages').select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true }).limit(100)
    setMessages(data || [])
  }

  async function loadMetrics() {
    if (!businessId) return
    const today = new Date(); today.setHours(0,0,0,0)

    // Obtener conversation_ids del negocio
    const { data: bizConvs } = await supabase
      .from('conversations')
      .select('id')
      .eq('business_id', businessId)
    const convIds = bizConvs?.map(c => c.id) ?? []

    const [
      { count: totalMessages },
      { count: todayMessages },
      { count: uniqueContacts },
      { count: activeConversations },
      { count: pendingConversations },
      { data: tokenData },
      { data: allMessages }
    ] = await Promise.all([
      convIds.length ? supabase.from('messages').select('*', { count: 'exact', head: true }).in('conversation_id', convIds) : Promise.resolve({ count: 0 }),
      convIds.length ? supabase.from('messages').select('*', { count: 'exact', head: true }).in('conversation_id', convIds).gte('created_at', today.toISOString()) : Promise.resolve({ count: 0 }),
      supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('business_id', businessId),
      supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'active'),
      supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'pending'),
      convIds.length ? supabase.from('messages').select('tokens_used').eq('sender', 'assistant').in('conversation_id', convIds).not('tokens_used', 'is', null) : Promise.resolve({ data: [] }),
      convIds.length ? supabase.from('messages').select('sender').in('conversation_id', convIds).limit(1000) : Promise.resolve({ data: [] }),
    ])
    const totalTokens = tokenData?.reduce((s, m) => s + (m.tokens_used || 0), 0) ?? 0
    const assistantCount = allMessages?.filter(m => m.sender === 'assistant').length ?? 0
    const userCount = allMessages?.filter(m => m.sender === 'user').length ?? 0
    setMetrics({
      totalMessages: totalMessages ?? 0,
      todayMessages: todayMessages ?? 0,
      automationRate: userCount > 0 ? Math.round((assistantCount / userCount) * 100) : 0,
      avgResponseTime: 1.1,
      uniqueContacts: uniqueContacts ?? 0,
      activeConversations: activeConversations ?? 0,
      pendingConversations: pendingConversations ?? 0,
      escalations: 0,
      totalTokens,
      estimatedCost: totalTokens * 0.000003
    })
  }

  function showToast(message: string, type: Toast['type'] = 'info') {
    const id = crypto.randomUUID()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }

  async function sendManualReply() {
    const text = textareaRef.current?.value?.trim()
    if (!text || !selectedConv || sending) return
    setSending(true)
    await supabase.from('messages').insert([{
      conversation_id: selectedConv.id,
      sender: 'assistant',
      content: text
    }])
    if (textareaRef.current) textareaRef.current.value = ''
    setSending(false)
    textareaRef.current?.focus()
    loadMessages(selectedConv.id)
  }

  async function toggleAI(conv: Conversation) {
    const newVal = !conv.ai_enabled
    await supabase.from('conversations').update({ ai_enabled: newVal }).eq('id', conv.id)
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, ai_enabled: newVal } : c))
    if (selectedConv?.id === conv.id) setSelectedConv(s => s ? { ...s, ai_enabled: newVal } : s)
    showToast(newVal ? '🤖 IA reactivada' : '⏸ IA pausada', newVal ? 'success' : 'warning')
  }

  async function closeConversation(conv: Conversation) {
    await supabase.from('conversations').update({ status: 'resolved' }).eq('id', conv.id)
    loadConversations()
    showToast('✅ Conversación resuelta', 'success')
  }

  function copyPhone(phone: string) {
    navigator.clipboard.writeText(phone)
    showToast('📋 Teléfono copiado', 'info')
  }

  const navItems: { id: Tab; icon: string; label: string }[] = [
    { id: 'dashboard', icon: 'ti-layout-dashboard', label: 'Dashboard' },
    { id: 'inbox',     icon: 'ti-message-2',         label: 'Inbox' },
    { id: 'analytics', icon: 'ti-chart-bar',         label: 'Analytics' },
    { id: 'contacts',  icon: 'ti-users',             label: 'Contactos' },
    { id: 'activity',  icon: 'ti-activity',          label: 'Actividad' },
    { id: 'settings',  icon: 'ti-settings',          label: 'Configuración' },
  ]

  const filteredConvs = conversations
    .filter(c => convFilter === 'all' || c.status === convFilter)
    .filter(c => {
      if (!convSearch) return true
      const q = convSearch.toLowerCase()
      return c.contact?.phone?.includes(q) || (c.contact?.name ?? '').toLowerCase().includes(q)
    })

  if (authLoading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f', color: '#4a4a6a', fontSize: 13 }}>
      Cargando...
    </div>
  )

  if (!session) return <Login />

  return (
    <div style={s.shell}>
      {/* Sidebar */}
      <nav style={s.sidebar}>
        <div style={s.logo}>AR</div>
        {navItems.map(n => (
          <button key={n.id} onClick={() => setTab(n.id)} title={n.label}
            style={{ ...s.sIcon, ...(tab === n.id ? s.sIconActive : {}) }}>
            <i className={`ti ${n.icon}`} aria-hidden="true" />
            {n.id === 'inbox' && unreadCount > 0 && (
              <span style={s.badge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button key="settings" onClick={() => setTab('settings')} title="Configuración"
          style={{ ...s.sIcon, ...(tab === 'settings' ? s.sIconActive : {}) }}>
          <i className="ti ti-settings" aria-hidden="true" />
        </button>
        <div style={{ ...s.userAvatar, cursor: 'pointer' }} title="Cerrar sesión"
          onClick={() => supabase.auth.signOut()}>
          {session?.user?.email?.slice(0,1).toUpperCase() ?? 'U'}
        </div>
      </nav>

      {/* Main */}
      <div style={s.main}>
        {/* Topbar */}
        <div style={s.topbar}>
          <span style={s.topbarTitle}>{navItems.find(n => n.id === tab)?.label}</span>
          <span style={s.prodBadge}>Producción</span>
          {loading && <span style={{ ...s.prodBadge, color: '#f59e0b', borderColor: '#3a2a0e' }}>Cargando...</span>}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#4a4a6a' }}>
              {new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <div style={s.liveDot} />
          </div>
        </div>

        {/* Dashboard */}
        {tab === 'dashboard' && (
          <div style={s.scrollArea}>
            <div style={s.metricsGrid}>
              <MetricCard label="Mensajes hoy"     value={metrics.todayMessages.toLocaleString()} sub={`${metrics.totalMessages.toLocaleString()} total`} />
              <MetricCard label="Automatización"   value={`${metrics.automationRate}%`}           sub="respuestas IA"  color="#22c55e" />
              <MetricCard label="Tokens / costo"   value={`${(metrics.totalTokens/1000).toFixed(1)}k`} sub={`~$${metrics.estimatedCost.toFixed(2)} USD`} color="#f59e0b" />
              <MetricCard label="Tiempo resp."     value={`${metrics.avgResponseTime}s`}          sub="promedio" />
              <MetricCard label="Contactos únicos" value={metrics.uniqueContacts.toLocaleString()} sub="registrados" />
              <MetricCard label="Convs. activas"   value={metrics.activeConversations.toString()} sub="en curso"       color="#22c55e" />
              <MetricCard label="Pendientes"       value={metrics.pendingConversations.toString()} sub="sin responder" color={metrics.pendingConversations > 0 ? '#f59e0b' : undefined} />
              <MetricCard label="Escalaciones"     value={metrics.escalations.toString()}          sub="a humano hoy"  color={metrics.escalations > 0 ? '#f87171' : undefined} />
            </div>
            <div style={s.sectionTitle}>Conversaciones recientes</div>
            <ConvList conversations={conversations.slice(0,10)} selected={selectedConv}
              onSelect={(c) => { setSelectedConv(c); setTab('inbox') }} onCopyPhone={copyPhone} />
          </div>
        )}

        {/* Inbox */}
        {tab === 'inbox' && (
          <div style={s.inboxLayout}>
            <div style={s.convPane}>
              {/* Search */}
              <div style={s.convSearchBox}>
                <i className="ti ti-search" style={{ fontSize: 13, color: '#4a4a6a' }} aria-hidden="true" />
                <input style={s.convSearchInput} placeholder="Buscar..."
                  value={convSearch} onChange={e => setConvSearch(e.target.value)} />
              </div>
              {/* Filter tabs */}
              <div style={s.filterRow}>
                {(['all','active','pending','resolved'] as const).map(f => (
                  <button key={f} onClick={() => setConvFilter(f)}
                    style={{ ...s.filterBtn, ...(convFilter === f ? s.filterBtnActive : {}) }}>
                    {f === 'all' ? 'Todas' : f === 'active' ? 'Activas' : f === 'pending' ? 'Pendientes' : 'Resueltas'}
                  </button>
                ))}
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {filteredConvs.length === 0
                  ? <div style={s.emptyList}>Sin conversaciones</div>
                  : <ConvList conversations={filteredConvs} selected={selectedConv}
                      onSelect={setSelectedConv} onCopyPhone={copyPhone} />
                }
              </div>
            </div>

            {selectedConv ? (
              <div style={s.chatPane}>
                <div style={s.chatHeader}>
                  <div style={{ ...s.avatar, color: avatarColor(selectedConv.id), background: '#1a1a2e' }}>
                    {getInitials(selectedConv.contact?.phone ?? '', selectedConv.contact?.name)}
                  </div>
                  <div>
                    <div style={s.chatName}>{selectedConv.contact?.name ?? selectedConv.contact?.phone ?? 'Desconocido'}</div>
                    <div style={s.chatSub}>
                      <span style={{ cursor: 'pointer' }} onClick={() => copyPhone(selectedConv.contact?.phone ?? '')}>
                        {selectedConv.contact?.phone}
                      </span>
                      {' · '}{selectedConv.status}
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <div style={s.toggleWrapper} onClick={() => toggleAI(selectedConv)} title={selectedConv.ai_enabled ? 'Pausar IA' : 'Activar IA'}>
                      <i className="ti ti-robot" style={{ fontSize: 12, color: selectedConv.ai_enabled ? '#a78bfa' : '#4a4a6a' }} aria-hidden="true" />
                      <span style={{ ...s.toggleLabel, color: selectedConv.ai_enabled ? '#a78bfa' : '#4a4a6a' }}>IA</span>
                      <div style={{ ...s.toggleTrack, ...(selectedConv.ai_enabled ? s.toggleTrackOn : {}) }}>
                        <div style={{ ...s.toggleThumb, ...(selectedConv.ai_enabled ? s.toggleThumbOn : {}) }} />
                      </div>
                    </div>
                    {selectedConv.status !== 'resolved' && (
                      <button onClick={() => closeConversation(selectedConv)}
                        style={{ ...s.chip, color: '#22c55e', borderColor: '#1a2e1e' }}>
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
                      <div style={s.msgMeta}
                        onMouseEnter={() => setHoveredTime(msg.id)}
                        onMouseLeave={() => setHoveredTime(null)}>
                        {hoveredTime === msg.id ? fullTime(msg.created_at) : timeAgo(msg.created_at)}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                <div style={s.inputArea}>
                  <div style={s.inputRow}>
                    <textarea ref={textareaRef} style={s.textarea}
                      placeholder="Responder manualmente... (Enter para enviar)"
                      defaultValue=""
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendManualReply() } }}
                      rows={2} />
                    <button onClick={sendManualReply} disabled={sending} style={s.sendBtn}>
                      <i className="ti ti-send" style={{ fontSize: 14 }} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={s.emptyPane}>
                <i className="ti ti-message-2" style={{ fontSize: 36, color: '#2e2e4e' }} aria-hidden="true" />
                <p style={{ color: '#4a4a6a', fontSize: 13, marginTop: 12 }}>Seleccioná una conversación</p>
              </div>
            )}
          </div>
        )}

        {tab === 'analytics' && <Analytics />}

        {tab === 'contacts' && (
          <Contacts onOpenChat={(contactId) => {
            const conv = conversations.find(c => c.contact_id === contactId)
            if (conv) { setSelectedConv(conv); setTab('inbox') }
          }} />
        )}

        {tab === 'activity' && <Activity />}

        {tab === 'settings' && <Settings businessId={businessId} />}
      </div>

      {/* Toasts */}
      <div style={s.toastContainer}>
        {toasts.map(t => (
          <div key={t.id} style={{
            ...s.toast,
            ...(t.type === 'success' ? s.toastSuccess : t.type === 'warning' ? s.toastWarning : s.toastInfo)
          }}>
            {t.message}
          </div>
        ))}
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

function ConvList({ conversations, selected, onSelect, onCopyPhone }: {
  conversations: Conversation[]
  selected: Conversation | null
  onSelect: (c: Conversation) => void
  onCopyPhone?: (phone: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 0' }}>
      {conversations.map(c => {
        const isActive = selected?.id === c.id
        const color = avatarColor(c.id)
        const name = c.contact?.name ?? c.contact?.phone ?? 'Desconocido'
        const preview = c.last_message?.content ?? 'Sin mensajes'
        const statusColor = c.status === 'active' ? '#22c55e' : c.status === 'pending' ? '#f59e0b' : '#4a4a6a'
        return (
          <div key={c.id} onClick={() => onSelect(c)}
            style={{ ...s.convRow, ...(isActive ? s.convRowActive : {}) }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
              <span style={{ fontSize: 10, color: '#4a4a6a' }}>{c.last_message ? timeAgo(c.last_message.created_at) : ''}</span>
              {onCopyPhone && (
                <button onClick={e => { e.stopPropagation(); onCopyPhone(c.contact?.phone ?? '') }}
                  style={s.copyBtn} title="Copiar teléfono">
                  <i className="ti ti-copy" style={{ fontSize: 10 }} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  shell: { display: 'grid', gridTemplateColumns: '52px 1fr', height: '100vh', background: '#0a0a0f', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', fontSize: 14, overflow: 'hidden', position: 'relative' },
  sidebar: { background: '#0d0d14', borderRight: '0.5px solid #1e1e2e', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0', gap: 4 },
  logo: { width: 32, height: 32, borderRadius: 8, background: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#fff', marginBottom: 8, flexShrink: 0, letterSpacing: '0.05em' },
  sIcon: { width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#4a4a6a', fontSize: 16, background: 'transparent', border: 'none', position: 'relative', transition: 'color 0.15s, background 0.15s' },
  sIconActive: { background: '#1a1a2e', color: '#a78bfa' },
  badge: { position: 'absolute', top: 4, right: 4, background: '#f87171', borderRadius: 10, fontSize: 9, color: '#fff', padding: '1px 4px', fontWeight: 600, lineHeight: 1.4 },
  userAvatar: { width: 28, height: 28, borderRadius: '50%', background: '#1a1a2e', border: '0.5px solid #2e2e4e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#a78bfa', fontWeight: 500, marginTop: 4 },
  main: { display: 'grid', gridTemplateRows: 'auto 1fr', overflow: 'hidden' },
  topbar: { padding: '10px 16px', borderBottom: '0.5px solid #1e1e2e', display: 'flex', alignItems: 'center', gap: 10, background: '#0d0d14' },
  topbarTitle: { fontSize: 13, fontWeight: 500, color: '#e2e8f0' },
  prodBadge: { background: '#1a1a2e', border: '0.5px solid #2e2e4e', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: '#a78bfa' },
  liveDot: { width: 6, height: 6, borderRadius: '50%', background: '#22c55e' },
  scrollArea: { overflowY: 'auto', padding: 16 },
  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 },
  metricCard: { background: '#0d0d14', border: '0.5px solid #1e1e2e', borderRadius: 10, padding: '10px 12px', transition: 'border-color 0.15s' },
  metricLabel: { fontSize: 11, color: '#4a4a6a', marginBottom: 4 },
  metricValue: { fontSize: 22, fontWeight: 500, color: '#e2e8f0', lineHeight: 1 },
  metricSub: { fontSize: 11, color: '#4a4a6a', marginTop: 3 },
  sectionTitle: { fontSize: 11, color: '#4a4a6a', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  inboxLayout: { display: 'grid', gridTemplateColumns: '280px 1fr', overflow: 'hidden', height: '100%' },
  convPane: { borderRight: '0.5px solid #1e1e2e', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0d0d14' },
  convSearchBox: { padding: '10px 12px', borderBottom: '0.5px solid #1e1e2e', display: 'flex', alignItems: 'center', gap: 8 },
  convSearchInput: { background: 'transparent', border: 'none', color: '#e2e8f0', fontSize: 12, outline: 'none', flex: 1 },
  filterRow: { display: 'flex', borderBottom: '0.5px solid #1e1e2e', padding: '0 8px' },
  filterBtn: { flex: 1, background: 'transparent', border: 'none', borderBottom: '2px solid transparent', padding: '7px 4px', fontSize: 11, color: '#4a4a6a', cursor: 'pointer' },
  filterBtnActive: { color: '#a78bfa', borderBottomColor: '#a78bfa' },
  emptyList: { padding: 24, textAlign: 'center', fontSize: 12, color: '#4a4a6a' },
  convRow: { display: 'grid', gridTemplateColumns: '28px 1fr auto', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', borderLeft: '2px solid transparent', transition: 'background 0.1s' },
  convRowActive: { background: '#111122', borderLeftColor: '#a78bfa' },
  copyBtn: { background: 'transparent', border: 'none', color: '#4a4a6a', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' },
  avatar: { width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 500 },
  chatPane: { display: 'grid', gridTemplateRows: 'auto 1fr auto', overflow: 'hidden' },
  chatHeader: { padding: '10px 16px', borderBottom: '0.5px solid #1e1e2e', display: 'flex', alignItems: 'center', gap: 10, background: '#0d0d14' },
  chatName: { fontSize: 13, fontWeight: 500, color: '#e2e8f0' },
  chatSub: { fontSize: 11, color: '#4a4a6a', cursor: 'default' },
  chip: { background: '#1a1a2e', border: '0.5px solid #2e2e4e', borderRadius: 6, padding: '4px 8px', fontSize: 11, color: '#a78bfa', cursor: 'pointer', transition: 'opacity 0.15s' },
  messageArea: { overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 },
  bubble: { padding: '7px 10px', borderRadius: 10, fontSize: 13, lineHeight: 1.5 },
  bubbleUser: { background: '#1a1a2e', color: '#c4c4d4', borderBottomLeftRadius: 3 },
  bubbleBot: { background: '#14142a', border: '0.5px solid #2e2e4e', color: '#c4c4d4', borderBottomRightRadius: 3 },
  aiBadge: { fontSize: 10, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: 3, marginBottom: 2 },
  msgMeta: { fontSize: 10, color: '#4a4a6a', marginTop: 2, cursor: 'default', userSelect: 'none' },
  inputArea: { padding: '10px 16px', borderTop: '0.5px solid #1e1e2e', background: '#0d0d14' },
  inputRow: { display: 'flex', gap: 8, alignItems: 'flex-end' },
  textarea: { flex: 1, background: '#111122', border: '0.5px solid #2e2e4e', borderRadius: 8, padding: '8px 10px', color: '#e2e8f0', fontSize: 13, fontFamily: 'system-ui, sans-serif', resize: 'none', outline: 'none' },
  sendBtn: { background: '#a78bfa', border: 'none', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 14, cursor: 'pointer', flexShrink: 0 },
  emptyPane: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, height: '100%' },
  toggleWrapper: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 8px', borderRadius: 8, background: '#1a1a2e', border: '0.5px solid #2e2e4e', userSelect: 'none' as const },
  toggleLabel: { fontSize: 11, fontWeight: 500, transition: 'color 0.2s' },
  toggleTrack: { width: 32, height: 18, borderRadius: 9, background: '#2e2e4e', position: 'relative' as const, transition: 'background 0.25s', flexShrink: 0 },
  toggleTrackOn: { background: '#7c3aed' },
  toggleThumb: { position: 'absolute' as const, top: 2, left: 2, width: 14, height: 14, borderRadius: '50%', background: '#6a6a8a', transition: 'left 0.25s, background 0.25s' },
  toggleThumbOn: { left: 16, background: '#fff' },
  toastContainer: { position: 'fixed', bottom: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999 },
  toast: { padding: '10px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500, backdropFilter: 'blur(8px)', animation: 'fadeIn 0.2s ease', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' },
  toastInfo:    { background: '#1a1a2e', border: '0.5px solid #2e2e4e', color: '#c4c4d4' },
  toastSuccess: { background: '#0a1a0e', border: '0.5px solid #1a3e1e', color: '#22c55e' },
  toastWarning: { background: '#1a120a', border: '0.5px solid #3e2a0e', color: '#f59e0b' },
}
