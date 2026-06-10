export {};
import './App.css'
import { useEffect, useState, useRef } from 'react'
import { LangContext, t as tr } from './i18n'
import type { Lang } from './i18n'
import { RealtimeChannel } from '@supabase/supabase-js'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import Analytics from './Analytics'
import Contacts from './Contacts'
import Activity from './Activity'
import Settings from './Settings'
import Appointments from './Appointments'
import Onboarding from './Onboarding'
import Login from './Login'
import Search from './Search'
import { useNotifications } from './hooks/useNotifications'
import { useIsMobile } from './hooks/useIsMobile'

// ── Types ─────────────────────────────────────────────────────────────────────

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
  tags?: string[]
}

const TAG_PRESETS: { label: string; color: string }[] = [
  { label: 'Venta',        color: '#22c55e' },
  { label: 'Soporte',      color: '#38bdf8' },
  { label: 'Urgente',      color: '#f87171' },
  { label: 'Turno',        color: '#3b82f6' },
  { label: 'Consulta',     color: '#f59e0b' },
  { label: 'Seguimiento',  color: '#fb923c' },
  { label: 'Reclamo',      color: '#e879f9' },
  { label: 'Resuelto',     color: '#34d399' },
]

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

interface Note {
  id: string
  conversation_id: string
  content: string
  created_at: string
}

interface Toast {
  id: string
  message: string
  type: 'info' | 'success' | 'warning'
}

type Tab = 'dashboard' | 'inbox' | 'analytics' | 'contacts' | 'activity' | 'appointments' | 'settings'

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function darkenHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  const d = (v: number) => Math.max(0, Math.round(v * (1 - amount))).toString(16).padStart(2,'0')
  return '#' + d(r) + d(g) + d(b)
}
function lightenHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  const l = (v: number) => Math.min(255, Math.round(v + (255 - v) * amount)).toString(16).padStart(2,'0')
  return '#' + l(r) + l(g) + l(b)
}

const AVATAR_COLORS = ['#3b82f6','#f59e0b','#22c55e','#f87171','#38bdf8','#fb923c','#e879f9','#34d399']
function avatarColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

