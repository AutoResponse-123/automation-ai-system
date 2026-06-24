import { useEffect, useState } from 'react'
import { useT } from './i18n'
import { supabase } from './supabase'

// ── Difusiones masivas ────────────────────────────────────────────────────────
// 1) Creás una plantilla y se manda a aprobar a Meta (queda pendiente ~1 día).
// 2) Cuando está aprobada, la elegís y la enviás a un segmento de contactos.

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL

interface Broadcast {
  id: string; name: string | null; segment: string; status: string
  total: number; sent: number; failed: number; created_at: string
}
interface Template {
  id: string; content_sid: string; name: string; body: string
  category: string; status: string; created_at: string
}

const STAGES = ['nuevo', 'contactado', 'agendó', 'atendió', 'recurrente', 'perdido']

async function authedFetch(path: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  return fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}`, ...(init.headers || {}) },
  })
}

export default function Broadcasts({ businessId }: { businessId?: string }) {
  const t = useT()
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [total, setTotal] = useState(0)
  const [sampleName, setSampleName] = useState('Juan')

  // Compositor de envío
  const [segment, setSegment] = useState('all')
  const [name, setName] = useState('')
  const [selectedSid, setSelectedSid] = useState('')
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // Plantillas
  const [templates, setTemplates] = useState<Template[]>([])
  const [newBody, setNewBody] = useState('')
  const [newCategory, setNewCategory] = useState<'marketing' | 'utility'>('marketing')
  const [creating, setCreating] = useState(false)
  const [tplMsg, setTplMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const [history, setHistory] = useState<Broadcast[]>([])

  useEffect(() => { loadCounts(); loadHistory(); loadTemplates() }, [businessId])

  async function loadCounts() {
    const { data } = await supabase.from('contacts').select('stage, name')
    const c: Record<string, number> = {}
    let sample = ''
    for (const row of data || []) {
      const st = (row as any).stage || 'nuevo'
      c[st] = (c[st] || 0) + 1
      if (!sample && (row as any).name) sample = (row as any).name
    }
    setCounts(c); setTotal((data || []).length); setSampleName(sample || 'Juan')
  }

  async function loadHistory() {
    const { data } = await supabase.from('broadcasts')
      .select('id, name, segment, status, total, sent, failed, created_at')
      .order('created_at', { ascending: false }).limit(20)
    setHistory((data as Broadcast[]) || [])
  }

  async function loadTemplates() {
    if (!businessId) return
    try {
      const res = await authedFetch(`/api/broadcasts/templates?businessId=${businessId}`)
      const j = await res.json()
      if (res.ok) setTemplates(j.templates || [])
    } catch { /* noop */ }
  }

  async function createTemplate() {
    setTplMsg(null)
    if (!newBody.trim()) { setTplMsg({ kind: 'err', text: 'Escribí el mensaje de la plantilla.' }); return }
    setCreating(true)
    try {
      // El token amigable [nombre] se convierte a la variable {{1}} que entiende WhatsApp.
      const body = newBody.trim().replace(/\[nombre\]/gi, '{{1}}')
      const res = await authedFetch('/api/broadcasts/templates', {
        method: 'POST',
        body: JSON.stringify({ businessId, body, category: newCategory }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Error al crear la plantilla')
      setTplMsg({ kind: 'ok', text: '¡Plantilla enviada a aprobación! Meta suele tardar ~1 día hábil.' })
      setNewBody('')
      loadTemplates()
    } catch (e: any) {
      setTplMsg({ kind: 'err', text: e.message })
    } finally {
      setCreating(false)
    }
  }

  const approved = templates.filter(tp => tp.status === 'approved')
  const selectedTpl = templates.find(tp => tp.content_sid === selectedSid)
  const recipientCount = segment === 'all' ? total : (counts[segment.replace('stage:', '')] || 0)

  function render(body: string) {
    return body.replace(/\{\{1\}\}/g, sampleName).replace(/\[nombre\]/gi, sampleName)
  }

  async function send() {
    setMsg(null)
    if (!selectedSid) { setMsg({ kind: 'err', text: 'Elegí una plantilla aprobada.' }); return }
    if (recipientCount === 0) { setMsg({ kind: 'err', text: 'No hay contactos en ese segmento.' }); return }
    setSending(true)
    try {
      const hasVar = /\{\{1\}\}/.test(selectedTpl?.body || '')
      const res = await authedFetch('/api/broadcasts/send', {
        method: 'POST',
        body: JSON.stringify({
          businessId, name: name.trim() || null, segment, contentSid: selectedSid,
          variables: hasVar ? { '1': '{name}' } : {},
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Error al enviar')
      setMsg({ kind: 'ok', text: `Difusión iniciada: ${j.total} destinatarios.` })
      setName('')
      setTimeout(loadHistory, 1500)
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message })
    } finally {
      setSending(false)
    }
  }

  const statusBadge = (st: string) => {
    if (st === 'approved') return { label: 'Aprobada', color: '#2E8B57', bg: '#2E8B5722' }
    if (st === 'rejected') return { label: 'Rechazada', color: '#dc2626', bg: '#dc262622' }
    return { label: 'Pendiente', color: '#b8860b', bg: '#f59e0b22' }
  }
  const segLabel = (seg: string) => seg === 'all' ? 'Todos los contactos' : `Etapa: ${seg.replace('stage:', '')}`

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span style={s.title}>{t('broadcasts_title')}</span>
        <span style={s.sub}>Mandá un mensaje a un grupo de clientes</span>
      </div>

      <div style={s.grid}>
        {/* Enviar */}
        <div style={s.card}>
          <div style={s.cardTitle}>Nueva difusión</div>

          <label style={s.label}>Segmento</label>
          <select value={segment} onChange={e => setSegment(e.target.value)} style={s.input}>
            <option value="all">Todos los contactos ({total})</option>
            {STAGES.map(st => <option key={st} value={`stage:${st}`}>Etapa: {st} ({counts[st] || 0})</option>)}
          </select>

          <label style={s.label}>Plantilla</label>
          {approved.length === 0 ? (
            <div style={s.warn}>
              <i className="ti ti-clock" style={{ fontSize: 13 }} /> No tenés plantillas aprobadas todavía. Creá una abajo y esperá la aprobación de Meta.
            </div>
          ) : (
            <select value={selectedSid} onChange={e => setSelectedSid(e.target.value)} style={s.input}>
              <option value="">Elegí una plantilla…</option>
              {approved.map(tp => <option key={tp.id} value={tp.content_sid}>{tp.body.slice(0, 50)}</option>)}
            </select>
          )}

          {selectedTpl && (
            <div style={s.previewBox}>
              <span style={s.previewLabel}>Vista previa para {sampleName}</span>
              <span style={s.previewText}>{render(selectedTpl.body)}</span>
            </div>
          )}

          <label style={s.label}>Nombre de la difusión (opcional)</label>
          <input style={s.input} value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Promo de julio" />

          <div style={s.previewRow}>
            <span style={s.preview}>Se enviará a <b style={{ color: 'var(--accent)' }}>{recipientCount}</b> contactos</span>
            <button onClick={send} disabled={sending} style={s.sendBtn}>
              <i className="ti ti-send" style={{ fontSize: 14 }} /> {sending ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
          {msg && <div style={{ ...s.msg, color: msg.kind === 'ok' ? '#2E8B57' : '#dc2626' }}>{msg.text}</div>}
        </div>

        {/* Plantillas */}
        <div style={s.card}>
          <div style={s.cardTitle}>Plantillas</div>
          <div style={s.hint}>Escribí el mensaje. Meta tiene que aprobarlo antes de poder enviarlo (es obligatorio para mensajes que vos iniciás).</div>

          <textarea
            style={{ ...s.input, minHeight: 80, resize: 'vertical' as const }}
            value={newBody}
            onChange={e => setNewBody(e.target.value)}
            placeholder="Ej: Hola [nombre], esta semana tenemos 20% off en color 🎨 ¿Querés que te agendemos?"
          />
          <div style={s.chipsRow}>
            <button type="button" onClick={() => setNewBody(v => (v + ' [nombre]').trim())} style={s.chip}>
              <i className="ti ti-plus" style={{ fontSize: 12 }} /> Nombre del cliente
            </button>
            <span style={s.chipHint}>Se reemplaza por el nombre de cada contacto</span>
          </div>
          {newBody.includes('[nombre]') && (
            <div style={s.previewBox}>
              <span style={s.previewLabel}>Así lo verá {sampleName}</span>
              <span style={s.previewText}>{render(newBody)}</span>
            </div>
          )}

          <label style={s.label}>Tipo de mensaje</label>
          <select value={newCategory} onChange={e => setNewCategory(e.target.value as any)} style={s.input}>
            <option value="marketing">Promoción / Marketing (ofertas, novedades)</option>
            <option value="utility">Utilidad (confirmaciones, recordatorios)</option>
          </select>

          <button onClick={createTemplate} disabled={creating} style={{ ...s.sendBtn, marginTop: 12, alignSelf: 'flex-start' }}>
            <i className="ti ti-send-2" style={{ fontSize: 14 }} /> {creating ? 'Enviando…' : 'Enviar a aprobar'}
          </button>
          {tplMsg && <div style={{ ...s.msg, color: tplMsg.kind === 'ok' ? '#2E8B57' : '#dc2626' }}>{tplMsg.text}</div>}

          {templates.length > 0 && (
            <div style={{ marginTop: 14 }}>
              {templates.map(tp => {
                const b = statusBadge(tp.status)
                return (
                  <div key={tp.id} style={s.tplRow}>
                    <span style={s.tplBody}>{tp.body.replace(/\{\{1\}\}/g, '[nombre]')}</span>
                    <span style={{ ...s.badge, color: b.color, background: b.bg }}>{b.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Historial */}
      {history.length > 0 && (
        <div style={{ ...s.card, marginTop: 14 }}>
          <div style={s.cardTitle}>Últimas difusiones</div>
          {history.map(b => (
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
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: { padding: 16, height: '100%', overflowY: 'auto' },
  header: { display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 14 },
  title: { fontSize: 13, fontWeight: 600, color: 'var(--text-1)' },
  sub: { fontSize: 12, color: 'var(--text-3)' },
  grid: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14, alignItems: 'start' },
  card: { background: 'var(--bg-card)', border: '0.5px solid var(--border-mid)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 },
  cardTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 },
  label: { fontSize: 11, color: 'var(--text-3)', marginTop: 8, textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  input: { background: 'var(--bg-input)', border: '0.5px solid var(--border-mid)', borderRadius: 8, padding: '9px 11px', color: 'var(--text-1)', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const, width: '100%' },
  hint: { fontSize: 11, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.5 },
  warn: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)', background: 'var(--accent-dim)', borderRadius: 8, padding: '9px 11px' },
  chipsRow: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  chip: { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--accent-dim)', color: 'var(--accent)', border: '0.5px solid var(--accent)', borderRadius: 20, padding: '4px 11px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  chipHint: { fontSize: 11, color: 'var(--text-3)' },
  previewBox: { display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8, padding: '9px 11px', background: 'var(--bg-input)', borderLeft: '2px solid var(--accent)', borderRadius: '0 8px 8px 0' },
  previewLabel: { fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  previewText: { fontSize: 13, color: 'var(--text-1)' },
  previewRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 10, flexWrap: 'wrap' },
  preview: { fontSize: 13, color: 'var(--text-2)' },
  sendBtn: { display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  msg: { fontSize: 12, marginTop: 10 },
  tplRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderBottom: '0.5px solid var(--border)' },
  tplBody: { fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  badge: { fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap' as const, flexShrink: 0 },
  histRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid var(--border)', gap: 10 },
  histName: { fontSize: 12, fontWeight: 500, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  histMeta: { fontSize: 11, color: 'var(--text-3)' },
  histStat: { fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' as const },
}
