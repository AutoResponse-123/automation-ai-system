import { useEffect, useState } from 'react'
import { useT } from './i18n'
import { supabase } from './supabase'

// ── Difusiones masivas ────────────────────────────────────────────────────────
// Envía una plantilla aprobada a un segmento de contactos (todos o por etapa del
// Embudo). El envío lo hace el backend en segundo plano; acá se ve el progreso.

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL

interface Broadcast {
  id: string
  name: string | null
  segment: string
  status: string
  total: number
  sent: number
  failed: number
  created_at: string
}

const STAGES = ['nuevo', 'contactado', 'agendó', 'atendió', 'recurrente', 'perdido']

export default function Broadcasts({ businessId }: { businessId?: string }) {
  const t = useT()
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [total, setTotal] = useState(0)
  const [segment, setSegment] = useState('all')
  const [name, setName] = useState('')
  const [contentSid, setContentSid] = useState('')
  const [varValue, setVarValue] = useState('')
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [history, setHistory] = useState<Broadcast[]>([])

  useEffect(() => { loadCounts(); loadHistory() }, [businessId])

  async function loadCounts() {
    const { data } = await supabase.from('contacts').select('stage')
    const c: Record<string, number> = {}
    for (const row of data || []) {
      const st = (row as any).stage || 'nuevo'
      c[st] = (c[st] || 0) + 1
    }
    setCounts(c)
    setTotal((data || []).length)
  }

  async function loadHistory() {
    const { data } = await supabase
      .from('broadcasts')
      .select('id, name, segment, status, total, sent, failed, created_at')
      .order('created_at', { ascending: false })
      .limit(20)
    setHistory((data as Broadcast[]) || [])
  }

  const recipientCount = segment === 'all' ? total : (counts[segment.replace('stage:', '')] || 0)

  async function send() {
    setMsg(null)
    if (!contentSid.trim()) { setMsg({ kind: 'err', text: 'Falta el ID de la plantilla (Content SID).' }); return }
    if (recipientCount === 0) { setMsg({ kind: 'err', text: 'No hay contactos en ese segmento.' }); return }
    setSending(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${BACKEND_URL}/api/broadcasts/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({
          businessId,
          name: name.trim() || null,
          segment,
          contentSid: contentSid.trim(),
          variables: varValue.trim() ? { '1': varValue.trim() } : {},
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Error al enviar')
      setMsg({ kind: 'ok', text: `Difusión iniciada: ${j.total} destinatarios. El envío sigue en segundo plano.` })
      setName(''); setVarValue('')
      setTimeout(loadHistory, 1500)
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message })
    } finally {
      setSending(false)
    }
  }

  function segLabel(seg: string): string {
    if (seg === 'all') return 'Todos los contactos'
    const st = seg.replace('stage:', '')
    return `Etapa: ${st}`
  }

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span style={s.title}>{t('broadcasts_title')}</span>
        <span style={s.sub}>Enviá una plantilla a un grupo de clientes</span>
      </div>

      <div style={s.grid}>
        {/* Compositor */}
        <div style={s.card}>
          <label style={s.label}>Segmento</label>
          <select value={segment} onChange={e => setSegment(e.target.value)} style={s.input}>
            <option value="all">Todos los contactos ({total})</option>
            {STAGES.map(st => (
              <option key={st} value={`stage:${st}`}>Etapa: {st} ({counts[st] || 0})</option>
            ))}
          </select>

          <label style={s.label}>Nombre de la difusión (opcional)</label>
          <input style={s.input} value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Promo de julio" />

          <label style={s.label}>ID de plantilla (Content SID)</label>
          <input style={s.input} value={contentSid} onChange={e => setContentSid(e.target.value)} placeholder="HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />

          <label style={s.label}>Texto de la variable {'{{1}}'} (opcional)</label>
          <input style={s.input} value={varValue} onChange={e => setVarValue(e.target.value)} placeholder="Usá {name} para el nombre del cliente" />
          <div style={s.hint}>Tip: escribí <code>{'{name}'}</code> y se reemplaza por el nombre de cada contacto.</div>

          <div style={s.previewRow}>
            <span style={s.preview}>Se enviará a <b style={{ color: 'var(--accent)' }}>{recipientCount}</b> contactos</span>
            <button onClick={send} disabled={sending} style={s.sendBtn}>
              <i className="ti ti-send" style={{ fontSize: 14 }} /> {sending ? 'Enviando…' : 'Enviar difusión'}
            </button>
          </div>

          {msg && <div style={{ ...s.msg, color: msg.kind === 'ok' ? '#2E8B57' : '#dc2626' }}>{msg.text}</div>}
        </div>

        {/* Historial */}
        <div style={s.card}>
          <div style={s.histTitle}>Últimas difusiones</div>
          {history.length === 0 ? (
            <div style={s.empty}>Todavía no enviaste ninguna.</div>
          ) : history.map(b => (
            <div key={b.id} style={s.histRow}>
              <div style={{ minWidth: 0 }}>
                <div style={s.histName}>{b.name || segLabel(b.segment)}</div>
                <div style={s.histMeta}>{segLabel(b.segment)} · {new Date(b.created_at).toLocaleDateString('es-AR')}</div>
              </div>
              <div style={s.histStat}>
                <span style={{ color: b.status === 'done' ? '#2E8B57' : 'var(--text-2)' }}>{b.sent}/{b.total}</span>
                {b.failed > 0 && <span style={{ color: '#dc2626', fontSize: 11 }}> · {b.failed} fallaron</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={s.note}>
        <i className="ti ti-info-circle" style={{ fontSize: 13 }} /> Para enviar difusiones necesitás una plantilla aprobada por Meta y su Content SID (de tu cuenta de Twilio). El envío respeta los límites de WhatsApp.
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: { padding: 16, height: '100%', overflowY: 'auto' },
  header: { display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 14 },
  title: { fontSize: 13, fontWeight: 600, color: 'var(--text-1)' },
  sub: { fontSize: 12, color: 'var(--text-3)' },
  grid: { display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 14, alignItems: 'start' },
  card: { background: 'var(--bg-card)', border: '0.5px solid var(--border-mid)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 11, color: 'var(--text-3)', marginTop: 8, textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  input: { background: 'var(--bg-input)', border: '0.5px solid var(--border-mid)', borderRadius: 8, padding: '9px 11px', color: 'var(--text-1)', fontSize: 13, outline: 'none', fontFamily: 'inherit' },
  hint: { fontSize: 11, color: 'var(--text-3)', marginTop: 2 },
  previewRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 10, flexWrap: 'wrap' },
  preview: { fontSize: 13, color: 'var(--text-2)' },
  sendBtn: { display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  msg: { fontSize: 12, marginTop: 10 },
  histTitle: { fontSize: 12, fontWeight: 600, color: 'var(--text-1)', marginBottom: 8 },
  empty: { fontSize: 12, color: 'var(--text-3)', padding: '12px 0' },
  histRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid var(--border)', gap: 10 },
  histName: { fontSize: 12, fontWeight: 500, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  histMeta: { fontSize: 11, color: 'var(--text-3)' },
  histStat: { fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' as const },
  note: { display: 'flex', alignItems: 'center', gap: 7, marginTop: 14, padding: '10px 12px', background: 'var(--accent-dim)', borderRadius: 8, fontSize: 12, color: 'var(--text-2)' },
}
