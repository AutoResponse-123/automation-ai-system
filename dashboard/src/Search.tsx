import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

interface SearchResult {
  id: string
  content: string
  sender: 'user' | 'assistant'
  created_at: string
  conversation_id: string
  contact_name?: string
  contact_phone?: string
}

function highlight(text: string, query: string): string {
  if (!query.trim()) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text.slice(0, 80)
  const start = Math.max(0, idx - 30)
  const end = Math.min(text.length, idx + query.length + 50)
  return (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '')
}

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

export default function Search({
  onClose,
  onOpenConv,
  businessId,
}: {
  onClose: () => void
  onOpenConv: (conversationId: string) => void
  businessId: string | null
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) { setResults([]); return }
    debounceRef.current = setTimeout(() => search(query), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  useEffect(() => { setSelected(0) }, [results])

  async function search(q: string) {
    if (!businessId) return
    setLoading(true)
    // Traer IDs de convs del negocio
    const { data: convRows } = await supabase
      .from('conversations')
      .select('id, contact_id')
      .eq('business_id', businessId)

    const convIds = convRows?.map(c => c.id) ?? []
    if (convIds.length === 0) { setResults([]); setLoading(false); return }

    const { data: msgs } = await supabase
      .from('messages')
      .select('id, content, sender, created_at, conversation_id')
      .in('conversation_id', convIds)
      .ilike('content', `%${q}%`)
      .order('created_at', { ascending: false })
      .limit(25)

    if (!msgs) { setResults([]); setLoading(false); return }

    // Enriquecer con datos de contacto
    const contactIds = [...new Set(
      convRows
        ?.filter(c => msgs.some(m => m.conversation_id === c.id))
        .map(c => c.contact_id)
        .filter(Boolean) ?? []
    )]

    const { data: contacts } = contactIds.length > 0
      ? await supabase.from('contacts').select('id, name, phone').in('id', contactIds)
      : { data: [] }

    const contactMap = Object.fromEntries((contacts ?? []).map(c => [c.id, c]))
    const convContactMap = Object.fromEntries((convRows ?? []).map(c => [c.id, c.contact_id]))

    setResults(msgs.map(m => {
      const contactId = convContactMap[m.conversation_id]
      const contact = contactMap[contactId]
      return {
        ...m,
        contact_name: contact?.name,
        contact_phone: contact?.phone,
      }
    }))
    setLoading(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter' && results[selected]) {
      onOpenConv(results[selected].conversation_id)
      onClose()
    }
  }

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={s.modal}>
        {/* Buscador */}
        <div style={s.inputRow}>
          <i className="ti ti-search" style={{ fontSize: 16, color: '#5a5a7a', flexShrink: 0 }} />
          <input
            ref={inputRef}
            style={s.input}
            placeholder="Buscar en todos los mensajes..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {loading && <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 14, color: '#5a5a7a', flexShrink: 0 }} />}
          <kbd style={s.esc} onClick={onClose}>Esc</kbd>
        </div>

        {/* Resultados */}
        <div style={s.results}>
          {query.trim().length < 2 ? (
            <div style={s.hint}>
              <i className="ti ti-command" style={{ fontSize: 18, color: '#2e2e4a' }} />
              <span>Escribí al menos 2 caracteres para buscar</span>
            </div>
          ) : !loading && results.length === 0 ? (
            <div style={s.hint}>
              <i className="ti ti-mood-empty" style={{ fontSize: 18, color: '#2e2e4a' }} />
              <span>Sin resultados para "<strong>{query}</strong>"</span>
            </div>
          ) : (
            <>
              {results.length > 0 && (
                <div style={s.resultsHeader}>{results.length} resultado{results.length !== 1 ? 's' : ''}</div>
              )}
              {results.map((r, i) => {
                const isSelected = i === selected
                const name = r.contact_name ?? r.contact_phone ?? 'Desconocido'
                const excerpt = highlight(r.content, query)
                return (
                  <div
                    key={r.id}
                    style={{ ...s.resultRow, ...(isSelected ? s.resultRowActive : {}) }}
                    onMouseEnter={() => setSelected(i)}
                    onClick={() => { onOpenConv(r.conversation_id); onClose() }}
                  >
                    <div style={{ ...s.senderDot, background: r.sender === 'user' ? '#38bdf8' : 'var(--accent)' }} />
                    <div style={s.resultContent}>
                      <div style={s.resultMeta}>
                        <span style={s.resultName}>{name}</span>
                        <span style={s.resultRole}>{r.sender === 'user' ? 'Cliente' : 'Bot'}</span>
                        <span style={s.resultTime}>{timeAgo(r.created_at)}</span>
                      </div>
                      <div style={s.resultExcerpt}>{excerpt}</div>
                    </div>
                    {isSelected && <i className="ti ti-arrow-right" style={{ fontSize: 12, color: '#5a5a7a', flexShrink: 0 }} />}
                  </div>
                )
              })}
            </>
          )}
        </div>

        <div style={s.footer}>
          <span><kbd style={s.key}>↑↓</kbd> navegar</span>
          <span><kbd style={s.key}>↵</kbd> abrir</span>
          <span><kbd style={s.key}>Esc</kbd> cerrar</span>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80, backdropFilter: 'blur(4px)' },
  modal: { width: '100%', maxWidth: 600, background: 'var(--bg-card)', border: '1px solid var(--border-mid)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column' },
  inputRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--border)' },
  input: { flex: 1, background: 'transparent', border: 'none', color: '#e2e8f0', fontSize: 15, outline: 'none', fontFamily: "'Inter', system-ui, sans-serif" },
  esc: { background: 'var(--bg-panel)', border: '1px solid var(--border-mid)', borderRadius: 6, padding: '2px 7px', fontSize: 11, color: '#5a5a7a', cursor: 'pointer', fontFamily: 'inherit' },
  results: { maxHeight: 400, overflowY: 'auto', padding: '6px 0' },
  resultsHeader: { fontSize: 10, color: '#4a4a6a', padding: '6px 16px 2px', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 },
  hint: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '40px 20px', color: '#4a4a6a', fontSize: 13 },
  resultRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', cursor: 'pointer', transition: 'background 0.1s' },
  resultRowActive: { background: 'var(--accent-dim)' },
  senderDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  resultContent: { flex: 1, minWidth: 0 },
  resultMeta: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 },
  resultName: { fontSize: 12, fontWeight: 600, color: '#c4c4d4' },
  resultRole: { fontSize: 10, color: '#4a4a6a', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px' },
  resultTime: { fontSize: 10, color: '#4a4a6a', marginLeft: 'auto' },
  resultExcerpt: { fontSize: 12, color: '#6a6a8a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  footer: { display: 'flex', gap: 16, padding: '8px 16px', borderTop: '1px solid var(--border)', fontSize: 11, color: '#4a4a6a' },
  key: { background: 'var(--bg-panel)', border: '1px solid var(--border-mid)', borderRadius: 4, padding: '1px 5px', fontSize: 10, color: '#8080a0', fontFamily: 'inherit', marginRight: 4 },
}