const DEFAULT_QUICK_REPLIES: string[] = []

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('ui_lang') as Lang) || 'es')
  const [dashFont, setDashFont] = useState<string>(() => localStorage.getItem('ar_font') ?? 'Inter')
  const [tab, setTab] = useState<Tab>('dashboard')
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [businessData, setBusinessData] = useState<any>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [metrics, setMetrics] = useState<Metrics>({
    totalMessages: 0, todayMessages: 0, automationRate: 0,
    avgResponseTime: 0, uniqueContacts: 0, activeConversations: 0,
    pendingConversations: 0, escalations: 0, totalTokens: 0, estimatedCost: 0
  })
  const [yesterdayMsgCount, setYesterdayMsgCount] = useState(0)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [convFilter, setConvFilter] = useState<'all' | 'active' | 'resolved' | 'pending'>('all')
  const [convSearch, setConvSearch] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [showTagFilterPopover, setShowTagFilterPopover] = useState(false)
  const [dashScale, setDashScale] = useState<'day' | 'week' | 'month' | '6months' | 'year'>('day')
  const [reservations, setReservations] = useState(0)
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [recentConvId, setRecentConvId] = useState<string | null>(null)
  const [todayAppts, setTodayAppts] = useState<any[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [noteMode, setNoteMode] = useState(false)
  const [hoveredTime, setHoveredTime] = useState<string | null>(null)
  const [showQuickReplies, setShowQuickReplies] = useState(false)
  const [contactPanelOpen, setContactPanelOpen] = useState(false)
  // Tags
  const [showTagPopover, setShowTagPopover] = useState(false)
  // Search
  const [searchOpen, setSearchOpen] = useState(false)
  // Summary
  const [summaryText, setSummaryText] = useState<string | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [quickReplies, setQuickReplies] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('ar_quick_replies')
      return stored ? JSON.parse(stored) : DEFAULT_QUICK_REPLIES
    } catch { return DEFAULT_QUICK_REPLIES }
  })
  const [newQuickReply, setNewQuickReply] = useState('')
  const isMobile = useIsMobile()
  const [mobileShowChat, setMobileShowChat] = useState(false)

  function saveQuickReplies(updated: string[]) {
    setQuickReplies(updated)
    try { localStorage.setItem('ar_quick_replies', JSON.stringify(updated)) } catch { /* ignore */ }
  }

  const { sendNotification } = useNotifications()

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const quickRepliesRef = useRef<HTMLDivElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [replyText])

  // Window title badge
  useEffect(() => {
    document.title = unreadCount > 0 ? `(${unreadCount}) Wasso` : 'Wasso'
  }, [unreadCount])

  // Close quick replies on outside click
  useEffect(() => {
    if (!showQuickReplies) return
    function handle(e: MouseEvent) {
      if (quickRepliesRef.current && !quickRepliesRef.current.contains(e.target as Node)) {
        setShowQuickReplies(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [showQuickReplies])

  // Cmd+K / Ctrl+K → abrir búsqueda global
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [])

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => { if (session) loadBusiness() }, [session])

  async function loadBusiness() {
    const { data } = await supabase.from('businesses').select('id, accent_color, name, business_description, phone_whatsapp, services, prices, schedule, escalation_email, plan, trial_ends_at').eq('user_id', session!.user.id).single()
    if (data) {
      setBusinessId(data.id)
      setBusinessData(data)
      const bg = localStorage.getItem('ar_bg_color') ?? undefined
      applyTheme(data.accent_color ?? undefined, bg)
      const savedFont = localStorage.getItem('ar_font')
      if (savedFont && savedFont !== 'Inter') {
        const link = document.createElement('link')
        link.id = 'ar-font-link'
        link.rel = 'stylesheet'
        link.href = `https://fonts.googleapis.com/css2?family=${savedFont.replace(/ /g, '+')}:wght@400;500;600;700&display=swap`
        document.head.appendChild(link)
      }
      // Cargar turnos de hoy
      const today = new Date().toISOString().split('T')[0]
      const { data: appts } = await supabase.from('appointments')
        .select('id, client_name, appointment_time, title, status')
        .eq('business_id', data.id)
        .eq('appointment_date', today)
        .eq('status', 'scheduled')
        .order('appointment_time')
        .limit(5)
      setTodayAppts(appts ?? [])
    }
  }

  function applyTheme(accent?: string, bg?: string) {
    const root = document.documentElement
    if (accent && /^#[0-9a-fA-F]{6}$/.test(accent)) {
      root.style.setProperty('--accent', accent)
      root.style.setProperty('--accent-dark', darkenHex(accent, 0.22))
      root.style.setProperty('--accent-glow', accent + '44')
      root.style.setProperty('--accent-dim',  accent + '1e')
    }
    if (bg && /^#[0-9a-fA-F]{6}$/.test(bg)) {
      root.style.setProperty('--bg-base',  bg)
      root.style.setProperty('--bg-panel', lightenHex(bg, 0.018))
      root.style.setProperty('--bg-card',  lightenHex(bg, 0.035))
      root.style.setProperty('--bg-input', lightenHex(bg, 0.028))
      root.style.setProperty('--border',   lightenHex(bg, 0.10))
      root.style.setProperty('--border-mid', lightenHex(bg, 0.15))
    }
  }

  useEffect(() => { if (businessId) loadAll() }, [businessId])

  // Realtime
  useEffect(() => {
    const selectedConvId = selectedConv?.id
    const channel = supabase
      .channel('realtime-dashboard')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as Message
        setRecentConvId(msg.conversation_id)
        setTimeout(() => setRecentConvId(prev => (prev === msg.conversation_id ? null : prev)), 2500)
        if (selectedConvId && msg.conversation_id === selectedConvId) {
          loadMessages(selectedConvId)
        } else {
          setUnreadCount(p => p + 1)
          showToast(msg.sender === 'user' ? '💬 Nuevo mensaje' : '🤖 Claude respondió', 'info')
        }
        if (msg.sender === 'user') {
          const conv = conversations.find(c => c.id === msg.conversation_id)
          const contactName = conv?.contact?.name || conv?.contact?.phone || 'Cliente'
          sendNotification(`💬 ${contactName}`, {
            body: msg.content?.slice(0, 100) || '',
            tag: `msg-${msg.conversation_id}`,
          })
        }
        loadConversations()
        loadMetrics()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, () => loadConversations())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_notes' }, (payload) => {
        const note = payload.new as Note
        if (selectedConvId && note.conversation_id === selectedConvId) {
          loadNotes(selectedConvId)
        }
      })
      .subscribe()
    channelRef.current = channel
    return () => { channel.unsubscribe() }
  }, [selectedConv])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, notes])

  useEffect(() => {
    if (selectedConv) {
      loadMessages(selectedConv.id)
      loadNotes(selectedConv.id)
      setUnreadCount(0)
      setContactPanelOpen(false)
      setNoteMode(false)
    }
  }, [selectedConv])

  // ── Data loaders ─────────────────────────────────────────────────────────────

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadConversations(), loadMetrics()])
    setLoading(false)
  }

  async function loadConversations() {
    if (!businessId) return
    const { data: convs } = await supabase
      .from('conversations').select('*')
      .eq('business_id', businessId)
      .order('updated_at', { ascending: false })
      .limit(50)
    if (!convs) return
    const withDetails = await Promise.all(convs.map(async (c) => {
      const [{ data: contactData }, { data: msgs }] = await Promise.all([
        supabase.from('contacts').select('*').eq('id', c.contact_id).single(),
        supabase.from('messages').select('*').eq('conversation_id', c.id).order('created_at', { ascending: false }).limit(1)
      ])
      return { ...c, contact: contactData ?? undefined, last_message: msgs?.[0] ?? null }
    }))
    setConversations(withDetails)
  }

  async function loadMessages(convId: string) {
    const { data } = await supabase.from('messages').select('*')
      .eq('conversation_id', convId).order('created_at', { ascending: true }).limit(100)
    setMessages(data || [])
  }

  async function loadNotes(convId: string) {
    const { data } = await supabase.from('conversation_notes').select('*')
      .eq('conversation_id', convId).order('created_at', { ascending: true })
    setNotes(data || [])
  }

  async function saveNote() {
    const text = replyText.trim()
    if (!text || !selectedConv) return
    setSending(true)
    await supabase.from('conversation_notes').insert([{
      conversation_id: selectedConv.id,
      content: text,
    }])
    setReplyText('')
    setSending(false)
    textareaRef.current?.focus()
    loadNotes(selectedConv.id)
    showToast('📝 Nota guardada', 'info')
  }

  async function loadMetrics(scale: 'day' | 'week' | 'month' | '6months' | 'year' = dashScale) {
    if (!businessId) return
    const now = new Date()
    const periodStart = new Date(now)
    if (scale === 'day')   { periodStart.setHours(0, 0, 0, 0) }
    if (scale === 'week')  { periodStart.setDate(now.getDate() - 7); periodStart.setHours(0,0,0,0) }
    if (scale === 'month') { periodStart.setDate(1); periodStart.setHours(0,0,0,0) }
    if (scale === '6months') { periodStart.setMonth(now.getMonth() - 6); periodStart.setHours(0,0,0,0) }
    if (scale === 'year')  { periodStart.setMonth(0, 1); periodStart.setHours(0,0,0,0) }
    const prevStart = new Date(periodStart)
    const diff = now.getTime() - periodStart.getTime()
    prevStart.setTime(periodStart.getTime() - diff)

    const { data: bizConvs } = await supabase.from('conversations').select('id').eq('business_id', businessId)
    const convIds = bizConvs?.map(c => c.id) ?? []

    const [
      { count: totalMessages },
      { count: periodMessages },
      { count: prevMessages },
      { count: uniqueContacts },
      { count: activeConversations },
      { count: pendingConversations },
      { data: tokenData },
      { data: allMessages },
      { count: reservationCount },
      { count: escalationCount },
    ] = await Promise.all([
      convIds.length ? supabase.from('messages').select('*', { count: 'exact', head: true }).in('conversation_id', convIds) : Promise.resolve({ count: 0 }),
      convIds.length ? supabase.from('messages').select('*', { count: 'exact', head: true }).in('conversation_id', convIds).gte('created_at', periodStart.toISOString()) : Promise.resolve({ count: 0 }),
      convIds.length ? supabase.from('messages').select('*', { count: 'exact', head: true }).in('conversation_id', convIds).gte('created_at', prevStart.toISOString()).lt('created_at', periodStart.toISOString()) : Promise.resolve({ count: 0 }),
      supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('business_id', businessId),
      supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'active'),
      supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'pending'),
      convIds.length ? supabase.from('messages').select('tokens_used').eq('sender', 'assistant').in('conversation_id', convIds).not('tokens_used', 'is', null) : Promise.resolve({ data: [] }),
      convIds.length ? supabase.from('messages').select('sender').in('conversation_id', convIds).limit(1000) : Promise.resolve({ data: [] }),
      supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('business_id', businessId).gte('created_at', periodStart.toISOString()),
      supabase.from('escalations').select('*', { count: 'exact', head: true }).eq('business_id', businessId).gte('created_at', periodStart.toISOString()),
    ])

    const totalTokens = tokenData?.reduce((s, m) => s + (m.tokens_used || 0), 0) ?? 0
    const assistantCount = allMessages?.filter(m => m.sender === 'assistant').length ?? 0
    const userCount = allMessages?.filter(m => m.sender === 'user').length ?? 0

    setYesterdayMsgCount(prevMessages ?? 0)
    setReservations(reservationCount ?? 0)
    setMetrics({
      totalMessages: totalMessages ?? 0,
      todayMessages: periodMessages ?? 0,
      automationRate: userCount > 0 ? Math.min(100, Math.round((assistantCount / userCount) * 100)) : 0,
      avgResponseTime: 1.1,
      uniqueContacts: uniqueContacts ?? 0,
      activeConversations: activeConversations ?? 0,
      pendingConversations: pendingConversations ?? 0,
      escalations: escalationCount ?? 0,
      totalTokens,
      estimatedCost: totalTokens * 0.000003
    })
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  function showToast(message: string, type: Toast['type'] = 'info') {
    const id = crypto.randomUUID()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }

  async function sendManualReply() {
    if (noteMode) { await saveNote(); return }
    const text = replyText.trim()
    if (!text || !selectedConv || sending) return
    setSending(true)
    try {
      const { data: { session: _sess } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/webhooks/send-manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_sess?.access_token ?? ''}` },
        body: JSON.stringify({ conversationId: selectedConv.id, text }),
      })
      if (!res.ok) {
        const err = await res.json()
        console.error('[send-manual]', err.error)
        await supabase.from('messages').insert([{ conversation_id: selectedConv.id, sender: 'assistant', content: text }])
      }
    } catch (e) {
      console.error('[send-manual]', e)
      await supabase.from('messages').insert([{ conversation_id: selectedConv.id, sender: 'assistant', content: text }])
    }
    setReplyText('')
    setSending(false)
    textareaRef.current?.focus()
    loadMessages(selectedConv.id)
  }

  async function addTag(tag: string) {
    if (!selectedConv) return
    const current = selectedConv.tags ?? []
    if (current.includes(tag)) return
    const updated = [...current, tag]
    await supabase.from('conversations').update({ tags: updated }).eq('id', selectedConv.id)
    setSelectedConv({ ...selectedConv, tags: updated })
    setShowTagPopover(false)
    loadConversations()
  }

  async function removeTag(tag: string) {
    if (!selectedConv) return
    const updated = (selectedConv.tags ?? []).filter(t => t !== tag)
    await supabase.from('conversations').update({ tags: updated }).eq('id', selectedConv.id)
    setSelectedConv({ ...selectedConv, tags: updated })
    loadConversations()
  }

  async function generateSummary() {
    if (!selectedConv || summaryLoading) return
    setSummaryLoading(true)
    setSummaryText(null)
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${backendUrl}/api/webhooks/conversations/${selectedConv.id}/summary`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      })
      const data = await res.json()
      setSummaryText(data.summary ?? 'No se pudo generar el resumen.')
    } catch {
      setSummaryText('Error al conectar con el servidor.')
    }
    setSummaryLoading(false)
  }

  async function reopenConversation(conv: Conversation) {
    await supabase.from('conversations').update({ status: 'active' }).eq('id', conv.id)
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, status: 'active' } : c))
    if (selectedConv?.id === conv.id) setSelectedConv({ ...conv, status: 'active' })
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

  // ── Derived ──────────────────────────────────────────────────────────────────

  const filterCounts = {
    all: conversations.length,
    active: conversations.filter(c => c.status === 'active').length,
    pending: conversations.filter(c => c.status === 'pending').length,
    resolved: conversations.filter(c => c.status === 'resolved').length,
  }

  const todayTrend: 'up' | 'down' | 'neutral' =
    metrics.todayMessages > yesterdayMsgCount ? 'up' :
    metrics.todayMessages < yesterdayMsgCount ? 'down' : 'neutral'

  const navItems: { id: Tab; icon: string; label: string }[] = [
    { id: 'dashboard',    icon: 'ti-layout-dashboard', label: tr('nav_dashboard', lang) },
    { id: 'inbox',        icon: 'ti-message-2',        label: tr('nav_inbox', lang) },
    { id: 'analytics',    icon: 'ti-chart-bar',        label: tr('nav_analytics', lang) },
    { id: 'contacts',     icon: 'ti-users',            label: tr('nav_contacts', lang) },
    { id: 'appointments', icon: 'ti-calendar',         label: tr('nav_appointments', lang) },
    { id: 'activity',     icon: 'ti-activity',         label: tr('nav_activity', lang) },
    { id: 'settings',     icon: 'ti-settings',         label: tr('nav_settings', lang) },
  ]

  const filteredConvs = conversations
    .filter(c => convFilter === 'all' || c.status === convFilter)
    .filter(c => !tagFilter || (c.tags ?? []).includes(tagFilter))
    .filter(c => {
      if (!convSearch) return true
      const q = convSearch.toLowerCase()
      return c.contact?.phone?.includes(q) || (c.contact?.name ?? '').toLowerCase().includes(q)
    })

  // ── Auth guards ───────────────────────────────────────────────────────────────

  if (authLoading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#07070d', flexDirection: 'column', gap: 12, fontFamily: 'inherit' }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', boxShadow: '0 4px 16px #1d4ed844' }}>W</div>
      <div style={{ fontSize: 12, color: '#5a5a7a' }}>Cargando...</div>
    </div>
  )

  if (!session) return <Login />

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <LangContext.Provider value={{ lang, setLang: (l) => { setLang(l); localStorage.setItem('ui_lang', l) } }}>
    <div style={{ ...s.shell, fontFamily: `'${dashFont}', system-ui, sans-serif`, ...(isMobile ? { display: 'flex', flexDirection: 'column', gridTemplateColumns: 'none' } : {}) }} className="app-shell">

      {/* Sidebar */}
      <nav style={{ ...s.sidebar, ...(isMobile ? { display: 'none' } : {}) }} className="desktop-sidebar">
        <div style={s.logo}>{businessData?.name?.[0]?.toUpperCase() ?? '?'}</div>
        {navItems.map(n => (
          <button key={n.id} onClick={() => setTab(n.id)} title={n.label}
            style={{ ...s.sIcon, ...(tab === n.id ? s.sIconActive : {}) }}>
            <i className={`ti ${n.icon}`} style={{ fontSize: 18 }} aria-hidden="true" />
            <span style={{ ...s.sLabel, ...(tab === n.id ? { color: '#3b82f6' } : {}) }}>{n.label}</span>
            {n.id === 'inbox' && unreadCount > 0 && (
              <span style={s.badge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
            {n.id === 'inbox' && unreadCount === 0 && filterCounts.pending > 0 && (
              <span style={{ ...s.badge, background: '#f59e0b' }}>{filterCounts.pending}</span>
            )}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ ...s.userAvatar, cursor: 'pointer' }}
          title={session?.user?.email}
          onClick={() => setShowLogoutModal(true)}>
          {session?.user?.email?.slice(0, 1).toUpperCase() ?? 'U'}
        </div>
      </nav>

      {/* Bottom Nav (mobile) */}
      <nav className="bottom-nav">
        {navItems.map(n => (
          <button key={n.id} onClick={() => { setTab(n.id); if (n.id !== 'inbox') setMobileShowChat(false) }}
            className={`bottom-nav-item${tab === n.id ? ' active' : ''}`}>
            <i className={`ti ${n.icon}`} />
            <span>{n.label}</span>
            {n.id === 'inbox' && unreadCount > 0 && (
              <span style={{ position: 'absolute', top: 6, width: 6, height: 6, borderRadius: '50%', background: '#3b82f6' }} />
            )}
          </button>
        ))}
      </nav>

      {/* Modal cerrar sesión */}
      {showLogoutModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowLogoutModal(false)}>
          <div style={{ background: '#0d0d14', border: '0.5px solid #2e2e4e', borderRadius: 14, padding: '28px 28px 22px', width: 320, display: 'flex', flexDirection: 'column', gap: 0 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--accent-dim)', border: '1px solid var(--border-mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--accent)', fontWeight: 700, marginBottom: 14 }}>
              {session?.user?.email?.slice(0, 1).toUpperCase() ?? 'U'}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>Tu cuenta</div>
            <div style={{ fontSize: 12, color: '#5a5a7a', marginBottom: 20, wordBreak: 'break-all' }}>{session?.user?.email}</div>
            <div style={{ height: '0.5px', background: '#1e1e2e', marginBottom: 20 }} />
            <div style={{ fontSize: 13, color: '#c4c4d4', marginBottom: 20 }}>¿Cerrar sesión en este dispositivo?</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowLogoutModal(false)}
                style={{ padding: '8px 18px', borderRadius: 8, border: '0.5px solid #2e2e4e', background: 'transparent', color: '#8b8baa', fontSize: 13, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={() => { setShowLogoutModal(false); supabase.auth.signOut() }}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#f87171', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main */}
      <div style={{ ...s.main, ...(isMobile ? { width: '100%' } : {}) }} className="app-main">

        {/* Topbar */}
        <div style={s.topbar}>
          {isMobile && tab === 'inbox' && mobileShowChat && (
            <button className="mobile-back-btn"
              onClick={() => setMobileShowChat(false)}
              style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, padding: '0 4px 0 0', fontFamily: 'inherit' }}>
              <i className="ti ti-chevron-left" style={{ fontSize: 18 }} />
            </button>
          )}
          <span style={s.topbarTitle}>{navItems.find(n => n.id === tab)?.label}</span>
          <span style={s.prodBadge}>
            <div style={s.liveDot} />
            Producción
          </span>
          {loading && <span style={{ ...s.prodBadge, color: '#f59e0b', borderColor: '#3a2a0e' }}>Actualizando...</span>}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {metrics.pendingConversations > 0 && (
              <button
                onClick={() => { setConvFilter('pending'); setTab('inbox') }}
                style={{ ...s.prodBadge, color: '#f59e0b', borderColor: '#3a2a0e', background: '#1a120a', cursor: 'pointer' }}>
                ⚠️ {metrics.pendingConversations} pendiente{metrics.pendingConversations !== 1 ? 's' : ''}
              </button>
            )}
            <button onClick={() => setSearchOpen(true)}
              style={{ ...s.prodBadge, cursor: 'pointer', gap: 6, color: '#5a5a7a' }}
              title="Buscar mensajes (Ctrl+K)">
              <i className="ti ti-search" style={{ fontSize: 12 }} />
              <span style={{ fontSize: 11 }}>Buscar</span>
              <kbd style={{ fontSize: 9, background: 'var(--bg-base)', border: '1px solid var(--border-mid)', borderRadius: 3, padding: '1px 4px', color: '#4a4a6a' }}>⌘K</kbd>
            </button>
            <span style={{ fontSize: 11, color: '#4a4a6a' }}>
              {new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>

        {/* Banner trial — solo en dashboard */}
        {tab === 'dashboard' && businessData?.plan === 'trial' && businessData?.trial_ends_at && (() => {
          const daysLeft = Math.floor((new Date(businessData.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          if (daysLeft <= 0) return null
          const urgent = daysLeft <= 2
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', fontSize: 12, fontWeight: 500, background: urgent ? 'rgba(251,146,60,0.08)' : 'rgba(167,139,250,0.07)', borderBottom: `1px solid ${urgent ? 'rgba(251,146,60,0.2)' : 'rgba(167,139,250,0.15)'}`, color: urgent ? '#fb923c' : '#a78bfa' }}>
              <i className={`ti ${urgent ? 'ti-alarm' : 'ti-clock'}`} style={{ fontSize: 13 }} />
              {daysLeft === 1 ? '⚠️ Tu prueba vence mañana.' : `Período de prueba: te quedan ${daysLeft} días.`}
              <span style={{ color: urgent ? '#f97316' : '#818cf8', marginLeft: 2 }}>Contactanos para continuar.</span>
            </div>
          )
        })()}

        {/* Dashboard */}
        {tab === 'dashboard' && (
          <div style={s.scrollArea}>
            <DashboardHero name={businessData?.name} automationRate={metrics.automationRate} pending={metrics.pendingConversations} totalMessages={metrics.totalMessages} onGoPending={() => { setConvFilter('pending'); setTab('inbox') }} />
            <Onboarding business={businessData} onGoToSettings={() => setTab('settings')} />
            {/* Selector de escala */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              {(['day', 'week', 'month', '6months', 'year'] as const).map(sc => (
                <button key={sc} onClick={() => { setDashScale(sc); loadMetrics(sc) }}
                  style={{ padding: '5px 14px', borderRadius: 8, border: '0.5px solid', fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
                    background: dashScale === sc ? 'var(--accent-dim)' : 'transparent',
                    borderColor: dashScale === sc ? 'var(--accent)' : '#2e2e4e',
                    color: dashScale === sc ? 'var(--accent)' : '#5a5a7a' }}>
                  {sc === 'day' ? 'Hoy' : sc === 'week' ? 'Semana' : sc === 'month' ? 'Mes' : sc === '6months' ? '6M' : 'Año'}
                </button>
              ))}
            </div>
            {loading ? (
              <div style={s.metricsGrid} className="metrics-grid">
                {Array(6).fill(0).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : (
              <div style={s.metricsGrid} className="metrics-grid">
                <MetricCard label={dashScale === 'day' ? 'Mensajes hoy' : dashScale === 'week' ? 'Mensajes esta semana' : dashScale === 'month' ? 'Mensajes este mes' : dashScale === '6months' ? 'Últimos 6 meses' : 'Mensajes este año'}
                  value={metrics.todayMessages.toLocaleString()}
                  sub={`${metrics.totalMessages.toLocaleString()} total`}
                  trend={todayTrend} trendDetail={`período anterior: ${yesterdayMsgCount}`}
                  icon="ti-message-2" iconColor="#3b82f6" />
                <MetricCard label="Tokens / costo" value={`${(metrics.totalTokens / 1000).toFixed(1)}k`}
                  sub={`~$${metrics.estimatedCost.toFixed(2)} USD`} color="#f59e0b"
                  icon="ti-coins" iconColor="#f59e0b" />
                <MetricCard label="Reservas realizadas" value={reservations.toString()}
                  sub={dashScale === 'day' ? 'hoy' : dashScale === 'week' ? 'esta semana' : dashScale === 'month' ? 'este mes' : dashScale === '6months' ? 'últimos 6 meses' : 'este año'}
                  color="#22c55e" icon="ti-calendar-check" iconColor="#22c55e" />
                <MetricCard label="Contactos únicos" value={metrics.uniqueContacts.toLocaleString()} sub="registrados"
                  icon="ti-users" iconColor="#e879f9" />
                <MetricCard label="Pendientes" value={metrics.pendingConversations.toString()}
                  sub="sin responder" color={metrics.pendingConversations > 0 ? '#f59e0b' : undefined}
                  icon="ti-clock-pause" iconColor={metrics.pendingConversations > 0 ? '#f59e0b' : '#4a4a6a'}
                  onClick={metrics.pendingConversations > 0 ? () => { setConvFilter('pending'); setTab('inbox') } : undefined} />
                <MetricCard label="Escalaciones" value={metrics.escalations.toString()}
                  sub="a humano" color={metrics.escalations > 0 ? '#f87171' : undefined}
                  icon="ti-alert-triangle" iconColor={metrics.escalations > 0 ? '#f87171' : '#4a4a6a'} />
              </div>
            )}
            {/* Turnos de hoy */}
            {todayAppts.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 4 }}>
                  <div style={s.sectionTitle}>Turnos de hoy</div>
                  <button onClick={() => setTab('appointments')} style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit' }}>Ver todos →</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
                  {todayAppts.map(a => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <i className="ti ti-calendar" style={{ fontSize: 16, color: 'var(--accent)' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0' }}>{a.client_name}</div>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>{a.title} · {String(a.appointment_time).slice(0, 5)}</div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>{String(a.appointment_time).slice(0, 5)}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={s.sectionTitle}>Conversaciones recientes</div>
            {loading
              ? <SkeletonList count={5} />
              : conversations.length === 0
                ? <EmptyState icon="ti-message-2" title="Sin conversaciones aún" sub="Las conversaciones de tus clientes aparecerán acá" />
                : <ConvList conversations={conversations.slice(0, 10)} selected={selectedConv} recentId={recentConvId}
                    onSelect={c => { setSelectedConv(c); setTab('inbox'); if (isMobile) setMobileShowChat(true) }} onCopyPhone={copyPhone} />
            }
          </div>
        )}

        {/* Inbox */}
        {tab === 'inbox' && (
          <div style={{ ...s.inboxLayout, ...(isMobile ? { display: 'block', gridTemplateColumns: 'none' } : {}) }} className="inbox-layout">

            {/* Conv list */}
            <div style={{ ...s.convPane, ...(isMobile && mobileShowChat ? { display: 'none' } : {}) }} className="inbox-list-pane">
              <div style={s.convSearchBox}>
                <i className="ti ti-search" style={{ fontSize: 13, color: '#4a4a6a' }} aria-hidden="true" />
                <input style={s.convSearchInput} placeholder="Buscar contacto..."
                  value={convSearch} onChange={e => setConvSearch(e.target.value)} />
                {convSearch && (
                  <button onClick={() => setConvSearch('')}
                    style={{ background: 'none', border: 'none', color: '#4a4a6a', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}>
                    ×
                  </button>
                )}
                {/* Filtro de etiquetas */}
                <div style={{ position: 'relative' as const, flexShrink: 0 }}>
                  <button onClick={() => setShowTagFilterPopover(p => !p)}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, background: tagFilter ? 'var(--accent-dim)' : 'transparent', border: `0.5px solid ${tagFilter ? 'var(--accent)' : '#2e2e4e'}`, borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: tagFilter ? 'var(--accent)' : '#4a4a6a', fontSize: 11, fontFamily: 'inherit', whiteSpace: 'nowrap' as const }}>
                    <i className="ti ti-tag" style={{ fontSize: 11 }} />
                    {tagFilter ?? 'Etiqueta'}
                    <i className={`ti ti-chevron-${showTagFilterPopover ? 'up' : 'down'}`} style={{ fontSize: 10 }} />
                  </button>
                  {showTagFilterPopover && (
                    <div className="popover-enter" style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--bg-card)', border: '1px solid var(--border-mid)', borderRadius: 10, padding: 6, zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.6)', minWidth: 160 }}>
                      <button onClick={() => { setTagFilter(null); setShowTagFilterPopover(false) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: !tagFilter ? '#1a1a2e' : 'transparent', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', color: !tagFilter ? '#3b82f6' : '#6a6a8a', fontSize: 12, fontFamily: 'inherit' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4a4a6a', flexShrink: 0 }} />
                        Todas
                        {!tagFilter && <i className="ti ti-check" style={{ fontSize: 11, marginLeft: 'auto' }} />}
                      </button>
                      {TAG_PRESETS.map(p => (
                        <button key={p.label} onClick={() => { setTagFilter(p.label); setShowTagFilterPopover(false) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: tagFilter === p.label ? p.color + '18' : 'transparent', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', color: tagFilter === p.label ? p.color : '#8080a0', fontSize: 12, fontFamily: 'inherit', transition: 'all 0.1s' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                          {p.label}
                          {tagFilter === p.label && <i className="ti ti-check" style={{ fontSize: 11, marginLeft: 'auto' }} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div style={s.filterRow}>
                {(['all', 'active', 'pending', 'resolved'] as const).map(f => (
                  <button key={f} onClick={() => setConvFilter(f)}
                    style={{ ...s.filterBtn, ...(convFilter === f ? s.filterBtnActive : {}) }}>
                    {f === 'all' ? 'Todas' : f === 'active' ? 'Activas' : f === 'pending' ? 'Pendientes' : 'Resueltas'}
                    <span style={{
                      marginLeft: 4, borderRadius: 10, padding: '0 5px', fontSize: 10,
                      background: convFilter === f ? '#3b82f622' : '#1e1e2e',
                      color: convFilter === f ? '#3b82f6' : '#4a4a6a',
                    }}>
                      {filterCounts[f]}
                    </span>
                  </button>
                ))}
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {loading
                  ? <SkeletonList count={6} />
                  : filteredConvs.length === 0
                    ? <EmptyState icon="ti-message-off" title="Sin conversaciones"
                        sub={convSearch ? 'Probá con otro término de búsqueda' : 'Las nuevas conversaciones aparecerán acá'} />
                    : <ConvList conversations={filteredConvs} selected={selectedConv} recentId={recentConvId}
                        onSelect={c => { setSelectedConv(c); if (isMobile) setMobileShowChat(true) }} onCopyPhone={copyPhone} />
                }
              </div>
            </div>

            {/* Chat */}
            {(!isMobile || mobileShowChat) && (selectedConv ? (
              <div style={s.chatPane} className="inbox-chat-pane">

                {/* Header */}
                <div style={s.chatHeader}>
                  <div style={{ ...s.avatar, color: '#fff', background: avatarColor(selectedConv.id) }}>
                    {getInitials(selectedConv.contact?.phone ?? '', selectedConv.contact?.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.chatName}>
                      {selectedConv.contact?.name ?? selectedConv.contact?.phone ?? 'Desconocido'}
                    </div>
                    <div style={s.chatSub}>
                      <span style={{ cursor: 'pointer' }} onClick={() => copyPhone(selectedConv.contact?.phone ?? '')}>
                        {selectedConv.contact?.phone}
                      </span>
                      {' · '}{selectedConv.status}
                      {selectedConv.contact?.interaction_count != null && (
                        <> · <span style={{ color: '#3b82f6' }}>{selectedConv.contact.interaction_count} interacciones</span></>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' as const }}>
                    {/* Tags actuales */}
                    {(selectedConv.tags ?? []).map(tag => {
                      const preset = TAG_PRESETS.find(p => p.label === tag)
                      const color = preset?.color ?? '#8080a0'
                      return (
                        <span key={tag} style={{ fontSize: 10, fontWeight: 600, borderRadius: 5, padding: '2px 7px', background: color + '20', border: `1px solid ${color}44`, color, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                          onClick={() => removeTag(tag)} title="Click para quitar">
                          {tag} <span style={{ fontSize: 12, lineHeight: 1 }}>×</span>
                        </span>
                      )
                    })}

                    {/* Agregar tag */}
                    <div style={{ position: 'relative' }}>
                      <button onClick={() => setShowTagPopover(p => !p)}
                        style={{ ...s.chip, color: '#5a5a7a' }} title="Agregar etiqueta">
                        <i className="ti ti-tag" style={{ fontSize: 11 }} /> etiqueta
                      </button>
                      {showTagPopover && (
                        <div style={s.tagPopover} className="popover-enter">
                          <div style={{ fontSize: 10, color: '#4a4a6a', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Agregar etiqueta</div>
                          {TAG_PRESETS.map(p => {
                            const active = (selectedConv.tags ?? []).includes(p.label)
                            return (
                              <button key={p.label} onClick={() => active ? removeTag(p.label) : addTag(p.label)}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: active ? p.color + '18' : 'transparent', border: 'none', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: active ? p.color : '#8080a0', fontSize: 12, fontFamily: 'inherit', transition: 'all 0.1s' }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                                {p.label}
                                {active && <i className="ti ti-check" style={{ fontSize: 11, marginLeft: 'auto' }} />}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Resumen IA */}
                    <button onClick={generateSummary} disabled={summaryLoading}
                      style={{ ...s.chip, color: summaryLoading ? '#4a4a6a' : '#3b82f6' }}
                      title="Generar resumen IA">
                      <i className={`ti ${summaryLoading ? 'ti-loader-2 ti-spin' : 'ti-sparkles'}`} style={{ fontSize: 11 }} />
                      {summaryLoading ? 'Resumiendo...' : 'resumen'}
                    </button>

                    <div style={s.toggleWrapper} onClick={() => toggleAI(selectedConv)}
                      title={selectedConv.ai_enabled ? 'Pausar IA' : 'Activar IA'}>
                      <i className="ti ti-robot" style={{ fontSize: 12, color: selectedConv.ai_enabled ? 'var(--accent)' : '#4a4a6a' }} aria-hidden="true" />
                      <span style={{ ...s.toggleLabel, color: selectedConv.ai_enabled ? 'var(--accent)' : '#4a4a6a' }}>IA</span>
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
                    {selectedConv.status === 'resolved' && (
                      <button onClick={() => reopenConversation(selectedConv)}
                        style={{ ...s.chip, color: '#f59e0b', borderColor: '#2e2210' }}>
                        <i className="ti ti-refresh" style={{ fontSize: 11 }} aria-hidden="true" /> reabrir
                      </button>
                    )}
                    <button onClick={() => setContactPanelOpen(p => !p)}
                      style={{ ...s.chip, color: contactPanelOpen ? 'var(--accent)' : '#4a4a6a' }}
                      title="Info del contacto">
                      <i className="ti ti-info-circle" style={{ fontSize: 11 }} aria-hidden="true" /> info
                    </button>
                  </div>
                </div>

                {/* Contact panel */}
                {contactPanelOpen && (
                  <div className="contact-panel" style={{ ...s.contactPanel, flexDirection: 'column', gap: 0, padding: 0 }}>
                    {/* Header del contacto */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '0.5px solid var(--border)' }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: avatarColor(selectedConv.id), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                        {getInitials(selectedConv.contact?.phone ?? '', selectedConv.contact?.name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 1 }}>
                          {selectedConv.contact?.name ?? 'Sin nombre'}
                        </div>
                        <div style={{ fontSize: 11, color: '#5a5a7a', cursor: 'pointer' }} onClick={() => copyPhone(selectedConv.contact?.phone ?? '')}>
                          {selectedConv.contact?.phone} <i className="ti ti-copy" style={{ fontSize: 10 }} />
                        </div>
                      </div>
                      {/* Estado e IA pills */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 5,
                          background: selectedConv.status === 'active' ? '#22c55e20' : selectedConv.status === 'pending' ? '#f59e0b20' : '#4a4a6a20',
                          color: selectedConv.status === 'active' ? '#22c55e' : selectedConv.status === 'pending' ? '#f59e0b' : '#6a6a8a' }}>
                          {selectedConv.status === 'active' ? 'activa' : selectedConv.status === 'pending' ? 'pendiente' : 'resuelta'}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 5,
                          background: selectedConv.ai_enabled ? 'var(--accent-dim)' : '#2e2e4e',
                          color: selectedConv.ai_enabled ? 'var(--accent)' : '#5a5a7a' }}>
                          IA {selectedConv.ai_enabled ? 'activa' : 'pausada'}
                        </span>
                      </div>
                    </div>

                    {/* Stats rápidas */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '0.5px solid var(--border)' }}>
                      {[
                        { label: 'Mensajes', value: messages.length },
                        { label: 'Interacciones', value: selectedConv.contact?.interaction_count ?? 0 },
                        { label: 'Etiquetas', value: (selectedConv.tags ?? []).length },
                      ].map(stat => (
                        <div key={stat.label} style={{ padding: '10px 14px', borderRight: '0.5px solid var(--border)', textAlign: 'center' as const }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', lineHeight: 1 }}>{stat.value}</div>
                          <div style={{ fontSize: 10, color: '#4a4a6a', marginTop: 3 }}>{stat.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Etiquetas activas */}
                    {(selectedConv.tags ?? []).length > 0 && (
                      <div style={{ padding: '10px 16px', borderBottom: '0.5px solid var(--border)', display: 'flex', flexWrap: 'wrap' as const, gap: 5 }}>
                        {(selectedConv.tags ?? []).map(tag => {
                          const preset = TAG_PRESETS.find(p => p.label === tag)
                          const color = preset?.color ?? '#8080a0'
                          return (
                            <span key={tag} style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 5, background: color + '20', border: `0.5px solid ${color}55`, color }}>
                              {tag}
                            </span>
                          )
                        })}
                      </div>
                    )}

                    {/* Fechas */}
                    <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ color: '#4a4a6a' }}>Primer contacto</span>
                        <span style={{ color: '#8b8baa' }}>{fullTime(selectedConv.created_at)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ color: '#4a4a6a' }}>Última actividad</span>
                        <span style={{ color: '#8b8baa' }}>{timeAgo(selectedConv.updated_at)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Panel de resumen IA */}
                {summaryText && (
                  <div style={s.summaryPanel} className="contact-panel">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                        <i className="ti ti-sparkles" style={{ fontSize: 12 }} /> Resumen IA
                      </div>
                      <button onClick={() => setSummaryText(null)}
                        style={{ background: 'none', border: 'none', color: '#4a4a6a', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                    </div>
                    <div style={{ fontSize: 12, color: '#c4c4d4', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{summaryText}</div>
                  </div>
                )}

                {/* Messages + Notes thread */}
                <div style={s.messageArea} className="message-area-scroll">
                  {messages.length === 0 && notes.length === 0 && (
                    <EmptyState icon="ti-message-2" title="Sin mensajes" sub="Esta conversación todavía no tiene mensajes" />
                  )}
                  {[
                    ...messages.map(m => ({ kind: 'message' as const, data: m, ts: m.created_at })),
                    ...notes.map(n => ({ kind: 'note' as const, data: n, ts: n.created_at })),
                  ]
                    .sort((a, b) => {
                      const ta = a.ts ? new Date(a.ts).getTime() : Infinity
                      const tb = b.ts ? new Date(b.ts).getTime() : Infinity
                      return ta - tb
                    })
                    .map(item => {
                      if (item.kind === 'note') {
                        const note = item.data as Note
                        return (
                          <div key={`note-${note.id}`} style={s.noteWrapper}>
                            <div style={s.noteBadge}>
                              <i className="ti ti-lock" style={{ fontSize: 10 }} aria-hidden="true" /> Nota interna
                            </div>
                            <div style={s.noteBubble}>{note.content}</div>
                            <div style={s.msgMeta}
                              onMouseEnter={() => setHoveredTime(`note-${note.id}`)}
                              onMouseLeave={() => setHoveredTime(null)}>
                              {hoveredTime === `note-${note.id}` ? fullTime(note.created_at) : timeAgo(note.created_at)}
                            </div>
                          </div>
                        )
                      }
                      const msg = item.data as Message
                      return (
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
                            {msg.tokens_used ? ` · ${msg.tokens_used}t` : ''}
                          </div>
                        </div>
                      )
                    })
                  }
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div style={{ ...s.inputArea, ...(noteMode ? s.inputAreaNote : {}) }}>
                  {noteMode && (
                    <div style={s.noteModeBar}>
                      <i className="ti ti-lock" style={{ fontSize: 11 }} aria-hidden="true" />
                      Nota interna — solo visible en el dashboard, el cliente no la verá
                    </div>
                  )}
                  <div style={s.inputRow}>
                    <textarea ref={textareaRef}
                      style={{ ...s.textarea, ...(noteMode ? s.textareaNote : {}) }}
                      placeholder={noteMode ? 'Escribí tu nota interna... (Enter guarda)' : 'Responder manualmente... (Enter envía · Shift+Enter nueva línea)'}
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendManualReply() } }}
                      rows={1} />
                    {/* Note mode toggle */}
                    <button
                      onClick={() => { setNoteMode(p => !p); setShowQuickReplies(false) }}
                      style={{ ...s.iconBtn, ...(noteMode ? { color: '#f59e0b', background: '#1a120a', borderColor: '#3a2a0e' } : {}) }}
                      title="Nota interna (solo visible en el dashboard)">
                      <i className="ti ti-lock" style={{ fontSize: 14 }} aria-hidden="true" />
                    </button>

                    <div style={{ position: 'relative' as const }} ref={quickRepliesRef}>
                      <button onClick={() => { setShowQuickReplies(p => !p); if (noteMode) setNoteMode(false) }}
                        style={{ ...s.iconBtn, ...(showQuickReplies ? { color: '#3b82f6', background: '#1a1a2e' } : {}) }}
                        title="Respuestas rápidas">
                        <i className="ti ti-bolt" style={{ fontSize: 14 }} aria-hidden="true" />
                      </button>
                      {showQuickReplies && (
                        <div className="popover-enter" style={s.quickRepliesPopover}>
                          <div style={s.quickRepliesTitle}>⚡ Respuestas rápidas</div>
                          {quickReplies.length === 0 && (
                            <div style={{ fontSize: 12, color: '#4a4a6a', padding: '8px 4px', textAlign: 'center' as const }}>
                              Sin respuestas guardadas
                            </div>
                          )}
                          {quickReplies.map((qr, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <button className="quick-reply-item" style={{ ...s.quickReplyItem, flex: 1 }}
                                onClick={() => { setReplyText(qr); setShowQuickReplies(false); textareaRef.current?.focus() }}>
                                {qr}
                              </button>
                              <button onClick={() => saveQuickReplies(quickReplies.filter((_, j) => j !== i))}
                                style={{ background: 'none', border: 'none', color: '#4a4a6a', cursor: 'pointer', fontSize: 14, padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}
                                title="Eliminar">×</button>
                            </div>
                          ))}
                          {/* Agregar nueva */}
                          <div style={{ display: 'flex', gap: 4, marginTop: 8, paddingTop: 8, borderTop: '0.5px solid var(--border)' }}>
                            <input
                              style={{ flex: 1, background: 'var(--bg-base)', border: '0.5px solid var(--border-mid)', borderRadius: 6, padding: '5px 8px', color: '#e2e8f0', fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
                              placeholder="Nueva respuesta..."
                              value={newQuickReply}
                              onChange={e => setNewQuickReply(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && newQuickReply.trim()) {
                                  saveQuickReplies([...quickReplies, newQuickReply.trim()])
                                  setNewQuickReply('')
                                }
                              }}
                            />
                            <button
                              onClick={() => { if (newQuickReply.trim()) { saveQuickReplies([...quickReplies, newQuickReply.trim()]); setNewQuickReply('') } }}
                              style={{ background: 'var(--accent-dim)', border: 'none', borderRadius: 6, padding: '5px 10px', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>
                              +
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <button onClick={sendManualReply} disabled={sending || !replyText.trim()}
                      style={{
                        ...s.sendBtn,
                        ...(noteMode ? { background: '#92400e' } : {}),
                        opacity: (!replyText.trim() || sending) ? 0.4 : 1
                      }}>
                      <i className={`ti ${noteMode ? 'ti-lock' : 'ti-send'}`} style={{ fontSize: 14 }} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={s.emptyPane}>
                <EmptyState icon="ti-message-2" title="Seleccioná una conversación"
                  sub="Las conversaciones de tus clientes aparecen en el panel izquierdo" />
              </div>
            ) )}
          </div>
        )}

        {tab === 'analytics' && <Analytics businessId={businessId} />}
        {tab === 'contacts' && (
          <Contacts onOpenChat={contactId => {
            const conv = conversations.find(c => c.contact_id === contactId)
            if (conv) { setSelectedConv(conv); setTab('inbox') }
          }} />
        )}
        {tab === 'appointments' && businessId && <Appointments businessId={businessId} />}
        {tab === 'activity' && <Activity />}
        {tab === 'settings' && <Settings businessId={businessId} onThemeChange={applyTheme} onFontChange={f => { setDashFont(f); localStorage.setItem('ar_font', f) }} plan={businessData?.plan ?? 'trial'} />}
      </div>

      {/* Toasts */}
      <div style={s.toastContainer}>
        {toasts.map(t => (
          <div key={t.id} className="toast-enter" style={{
            ...s.toast,
            ...(t.type === 'success' ? s.toastSuccess : t.type === 'warning' ? s.toastWarning : s.toastInfo)
          }}>
            {t.message}
          </div>
        ))}
      </div>

      {/* Búsqueda global */}
      {searchOpen && (
        <Search
          businessId={businessId}
          onClose={() => setSearchOpen(false)}
          onOpenConv={(convId) => {
            const conv = conversations.find(c => c.id === convId)
            if (conv) { setSelectedConv(conv); setTab('inbox') }
            else { setTab('inbox') }
            setSearchOpen(false)
          }}
          actions={[
            { label: 'Inbox', sub: 'Ver conversaciones', icon: 'ti-message-2', keywords: 'mensajes chat conversaciones', run: () => setTab('inbox') },
            { label: 'Pendientes', sub: 'Conversaciones sin responder', icon: 'ti-clock-exclamation', keywords: 'pendientes atencion', run: () => { setConvFilter('pending'); setTab('inbox') } },
            { label: 'Turnos', sub: 'Citas agendadas', icon: 'ti-calendar', keywords: 'appointments citas reservas', run: () => setTab('appointments') },
            { label: 'Analytics', sub: 'Métricas y gráficos', icon: 'ti-chart-bar', keywords: 'estadisticas metricas', run: () => setTab('analytics') },
            { label: 'Contactos', sub: 'Tus clientes', icon: 'ti-users', keywords: 'clientes', run: () => setTab('contacts') },
            { label: 'Actividad', sub: 'Historial de eventos', icon: 'ti-activity', keywords: 'historial log', run: () => setTab('activity') },
            { label: 'Configuración', sub: 'Ajustes del bot', icon: 'ti-settings', keywords: 'settings ajustes config', run: () => setTab('settings') },
          ]}
        />
      )}
    </div>
    </LangContext.Provider>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DashboardHero({ name, automationRate, pending, totalMessages, onGoPending }: {
  name?: string; automationRate: number; pending: number; totalMessages: number; onGoPending: () => void
}) {
  const hour = new Date().getHours()
  const greet = hour < 6 ? 'Buenas noches' : hour < 13 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'
  const rawDate = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  const dateStr = rawDate.charAt(0).toUpperCase() + rawDate.slice(1)
  const status = pending > 0
    ? { label: 'Requiere atención', color: '#fb923c', icon: 'ti-alert-triangle' }
    : totalMessages === 0
      ? { label: 'Listo para arrancar', color: '#60a5fa', icon: 'ti-rocket' }
      : { label: 'Todo al día', color: '#22c55e', icon: 'ti-circle-check' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 12, marginBottom: 18 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 600, color: '#e8e8f4' }}>{name ? `${greet}, ${name} 👋` : `${greet} 👋`}</div>
        <div style={{ fontSize: 12, color: '#5a5a7a', marginTop: 2 }}>{dateStr}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
        <div onClick={pending > 0 ? onGoPending : undefined}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 10, background: status.color + '18', color: status.color, fontSize: 12, fontWeight: 500, cursor: pending > 0 ? 'pointer' : 'default', border: '0.5px solid ' + status.color + '33' }}>
          <i className={`ti ${status.icon}`} style={{ fontSize: 14 }} aria-hidden="true" />{status.label}
        </div>
        {totalMessages > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 10, background: '#0d0d18', border: '0.5px solid #1e1e2e', fontSize: 12, color: '#8b8baa' }}>
            <i className="ti ti-robot" style={{ fontSize: 14, color: '#a78bfa' }} aria-hidden="true" />
            <span style={{ color: '#a78bfa', fontWeight: 500 }}>{automationRate}%</span> automatizado
          </div>
        )}
      </div>
    </div>
  )
}

function MetricCard({ label, value, sub, color, trend, trendDetail, onClick, icon, iconColor }: {
  label: string; value: string; sub: string; color?: string
  trend?: 'up' | 'down' | 'neutral'; trendDetail?: string; onClick?: () => void
  icon?: string; iconColor?: string
}) {
  const accent = iconColor || color
  const isCountable = /^\d{1,9}$/.test(value)
  const [display, setDisplay] = useState<string>(isCountable ? '0' : value)
  useEffect(() => {
    if (!isCountable) { setDisplay(value); return }
    const target = parseInt(value, 10)
    if (target === 0) { setDisplay('0'); return }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const pr = Math.min((now - start) / 650, 1)
      setDisplay(String(Math.round(target * (1 - Math.pow(1 - pr, 3)))))
      if (pr < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return (
    <div className="metric-card"
      style={{ ...s.metricCard, ...(accent ? { borderTop: `2px solid ${accent}` } : {}), ...(onClick ? { cursor: 'pointer' } : {}) }}
      onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={s.metricLabel}>{label}</div>
        {icon && (
          <div style={{ ...s.metricIcon, color: accent || '#3b82f6', background: (accent || '#3b82f6') + '18' }}>
            <i className={`ti ${icon}`} style={{ fontSize: 14 }} aria-hidden="true" />
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
        <div style={s.metricValue}>{display}</div>
        {trend && trend !== 'neutral' && (
          <span style={{ fontSize: 12, color: trend === 'up' ? '#22c55e' : '#f87171', marginBottom: 3 }}>
            <i className={`ti ti-trending-${trend}`} style={{ fontSize: 14 }} />
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' as const }}>
        <div style={{ ...s.metricSub, ...(color ? { color } : {}) }}>{sub}</div>
        {trendDetail && <div style={{ fontSize: 10, color: '#3a3a5a' }}>· {trendDetail}</div>}
      </div>
    </div>
  )
}

function ConvList({ conversations, selected, onSelect, onCopyPhone, recentId }: {
  conversations: Conversation[]
  selected: Conversation | null
  onSelect: (c: Conversation) => void
  onCopyPhone?: (phone: string) => void
  recentId?: string | null
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
          <div key={c.id} className={'conv-row' + (c.id === recentId ? ' conv-flash' : '')} onClick={() => onSelect(c)}
            style={{ ...s.convRow, ...(isActive ? s.convRowActive : {}) }}>
            <div style={{ ...s.avatar, color: '#fff', background: color, flexShrink: 0 }}>
              {getInitials(c.contact?.phone ?? '', c.contact?.name)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: '#c4c4d4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {name}
                </span>
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



function SkeletonCard() {
  return (
    <div style={{ ...s.metricCard, display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
      <div className="skeleton" style={{ height: 10, width: '55%', borderRadius: 4 }} />
      <div className="skeleton" style={{ height: 26, width: '40%', borderRadius: 4 }} />
      <div className="skeleton" style={{ height: 10, width: '60%', borderRadius: 4 }} />
    </div>
  )
}

function SkeletonList({ count }: { count: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2, padding: '4px 0' }}>
      {Array(count).fill(0).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px' }}>
          <div className="skeleton" style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
            <div className="skeleton" style={{ height: 10, width: '45%', borderRadius: 4 }} />
            <div className="skeleton" style={{ height: 10, width: '75%', borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', padding: '48px 20px', gap: 10 }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: '#13132a', border: '1px solid #1e1e3a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <i className={`ti ${icon}`} style={{ fontSize: 24, color: '#3a3a6a' }} aria-hidden="true" />
      </div>
      <div style={{ fontSize: 13, color: '#7070a0', fontWeight: 600, textAlign: 'center' as const }}>{title}</div>
      <div style={{ fontSize: 12, color: '#4a4a6a', textAlign: 'center' as const, maxWidth: 240, lineHeight: 1.5 }}>{sub}</div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  // ── Shell ───────────────────────────────────────────────────────────────────
  shell: { display: 'grid', gridTemplateColumns: '68px 1fr', height: '100vh', background: 'var(--bg-base)', color: '#e2e8f0', fontSize: 14, overflow: 'hidden', position: 'relative' },

  // ── Sidebar ─────────────────────────────────────────────────────────────────
  sidebar: { background: 'var(--bg-panel)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 0 10px', gap: 2 },
  logo: { width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, var(--accent-dark), var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 10, flexShrink: 0, letterSpacing: '0.03em', boxShadow: '0 4px 12px var(--accent-glow)' },
  sIcon: { width: 52, borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '7px 0', cursor: 'pointer', color: '#3a3a5a', background: 'transparent', border: 'none', position: 'relative', transition: 'color 0.15s, background 0.15s' },
  sIconActive: { background: 'var(--accent-dim)', color: 'var(--accent)' },
  sLabel: { fontSize: 8, fontWeight: 500, letterSpacing: '0.01em', color: '#3a3a5a', textTransform: 'uppercase' as const, maxWidth: 52, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  badge: { position: 'absolute', top: 5, right: 5, background: '#f87171', borderRadius: 10, fontSize: 9, color: '#fff', padding: '1px 4px', fontWeight: 700, lineHeight: 1.4 },
  userAvatar: { width: 30, height: 30, borderRadius: '50%', background: 'var(--accent-dim)', border: '1px solid var(--border-mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginTop: 4, cursor: 'pointer' },

  // ── Main ────────────────────────────────────────────────────────────────────
  main: { display: 'grid', gridTemplateRows: 'auto 1fr', overflow: 'hidden' },
  topbar: { padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-panel)' },
  topbarTitle: { fontSize: 13, fontWeight: 600, color: '#e2e8f0', letterSpacing: '-0.01em' },
  prodBadge: { background: 'var(--accent-dim)', border: '1px solid var(--border-mid)', borderRadius: 6, padding: '3px 9px', fontSize: 11, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0, animation: 'pulse 2s infinite' },

  // ── Dashboard ───────────────────────────────────────────────────────────────
  scrollArea: { overflowY: 'auto', padding: 20 },
  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 },
  metricCard: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', borderTop: '2px solid var(--border-mid)' },
  metricIcon: { width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  metricLabel: { fontSize: 11, color: '#5a5a7a', fontWeight: 500, letterSpacing: '0.02em' },
  metricValue: { fontSize: 24, fontWeight: 600, color: '#f0eeff', lineHeight: 1, letterSpacing: '-0.02em' },
  metricSub: { fontSize: 11, color: '#5a5a7a' },
  sectionTitle: { fontSize: 11, color: '#5a5a7a', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10, marginTop: 4, fontWeight: 500 },

  // ── Inbox ───────────────────────────────────────────────────────────────────
  inboxLayout: { display: 'grid', gridTemplateColumns: '292px 1fr', overflow: 'hidden', height: '100%' },
  convPane: { borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-panel)' },
  convSearchBox: { padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 },
  convSearchInput: { background: 'transparent', border: 'none', color: '#e2e8f0', fontSize: 12, outline: 'none', flex: 1 },
  filterRow: { display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 6px' },
  filterBtn: { flex: 1, background: 'transparent', border: 'none', borderBottom: '2px solid transparent', padding: '7px 2px', fontSize: 11, color: '#5a5a7a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, fontFamily: 'inherit', fontWeight: 500 },
  filterBtnActive: { color: 'var(--accent)', borderBottomColor: 'var(--accent)' },
  convRow: { display: 'grid', gridTemplateColumns: '34px 1fr auto', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', borderLeft: '2px solid transparent', transition: 'background 0.12s' },
  convRowActive: { background: 'var(--accent-dim)', borderLeftColor: 'var(--accent)' },
  copyBtn: { background: 'transparent', border: 'none', color: '#3a3a5a', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' },
  avatar: { width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 },

  // ── Chat pane ───────────────────────────────────────────────────────────────
  chatPane: { display: 'grid', gridTemplateRows: 'auto auto 1fr auto', overflow: 'hidden' },
  chatHeader: { padding: '11px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-panel)' },
  chatName: { fontSize: 13, fontWeight: 600, color: '#f0eeff', letterSpacing: '-0.01em' },
  chatSub: { fontSize: 11, color: '#5a5a7a' },
  chip: { background: 'var(--accent-dim)', border: '1px solid var(--border-mid)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s', color: 'var(--accent)', fontFamily: 'inherit' },
  contactPanel: { display: 'flex', flexWrap: 'wrap', padding: '10px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg-base)', gap: 0 },
  messageArea: { overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 },
  bubble: { padding: '9px 13px', borderRadius: 12, fontSize: 13, lineHeight: 1.6, wordBreak: 'break-word' },
  bubbleUser: { background: '#1c1835', border: '1px solid #2e2855', color: '#d4d0f5', borderBottomLeftRadius: 4 },
  bubbleBot: { background: '#0e1520', border: '1px solid #1a2535', color: '#c8d0dc', borderBottomRightRadius: 4 },
  aiBadge: { fontSize: 10, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 3, marginBottom: 3, fontWeight: 500 },
  msgMeta: { fontSize: 10, color: '#3a3a5a', marginTop: 3, cursor: 'default', userSelect: 'none' },
  inputArea: { padding: '12px 18px', borderTop: '1px solid var(--border)', background: 'var(--bg-panel)' },
  inputRow: { display: 'flex', gap: 8, alignItems: 'flex-end' },
  textarea: { flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border-mid)', borderRadius: 10, padding: '9px 12px', color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit', resize: 'none', outline: 'none', lineHeight: 1.5, overflowY: 'auto' },
  iconBtn: { width: 38, height: 38, background: 'transparent', border: '1px solid var(--border-mid)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a3a5a', cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s' },
  sendBtn: { background: 'linear-gradient(135deg, var(--accent-dark), var(--accent))', border: 'none', borderRadius: 10, padding: '0 16px', height: 38, color: '#fff', fontSize: 14, cursor: 'pointer', flexShrink: 0, transition: 'opacity 0.15s', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500, boxShadow: '0 2px 10px var(--accent-glow)' },
  quickRepliesPopover: { position: 'absolute', bottom: '100%', right: 0, marginBottom: 8, background: 'var(--bg-card)', border: '1px solid var(--border-mid)', borderRadius: 12, padding: 8, width: 290, zIndex: 100, boxShadow: '0 12px 32px rgba(0,0,0,0.7)' },
  quickRepliesTitle: { fontSize: 10, color: '#3a3a5a', textTransform: 'uppercase', letterSpacing: '0.07em', paddingBottom: 6, borderBottom: '1px solid var(--border)', marginBottom: 4, fontWeight: 600 },
  quickReplyItem: { display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#8080a0', fontSize: 12, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', transition: 'background 0.1s, color 0.1s', fontFamily: 'inherit' },
  emptyPane: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' },

  // ── Toggle ──────────────────────────────────────────────────────────────────
  toggleWrapper: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 10px', borderRadius: 8, background: 'var(--accent-dim)', border: '1px solid var(--border-mid)', userSelect: 'none' },
  toggleLabel: { fontSize: 11, fontWeight: 500, transition: 'color 0.2s' },
  toggleTrack: { width: 32, height: 18, borderRadius: 9, background: 'var(--border-mid)', position: 'relative', transition: 'background 0.25s', flexShrink: 0 },
  toggleTrackOn: { background: 'var(--accent-dark)' },
  toggleThumb: { position: 'absolute', top: 2, left: 2, width: 14, height: 14, borderRadius: '50%', background: '#4a4a6a', transition: 'left 0.25s, background 0.25s' },
  toggleThumbOn: { left: 16, background: '#fff' },

  // ── Toasts ──────────────────────────────────────────────────────────────────
  toastContainer: { position: 'fixed', bottom: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999 },
  toast: { padding: '10px 16px', borderRadius: 10, fontSize: 12, fontWeight: 500, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' },
  toastInfo:    { background: '#13132a', border: '1px solid #2a2a4a', color: '#c4c4e4' },
  toastSuccess: { background: '#0a1e10', border: '1px solid #1a4a25', color: '#22c55e' },
  toastWarning: { background: '#1a1408', border: '1px solid #4a3010', color: '#f59e0b' },

  // ── Tags ────────────────────────────────────────────────────────────────────
  tagPopover: { position: 'absolute', top: '100%', right: 0, marginTop: 6, background: 'var(--bg-card)', border: '1px solid var(--border-mid)', borderRadius: 12, padding: 8, width: 180, zIndex: 200, boxShadow: '0 12px 32px rgba(0,0,0,0.7)' },

  // ── Summary ─────────────────────────────────────────────────────────────────
  summaryPanel: { padding: '12px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' },

  // ── Notes ───────────────────────────────────────────────────────────────────
  noteWrapper: { alignSelf: 'center', maxWidth: '85%', width: '100%' },
  noteBadge: { fontSize: 10, color: '#d97706', display: 'flex', alignItems: 'center', gap: 3, marginBottom: 3, fontWeight: 500 },
  noteBubble: { background: '#160f00', border: '1px solid #3a2500', borderRadius: 10, borderBottomLeftRadius: 3, padding: '9px 13px', fontSize: 13, lineHeight: 1.6, color: '#fde68a', wordBreak: 'break-word' },
  inputAreaNote: { borderTopColor: '#3a2500', background: '#0e0900' },
  noteModeBar: { fontSize: 11, color: '#d97706', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: '0 2px', fontWeight: 500 },
  textareaNote: { borderColor: '#3a2500', background: '#100b00' },
}
