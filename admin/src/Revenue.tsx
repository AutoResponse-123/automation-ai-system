import { useEffect, useState } from 'react'
import { supabase } from './supabase'

interface DayStat { date: string; messages: number; tokens: number; cost: number }

export default function Revenue() {
  const [stats, setStats] = useState<DayStat[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState(7)

  useEffect(() => { loadStats() }, [range])

  async function loadStats() {
    setLoading(true)
    const from = new Date(); from.setDate(from.getDate() - range); from.setHours(0,0,0,0)
    const { data } = await supabase.from('messages').select('sender, tokens_used, created_at').gte('created_at', from.toISOString())
    if (!data) { setLoading(false); return }

    const byDay: Record<string, { messages: number; tokens: number }> = {}
    for (let i = 0; i < range; i++) {
      const d = new Date(); d.setDate(d.getDate() - (range - 1 - i))
      byDay[d.toISOString().slice(0,10)] = { messages: 0, tokens: 0 }
    }
    data.forEach(m => {
      const key = m.created_at.slice(0,10)
      if (byDay[key]) {
        byDay[key].messages++
        byDay[key].tokens += m.tokens_used ?? 0
      }
    })

    setStats(Object.entries(byDay).map(([date, v]) => ({
      date,
      messages: v.messages,
      tokens: v.tokens,
      cost: v.tokens * 0.000003
    })))
    setLoading(false)
  }

  const totalCost = stats.reduce((s, d) => s + d.cost, 0)
  const totalTokens = stats.reduce((s, d) => s + d.tokens, 0)
  const totalMessages = stats.reduce((s, d) => s + d.messages, 0)
  const maxMessages = Math.max(...stats.map(d => d.messages), 1)

  return (
    <div className="overflow-y-auto h-full p-4">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs text-[#4a4a6a]">Período:</span>
        {[7, 14, 30].map(r => (
          <button key={r} onClick={() => setRange(r)}
            className={`px-3 py-1 rounded-md text-xs border cursor-pointer transition-colors ${range === r ? 'bg-[#1a1a2e] border-[#2e2e4e] text-[#a78bfa]' : 'bg-transparent border-[#1e1e2e] text-[#4a4a6a]'}`}>
            {r}d
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Mensajes período', value: totalMessages.toLocaleString(), color: '#a78bfa' },
          { label: 'Tokens consumidos', value: `${(totalTokens/1000).toFixed(1)}k`, color: '#f59e0b' },
          { label: 'Costo Claude API', value: `$${totalCost.toFixed(4)} USD`, color: '#f87171' },
        ].map((s, i) => (
          <div key={i} className="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-3.5">
            <div className="text-[11px] text-[#4a4a6a] mb-1">{s.label}</div>
            <div className="text-xl font-medium" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-4 mb-4">
        <div className="text-xs font-medium text-[#8b8baa] mb-4">Mensajes por día</div>
        {loading ? (
          <div className="text-center text-[#4a4a6a] text-xs py-8">Cargando...</div>
        ) : (
          <div className="flex items-end gap-1.5 h-32">
            {stats.map((d, i) => {
              const pct = Math.round((d.messages / maxMessages) * 100)
              const date = new Date(d.date + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full">
                  <div className="flex-1 w-full flex items-end">
                    <div className="w-full rounded-sm transition-all" style={{ height: `${pct}%`, background: '#7c3aed', minHeight: pct > 0 ? 4 : 0 }} />
                  </div>
                  <div className="text-[9px] text-[#4a4a6a] whitespace-nowrap">{date}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl overflow-hidden">
        <div className="text-xs font-medium text-[#8b8baa] p-3.5 border-b border-[#1e1e2e]">Detalle por día</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#1e1e2e]">
              {['Fecha','Mensajes','Tokens','Costo'].map(h => (
                <th key={h} className="text-left py-2 px-3.5 text-[11px] text-[#4a4a6a] font-medium uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.slice().reverse().map((d, i) => (
              <tr key={i} className="border-b border-[#1e1e2e] last:border-0">
                <td className="py-2 px-3.5 text-[#8b8baa]">{new Date(d.date + 'T00:00:00').toLocaleDateString('es-AR')}</td>
                <td className="py-2 px-3.5 text-[#c4c4d4]">{d.messages}</td>
                <td className="py-2 px-3.5 text-[#f59e0b]">{d.tokens.toLocaleString()}</td>
                <td className="py-2 px-3.5 text-[#f87171]">${d.cost.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
