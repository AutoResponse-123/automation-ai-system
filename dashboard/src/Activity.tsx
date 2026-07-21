import { useEffect, useState, useRef } from 'react'
import { useT } from './i18n'
import { supabase } from './supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActivityEvent {
  id: string
  type: 'new_message' | 'new_conversation' | 'ai_response' | 'resolved' | 'error'
  title: string
  detail: string
  timestamp: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60) return `${Math.floor(diff)}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return new Date(dateStr).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

const EVENT_STYLES: Record<ActivityEvent['type'], { icon: string; color: string; bg: string }> = {
  new_message:      { icon: 'ti-message-2',   color: '#1585c7', bg: 'var(--bg-card)' },
  new_conversation: { icon: 'ti-message-plus', color: '#38bdf8', bg: '#0e1e2e' },
  ai_response:      { icon: 'ti-sparkles',     color: '#22a7f0', bg: '#0a1a0e' },
  resolved:         { icon: 'ti-circle-check', color: '#4fc3f7', bg: '#0a1e18' },
  error:            { icon: 'ti-alert-circle', color: '#f87171', bg: '#2e0e0e' },
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Activity() {
  const t = useT()
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadRecentActivity()

    const channel = supabase
      .channel('activity-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          if (pausedRef.current) return
          const msg = payload.new as any
          const isAI = msg.sender === 'assistant'
          addEvent({
            type: isAI ? 'ai_response' : 'new_message',
            title: isAI ? 'Claude respondió' : 'Nuevo mensaje',
            detail: (msg.content || '').slice(0, 60) + ((msg.content || '').length > 60 ? '...' : ''),
            timestamp: msg.created_at,
          })
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' },
        (payload) => {
          if (pausedRef.current) return
          const conv = payload.new as any
          addEvent({
            type: 'new_conversation',
            title: 'Nueva conversación',
            detail: `ID: ${conv.id?.slice(0, 8)}...`,
            timestamp: conv.started_at ?? new Date().toISOString(),
          })
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' },
        (payload) => {
          if (pausedRef.current) return
          const conv = payload.new as any
          if (conv.status === 'resolved') {
            addEvent({
              type: 'resolved',
              title: 'Conversación resuelta',
              detail: `ID: ${conv.id?.slice(0, 8)}...`,
              timestamp: new Date().toISOString(),
            })
          }
        }
      )
      .subscribe()

    return () => { channel.unsubscribe() }
  }, [])

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    if (!paused) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events, paused])

  function addEvent(e: Omit<ActivityEvent, 'id'>) {
    setEvents(prev => [...prev.slice(-199), { ...e, id: crypto.randomUUID() }])
  }

  async function loadRecentActivity() {
    // Load last 30 messages as initial activity
    const { data: msgs } = await supabase
      .from('messages')
      .select('id, sender, content, created_at')
      .order('created_at', { ascending: false })
      .limit(30)

    if (!msgs) return

    const initial: ActivityEvent[] = msgs.reverse().map(msg => ({
      id: msg.id,
      type: msg.sender === 'assistant' ? 'ai_response' : 'new_message',
      title: msg.sender === 'assistant' ? 'Claude respondió' : 'Mensaje recibido',
      detail: (msg.content?.slice(0, 60) ?? '') + ((msg.content?.length ?? 0) > 60 ? '...' : ''),
      timestamp: msg.created_at,
    }))

    setEvents(initial)
  }

  function clearEvents() {
    setEvents([])
  }

  const liveCount = events.filter(e =>
    (Date.now() - new Date(e.timestamp).getTime()) < 3600000
  ).length

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <span style={s.headerTitle}>{t('activity_live')}</span>
          <div style={s.livePill}>
            <div style={{ ...s.liveDot, ...(paused ? s.liveDotPaused : {}) }} />
            {paused ? t('activity_paused') : t('activity_live_pill')}
          </div>
          <span style={s.eventCount}>{liveCount} {t('activity_events_hour')}</span>
        </div>
        <div style={s.headerActions}>
          <button onClick={() => setPaused(p => !p)} style={s.actionBtn}>
            <i className={`ti ${paused ? 'ti-player-play' : 'ti-player-pause'}`} style={{ fontSize: 13 }} aria-hidden="true" />
            {paused ? t('activity_resume') : t('activity_pause')}
          </button>
          <button onClick={clearEvents} style={s.actionBtn}>
            <i className="ti ti-trash" style={{ fontSize: 13 }} aria-hidden="true" /> Limpiar
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div style={s.statsRow}>
        {(['new_message', 'ai_response', 'new_conversation', 'resolved', 'error'] as const).map(type => {
          const count = events.filter(e => e.type === type).length
          const style = EVENT_STYLES[type]
          const labels: Record<string, string> = {
            new_message: t('activity_stat_messages'),
            ai_response: t('activity_stat_ai'),
            new_conversation: t('activity_stat_new_convs'),
            resolved: t('activity_stat_resolved'),
            error: t('activity_stat_errors'),
          }
          return (
            <div key={type} style={s.statCard}>
              <div style={{ ...s.statIcon, color: style.color, background: style.bg }}>
                <i className={`ti ${style.icon}`} style={{ fontSize: 14 }} aria-hidden="true" />
              </div>
              <div>
                <div style={s.statValue}>{count}</div>
                <div style={s.statLabel}>{labels[type]}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Feed */}
      <div style={s.feed}>
        {events.length === 0 ? (
          <div style={s.emptyFeed}>
            <i className="ti ti-activity" style={{ fontSize: 24, color: 'var(--border-mid)' }} aria-hidden="true" />
            <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 8 }}>Esperando eventos...</p>
          </div>
        ) : (
          events.map(e => {
            const style = EVENT_STYLES[e.type]
            return (
              <div key={e.id} style={s.eventRow}>
                <div style={{ ...s.eventIcon, color: style.color, background: style.bg }}>
                  <i className={`ti ${style.icon}`} style={{ fontSize: 13 }} aria-hidden="true" />
                </div>
                <div style={s.eventContent}>
                  <div style={s.eventTitle}>{e.title}</div>
                  <div style={s.eventDetail}>{e.detail}</div>
                </div>
                <div style={s.eventTime}>{timeAgo(e.timestamp)}</div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: { display: 'grid', gridTemplateRows: 'auto auto 1fr', height: '100%', overflow: 'hidden', padding: 16, gap: 12 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 13, fontWeight: 500, color: 'var(--text-1)' },
  livePill: { display: 'flex', alignItems: 'center', gap: 5, background: '#0a1a0e', border: '0.5px solid #1a2e1e', borderRadius: 20, padding: '3px 8px', fontSize: 11, color: '#22a7f0' },
  liveDot: { width: 6, height: 6, borderRadius: '50%', background: '#22a7f0', animation: 'pulse 2s infinite' },
  liveDotPaused: { background: 'var(--text-3)', animation: 'none' },
  eventCount: { fontSize: 11, color: 'var(--text-3)' },
  headerActions: { display: 'flex', gap: 6 },
  actionBtn: { background: 'var(--bg-card)', border: '0.5px solid var(--border-mid)', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 },
  statCard: { background: 'var(--bg-card)', border: '0.5px solid var(--border-mid)', borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 },
  statIcon: { width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statValue: { fontSize: 16, fontWeight: 500, color: 'var(--text-1)', lineHeight: 1 },
  statLabel: { fontSize: 10, color: 'var(--text-3)', marginTop: 2 },
  feed: { overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 },
  emptyFeed: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200 },
  eventRow: { display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 10, alignItems: 'center', padding: '7px 10px', borderRadius: 8, background: 'var(--bg-card)', border: '0.5px solid var(--border-mid)' },
  eventIcon: { width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  eventContent: { minWidth: 0 },
  eventTitle: { fontSize: 12, fontWeight: 500, color: 'var(--text-1)' },
  eventDetail: { fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  eventTime: { fontSize: 10, color: 'var(--text-3)', flexShrink: 0 },
}
