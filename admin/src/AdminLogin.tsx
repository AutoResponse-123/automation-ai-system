import { useState } from 'react'
import { supabase } from './supabase'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  async function handleLogin() {
    if (!email || !password) return
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Credenciales inválidas')
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Grid background */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
        backgroundSize: '40px 40px', opacity: 0.25
      }} />

      <div className="fade-in" style={{ position: 'relative', zIndex: 1, width: 380 }}>
        {/* Card */}
        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px 36px' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'linear-gradient(135deg, #10b981, #059669)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 700, color: '#fff', fontFamily: 'JetBrains Mono, monospace'
            }}>A</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>Napps</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Admin Console</div>
            </div>
          </div>

          <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>Bienvenido</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 28 }}>Ingresá con tu cuenta de administrador</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="admin@napps.app" autoFocus
                style={{
                  width: '100%', background: 'var(--bg-raised)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--text-1)',
                  outline: 'none', transition: 'border-color 0.15s'
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Contraseña</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  placeholder="••••••••"
                  style={{
                    width: '100%', background: 'var(--bg-raised)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '10px 36px 10px 12px', fontSize: 13, color: 'var(--text-1)',
                    outline: 'none', transition: 'border-color 0.15s', boxSizing: 'border-box'
                  }}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                />
                <button
                  type="button" onClick={() => setShowPassword(v => !v)}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)',
                    padding: 2, display: 'flex', alignItems: 'center'
                  }}
                >
                  <i className={`ti ${showPassword ? 'ti-eye-off' : 'ti-eye'}`} style={{ fontSize: 16 }} />
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div style={{
              marginTop: 14, display: 'flex', alignItems: 'center', gap: 8,
              background: '#ef444418', border: '1px solid #ef444440',
              borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#ef4444'
            }}>
              <i className="ti ti-alert-circle" style={{ fontSize: 14 }} />
              {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading || !email || !password}
            style={{
              marginTop: 24, width: '100%',
              background: loading || !email || !password ? 'var(--bg-hover)' : 'var(--accent)',
              border: 'none', borderRadius: 8, padding: '11px 0',
              fontSize: 13, fontWeight: 600,
              color: loading || !email || !password ? 'var(--text-3)' : '#fff',
              cursor: loading || !email || !password ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s', fontFamily: 'inherit'
            }}
          >
            {loading ? 'Verificando...' : 'Ingresar al panel'}
          </button>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: 'var(--text-3)' }}>
          Acceso restringido · Napps SaaS
        </div>
      </div>
    </div>
  )
}
