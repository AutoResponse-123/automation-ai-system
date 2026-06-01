import { useEffect, useState } from 'react'
import { supabase } from './supabase'

interface Conv {
  id: string; status: string; updated_at: string; started_at: string
  business_id: string; contact_id: string
  business?: { name: string; id: string }
  contact?: { phone: string; name: string | null }
  lastMsg?: string; msgCount?: number
}

interface Message {
  id: string; sender: string; content: string; created_at: string; tokens_used?: number
}

function timeAgo(d: string) {
  const s = (Date.now() - new Date(d).getTime()) / 1000
  if (s < 60) return `${Math.floor(s)}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  active:   { color: 'var(--accent)',   label: 'Activa' },
  pending:  { color: 'var(--warn)',     label: 'Pendiente' },
  resolved: { color: 'var(--text-3)',   label: 'Resuelta' },
}

export default function Conversations() {
  const [convs, setConvs] = useState<Conv[]>([])
  const [selected, setSelected] = useState<Conv | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [bizFilter, setBizFilter] = useState<string>('all')

  useEffect(() => {
    load()
    const ch = supabase.channel('admin-convs-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, load)
      .subscribe()
    return () => { ch.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!selected) return
    loadMessages(selected.id)
  }, [selected])

  async function load() {
    setLoading(true)

    const { data: rawConvs } = await supabase
      .from('conversations')
      .select('id, status, updated_at, started_at, business_id, contact_id')
      .order('updated_at', { ascending: false })
      .limit(100)

    if (!rawConvs || rawConvs.length === 0) { setLoading(false); return }

    // Fetch businesses and contacts in bulk
    const bizIds = [...new Set(rawConvs.map((c: any) => c.business_id).filter(Boolean))]
    const contactIds = [...new Set(rawConvs.map((c: any) => c.contact_id).filter(Boolean))]

    const [{ data: bizList }, { data: contactList }] = await Promise.all([
      supabase.from('businesses').select('id, name').in('id', bizIds),
      supabase.from('contacts').select('id, phone, name').in('id', contactIds),
    ])

    const bizMap: Record<string, any> = {}
    const contactMap: Record<string, any> = {}
    ;(bizList ?? []).forEach((b: any) => { bizMap[b.id] = b })
    ;(contactList ?? []).forEach((c: any) => { contactMap[c.id] = c })

    const enriched = await Promise.all(rawConvs.map(async (c: any) => {
      const { data: msgs } = await supabase.from('messages').select('content').eq('conversation_id', c.id).order('created_at', { ascending: false }).limit(1)
      const { count } = await supabase.from('messages').select('id', { count: 'exact' }).eq('conversation_id', c.id)
      return {
        ...c,
        business: bizMap[c.business_id] || null,
        contact: contactMap[c.contact_id] || null,
        lastMsg: msgs?.[0]?.content?.slice(0, 80) || '',
        msgCount: count ?? 0,
      }
    }))

    setConvs(enriched)
    setLoading(false)
  }

  async function loadMessages(convId: string) {
    setLoadingMsgs(true)
    const { data } = await supabase.from('messages').select('id, sender, content, created_at, tokens_used').eq('conversation_id', convId).order('created_at', { ascending: true }).limit(60)
    setMessages(data ?? [])
    setLoadingMsgs(false)
  }

  async function setStatus(convId: string, status: string) {
    await supabase.from('conversations').update({ status }).eq('id', convId)
    await load()
    if (selected?.id === convId) setSelected(prev => prev ? { ...prev, status } : null)
  }

  const filtered = convs.filter(c => {
    const matchF = filter === 'all' || c.status === filter
    const matchS = !search || (c.business?.name || '').toLowerCase().includes(search.toLowerCase()) || (c.contact?.phone || '').includes(search)
    const matchB = bizFilter === 'all' || c.business_id === bizFilter
    return matchF && matchS && matchB
  })
  const businesses = Array.from(new Map(convs.filter(c => c.business).map(c => [c.business_id, c.business!])).entries()).map(([id, b]) => ({ id, name: b.name }))

  const pendingCount = convs.filter(c => c.status === 'pending').length

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left: list */}
      <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)' }}>
        {/* Filters */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', marginBottom: 8 }}>
            <i className="ti ti-search" style={{ fontSize: 13, color: 'var(--text-3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar negocio o teléfono..."
              style={{ background: 'none', border: 'none', outline: 'none', fontSize: 12, color: 'var(--text-1)', flex: 1, fontFamily: 'inherit' }} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <select value={bizFilter} onChange={e => setBizFilter(e.target.value)}
              style={{ width: '100%', background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 8px', fontSize: 11, color: 'var(--text-1)', cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }}>
              <option value="all">Todos los negocios</option>
              {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['all','pending','active','resolved'].map(s => (
              <button key={s} onClick={() => setFilter(s)}
                style={{ flex: 1, padding: '4px 0', borderRadius: 6, border: '1px solid ' + (filter === s ? (STATUS_STYLE[s]?.color || 'var(--accent)') : 'var(--border)'), background: filter === s ? (STATUS_STYLE[s]?.color || 'var(--accent)') + '18' : 'transparent', fontSize: 9, color: filter === s ? (STATUS_STYLE[s]?.color || 'var(--accent)') : 'var(--text-3)', cursor: 'pointer', fontFamily: 'inherit', position: 'relative' }}>
                {s === 'all' ? 'Todo' : STATUS_STYLE[s]?.label}
                {s === 'pending' && pendingCount > 0 && (
                  <span style={{ marginLeft: 3, background: 'var(--warn)', color: '#000', fontSize: 9, borderRadius: 6, padding: '0 4px' }}>{pendingCount}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{ height: 56 }} />)}
            </div>
          ) : filtered.map(c => {
            const st = STATUS_STYLE[c.status] || STATUS_STYLE.active
            const sel = selected?.id === c.id
            return (
              <div key={c.id} onClick={() => setSelected(c)}
                style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', background: sel ? 'var(--bg-hover)' : 'transparent', borderLeft: `3px solid ${sel ? st.color : 'transparent'}`, transition: 'all 0.1s' }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'var(--bg-raised)' }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-1)' }}>{c.business?.name || 'Sin negocio'}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{timeAgo(c.updated_at)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.contact?.phone || '—'}</span>
                  <span style={{ fontSize: 9, color: st.color, background: st.color + '18', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>{st.label}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.lastMsg || 'Sin mensajes'}
                </div>
              </div>
            )
          })}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>Sin conversaciones</div>
          )}
        </div>

        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-3)', textAlign: 'center' }}>
          {filtered.length} conversaciones
        </div>
      </div>

      {/* Right: messages */}
      {selected ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} className="fade-in">
          {/* Conv header */}
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{selected.business?.name || 'Sin negocio'}</span>
                <span style={{ fontSize: 11, color: STATUS_STYLE[selected.status]?.color || 'var(--text-3)', background: (STATUS_STYLE[selected.status]?.color || 'var(--text-3)') + '18', borderRadius: 5, padding: '2px 7px', fontWeight: 600 }}>
                  {STATUS_STYLE[selected.status]?.label || selected.status}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                {selected.contact?.name || selected.contact?.phone || '—'} · {selected.msgCount} mensajes · última actividad {timeAgo(selected.updated_at)}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {selected.status !== 'resolved' && (
                <button onClick={() => setStatus(selected.id, 'resolved')}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--accent-dim)', border: '1px solid var(--accent)40', borderRadius: 7, padding: '6px 12px', fontSize: 11, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <i className="ti ti-check" style={{ fontSize: 12 }} /> Resolver
                </button>
              )}
              {selected.status === 'pending' && (
                <button onClick={() => setStatus(selected.id, 'active')}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#f59e0b18', border: '1px solid #f59e0b40', borderRadius: 7, padding: '6px 12px', fontSize: 11, fontWeight: 600, color: 'var(--warn)', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <i className="ti ti-robot" style={{ fontSize: 12 }} /> Devolver a IA
                </button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loadingMsgs ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 48, width: i % 2 === 0 ? '60%' : '45%', alignSelf: i % 2 === 0 ? 'flex-end' : 'flex-start' }} />)}
              </div>
            ) : messages.map(msg => {
              const isBot = msg.sender === 'assistant'
              return (
                <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isBot ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '68%', padding: '9px 13px', borderRadius: isBot ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                    background: isBot ? 'var(--accent-dim)' : 'var(--bg-raised)',
                    border: `1px solid ${isBot ? 'var(--accent)30' : 'var(--border)'}`,
                  }}>
                    <div style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.5 }}>{msg.content}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
                      <span style={{ fontSize: 9, color: 'var(--text-3)' }}>{new Date(msg.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                      {isBot && msg.tokens_used && <span style={{ fontSize: 9, color: 'var(--text-3)' }}>{msg.tokens_used}t</span>}
                    </div>
                  </div>
                  <span style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 3, padding: '0 4px' }}>
                    {isBot ? '🤖 Bot' : '👤 Cliente'}
                  </span>
                </div>
              )
            })}
            {!loadingMsgs && messages.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 12, marginTop: 40 }}>Sin mensajes en esta conversación</div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
          <i className="ti ti-messages" style={{ fontSize: 36, marginBottom: 10 }} />
          <p style={{ fontSize: 13, margin: 0 }}>Seleccioná una conversación</p>
        </div>
      )}
    </div>
  )
}
