import { useState } from 'react'
import { supabase } from './supabase'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin() {
    if (!email || !password) return
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Email o contraseña incorrectos')
    setLoading(false)
  }

  return (
    <div className="h-screen flex items-center justify-center bg-[#0a0a0f]">
      <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-10 w-[360px] flex flex-col items-center gap-0">
        <div className="w-11 h-11 rounded-xl bg-[#7c3aed] flex items-center justify-center text-sm font-semibold text-white mb-4">AR</div>
        <div className="text-xl font-medium text-[#e2e8f0] mb-1.5">AutoResponse</div>
        <div className="text-[13px] text-[#4a4a6a] mb-7">Panel de administración</div>

        <div className="w-full flex flex-col gap-3.5 mb-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[#8b8baa]">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="admin@email.com" autoFocus
              className="bg-[#111122] border border-[#2e2e4e] rounded-lg px-3 py-2.5 text-[13px] text-[#e2e8f0] outline-none w-full" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[#8b8baa]">Contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="••••••••"
              className="bg-[#111122] border border-[#2e2e4e] rounded-lg px-3 py-2.5 text-[13px] text-[#e2e8f0] outline-none w-full" />
          </div>
        </div>

        {error && (
          <div className="w-full flex items-center gap-1.5 bg-[#2e0e0e] border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-400 mt-2">
            <i className="ti ti-alert-circle text-sm" /> {error}
          </div>
        )}

        <button onClick={handleLogin} disabled={loading || !email || !password}
          className="mt-5 w-full bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-50 border-none rounded-lg py-2.5 text-[13px] font-medium text-white cursor-pointer transition-colors">
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </div>
    </div>
  )
}
