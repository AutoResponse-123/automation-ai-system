import { useState } from 'react'
import { supabase } from './supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin() {
    if (!email || !password) return
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div style={s.shell}>
      <div style={s.card}>
        <div style={s.logo}>AR</div>
        <div style={s.title}>AutoResponse</div>
        <div style={s.subtitle}>Ingresá a tu dashboard</div>

        <div style={s.fields}>
          <div style={s.field}>
            <label style={s.label}>Email</label>
            <input
              style={s.input}
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              autoFocus
            />
          </div>
          <div style={s.field}>
            <label style={s.label}>Contraseña</label>
            <div style={{ position: 'relative' }}>
              <input
                style={{ ...s.input, paddingRight: 40 }}
                type={showPwd ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
              <button
                type="button"
                onClick={() => setShowPwd(p => !p)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: showPwd ? '#a78bfa' : '#4a4a6a', padding: 0, display: 'flex', alignItems: 'center' }}
              >
                <i className={`ti ${showPwd ? 'ti-eye' : 'ti-eye-off'}`} style={{ fontSize: 16 }} />
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div style={s.error}>
            <i className="ti ti-alert-circle" style={{ fontSize: 14 }} aria-hidden="true" />
            {error === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : error}
          </div>
        )}

        <button onClick={handleLogin} disabled={loading || !email || !password} style={s.btn}>
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  shell: { height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f' },
  card: { background: '#0d0d14', border: '0.5px solid #1e1e2e', borderRadius: 16, padding: '40px 36px', width: 360, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 },
  logo: { width: 44, height: 44, borderRadius: 12, background: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: '#fff', letterSpacing: '.05em', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: 500, color: '#e2e8f0', marginBottom: 6 },
  subtitle: { fontSize: 13, color: '#4a4a6a', marginBottom: 28 },
  fields: { display: 'flex', flexDirection: 'column', gap: 14, width: '100%', marginBottom: 8 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, fontWeight: 500, color: '#8b8baa' },
  input: { background: '#111122', border: '0.5px solid #2e2e4e', borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 13, fontFamily: 'system-ui, sans-serif', outline: 'none', width: '100%', boxSizing: 'border-box' as const },
  error: { display: 'flex', alignItems: 'center', gap: 6, background: '#2e0e0e', border: '0.5px solid #f8717144', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#f87171', width: '100%', boxSizing: 'border-box' as const, marginTop: 8 },
  btn: { marginTop: 20, width: '100%', background: '#a78bfa', border: 'none', borderRadius: 8, padding: '11px', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'opacity .15s' },
}
