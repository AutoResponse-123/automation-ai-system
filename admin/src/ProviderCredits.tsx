import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

// Semáforo de saldo de las APIs (Anthropic = texto, OpenAI = audio).
//
// Lee la vista provider_balance, que ya calcula remaining_usd, days_left y level.
// La lógica de umbrales vive en la vista a propósito: si se duplicara acá, tarde o
// temprano una de las dos quedaría desactualizada respecto de la otra.

type Level = 'ok' | 'warn' | 'critical' | 'unset'

type Balance = {
  provider: 'anthropic' | 'openai'
  total_loaded: number
  total_spent: number
  remaining_usd: number
  daily_burn: number
  days_left: number | null
  level: Level
}

const LABEL: Record<string, string> = { anthropic: 'Texto', openai: 'Audio' }

const COLOR: Record<Level, string> = {
  ok: 'var(--accent)',
  warn: 'var(--warn)',
  critical: 'var(--danger)',
  unset: 'var(--text-3)',
}

const RANK: Record<Level, number> = { ok: 0, unset: 1, warn: 2, critical: 3 }

function usd(n: number): string {
  return 'US$' + Number(n ?? 0).toFixed(2)
}

export default function ProviderCredits() {
  const [rows, setRows] = useState<Balance[]>([])
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ provider: 'anthropic', amount: '' })
  const boxRef = useRef<HTMLDivElement>(null)

  async function load() {
    const { data, error } = await supabase.from('provider_balance').select('*')
    if (error) { setError(error.message); return }
    setError(null)
    setRows((data ?? []) as Balance[])
  }

  useEffect(() => {
    load()
    // Los datos los refresca un cron diario, así que no tiene sentido pollear
    // seguido. Cada 10 min alcanza para que quede fresco si dejás la pestaña abierta.
    const t = setInterval(load, 10 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  // Cerrar al hacer click afuera
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function registrarRecarga(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(form.amount.replace(',', '.'))
    if (!isFinite(amount) || amount <= 0) { setError('Poné un monto mayor a cero'); return }
    setSaving(true)
    const { error } = await supabase
      .from('provider_credits')
      .insert({ provider: form.provider, amount_usd: amount, note: 'recarga desde admin' })
    setSaving(false)
    if (error) { setError(error.message); return }
    setForm({ ...form, amount: '' })
    setError(null)
    await load()
  }

  const worst: Level = rows.reduce<Level>(
    (acc, r) => (RANK[r.level] > RANK[acc] ? r.level : acc),
    'ok'
  )
  const color = COLOR[worst]

  const resumen = rows.length
    ? rows.map(r => `${LABEL[r.provider]} ${usd(r.remaining_usd)}`).join(' · ')
    : 'Saldo —'

  const titulo =
    worst === 'critical' ? 'Saldo crítico' :
    worst === 'warn' ? 'Saldo bajo' :
    worst === 'unset' ? 'Sin saldo cargado' : null

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Saldo de APIs"
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          background: worst === 'ok' ? 'transparent' : 'var(--bg-raised)',
          border: `1px solid ${worst === 'ok' ? 'transparent' : color}`,
          borderRadius: 7, padding: '4px 9px', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 11, color: 'var(--text-2)',
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
        {titulo && <span style={{ color, fontWeight: 600 }}>{titulo}</span>}
        <span className="mono" style={{ letterSpacing: '0.02em' }}>{resumen}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 50,
          width: 300, background: 'var(--bg-panel)',
          border: '1px solid var(--border-2)', borderRadius: 10,
          boxShadow: '0 12px 32px rgba(0,0,0,0.5)', padding: 14,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            Saldo de APIs
          </div>

          {rows.map(r => (
            <div key={r.provider} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 0', borderBottom: '1px solid var(--border)',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: COLOR[r.level], flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 500 }}>
                  {LABEL[r.provider]}
                  <span style={{ color: 'var(--text-3)', fontWeight: 400 }}> · {r.provider}</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                  {r.days_left != null
                    ? `~${r.days_left} días · ${usd(r.daily_burn)}/día`
                    : 'sin datos de consumo todavía'}
                </div>
              </div>
              <div className="mono" style={{ fontSize: 13, color: COLOR[r.level], fontWeight: 600 }}>
                {usd(r.remaining_usd)}
              </div>
            </div>
          ))}

          <form onSubmit={registrarRecarga} style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 6 }}>
              Registrar recarga
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <select
                value={form.provider}
                onChange={e => setForm({ ...form, provider: e.target.value })}
                style={{
                  flex: 1, minWidth: 0, background: 'var(--bg-raised)', color: 'var(--text-1)',
                  border: '1px solid var(--border)', borderRadius: 6,
                  padding: '6px 7px', fontSize: 11, fontFamily: 'inherit',
                }}
              >
                <option value="anthropic">Texto</option>
                <option value="openai">Audio</option>
              </select>
              <input
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                placeholder="USD"
                inputMode="decimal"
                style={{
                  width: 74, background: 'var(--bg-raised)', color: 'var(--text-1)',
                  border: '1px solid var(--border)', borderRadius: 6,
                  padding: '6px 7px', fontSize: 11, fontFamily: 'inherit',
                }}
              />
              <button
                type="submit"
                disabled={saving}
                style={{
                  background: 'var(--accent)', color: '#04120c', border: 'none',
                  borderRadius: 6, padding: '6px 10px', fontSize: 11, fontWeight: 600,
                  cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? '...' : 'Sumar'}
              </button>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 7, lineHeight: 1.45 }}>
              Cargá acá cada recarga que hagas en las consolas. El saldo se calcula
              restando el gasto real que trae el cron — si no la registrás, el número
              queda viejo.
            </div>
          </form>

          {error && (
            <div style={{ fontSize: 10, color: 'var(--danger)', marginTop: 8 }}>{error}</div>
          )}
        </div>
      )}
    </div>
  )
}
