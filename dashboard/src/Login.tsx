import { useState, useEffect } from 'react'
import { supabase } from './supabase'

// El registro público fue eliminado: las cuentas las crea el equipo de Wasso
// desde el panel admin. Esta pantalla es solo ingreso.

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [orbs, setOrbs] = useState<{ x: number; y: number; size: number; opacity: number; speed: number }[]>([])

  useEffect(() => {
    setOrbs(Array.from({ length: 6 }, (_, i) => ({
      x: 10 + Math.random() * 80,
      y: 10 + Math.random() * 80,
      size: 200 + Math.random() * 300,
      opacity: 0.04 + Math.random() * 0.06,
      speed: 15 + i * 8,
    })))
  }, [])

  async function handleLogin() {
    if (!email || !password) return
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : error.message)
    setLoading(false)
  }

  async function handleReset() {
    if (!email) { setError('Escribí tu email primero y volvé a tocar el enlace.'); return }
    setError(''); setSuccess(''); setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim(), {
      redirectTo: window.location.origin,
    })
    if (error) setError(error.message)
    else setSuccess('Si el email existe, te mandamos un link para restablecer la contraseña.')
    setLoading(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleLogin() }

  return (
    <div style={s.shell}>
      <div style={s.orbContainer}>
        {orbs.map((orb, i) => (
          <div key={i} style={{
            ...s.orb,
            left: `${orb.x}%`, top: `${orb.y}%`,
            width: orb.size, height: orb.size,
            opacity: orb.opacity,
            background: i % 3 === 0 ? '#1585c7' : i % 3 === 1 ? '#3aa9e5' : '#3aa9e5',
            animationDuration: `${orb.speed}s`,
          }} />
        ))}
      </div>

      <div style={s.card}>
        <div style={s.logoWrap}>
          <div style={s.logo}>W</div>
          <div style={s.logoGlow} />
        </div>
        <div style={s.brand}>Wasso</div>
        <div style={s.tagline}>Bienvenido de vuelta 👋</div>

        {/* Campos */}
        <div style={s.fields}>
          <div style={s.fieldGroup}>
            <label style={s.label}>Email</label>
            <div style={s.inputWrap}>
              <i className="ti ti-mail" style={s.inputIcon} />
              <input style={s.input} type="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={onKeyDown} autoFocus />
            </div>
          </div>
          <div style={s.fieldGroup}>
            <label style={s.label}>Contraseña</label>
            <div style={s.inputWrap}>
              <i className="ti ti-lock" style={s.inputIcon} />
              <input style={{ ...s.input, paddingRight: 40 }} type={showPwd ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={onKeyDown} />
              <button type="button" onClick={() => setShowPwd(p => !p)} style={s.eyeBtn}>
                <i className={`ti ${showPwd ? 'ti-eye' : 'ti-eye-off'}`} style={{ fontSize: 15 }} />
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div style={s.alertError}>
            <i className="ti ti-alert-circle" style={{ fontSize: 13 }} />{error}
          </div>
        )}
        {success && (
          <div style={s.alertSuccess}>
            <i className="ti ti-circle-check" style={{ fontSize: 13 }} />{success}
          </div>
        )}

        <button onClick={handleLogin} disabled={loading} style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}>
          {loading
            ? <><i className="ti ti-loader-2" style={{ fontSize: 15, animation: 'spin 1s linear infinite' }} /> Procesando...</>
            : 'Ingresar →'
          }
        </button>

        <button type="button" onClick={handleReset} disabled={loading} style={s.linkBtn}>
          ¿Olvidaste tu contraseña?
        </button>

        <div style={s.footNote}>
          ¿Todavía no tenés cuenta? Escribinos y te la damos de alta.
        </div>
      </div>

      <style>{`
        @keyframes float {
          0% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(calc(-50% + 25px), calc(-50% - 35px)) scale(1.12); }
          100% { transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  shell: { height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at 60% 40%, #0e0b1e 0%, #07070f 100%)', overflow: 'hidden', position: 'relative' },
  orbContainer: { position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' },
  orb: { position: 'absolute', borderRadius: '50%', filter: 'blur(90px)', animation: 'float ease-in-out infinite' },
  card: { position: 'relative', zIndex: 1, background: 'rgba(10,8,22,0.82)', backdropFilter: 'blur(28px)', border: '1px solid rgba(167,139,250,0.15)', borderRadius: 22, padding: '36px 32px 28px', width: 388, maxWidth: 'calc(100vw - 32px)', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 0 80px rgba(167,139,250,0.07), 0 32px 64px rgba(0,0,0,0.55)' },
  logoWrap: { position: 'relative', marginBottom: 14 },
  logo: { width: 52, height: 52, borderRadius: 15, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: '#29B6F6', boxShadow: '0 0 28px rgba(41,182,246,0.45)' },
  logoGlow: { position: 'absolute', inset: -12, borderRadius: 24, background: 'radial-gradient(circle, rgba(41,182,246,0.25) 0%, transparent 70%)', pointerEvents: 'none' },
  brand: { fontSize: 23, fontWeight: 700, background: 'linear-gradient(90deg, #3aa9e5, #93c5fd)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 4 },
  tagline: { fontSize: 13, color: '#5a5478', marginBottom: 24 },
  fields: { display: 'flex', flexDirection: 'column', gap: 12, width: '100%' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 5 },
  label: { fontSize: 11, fontWeight: 600, color: '#6a6290', letterSpacing: '.05em', textTransform: 'uppercase' as const },
  inputWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
  inputIcon: { position: 'absolute', left: 11, fontSize: 15, color: '#4a4268', pointerEvents: 'none' },
  input: { width: '100%', boxSizing: 'border-box' as const, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px 12px 10px 35px', color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit', outline: 'none', transition: 'border-color .2s' },
  eyeBtn: { position: 'absolute', right: 10, background: 'none', border: 'none', cursor: 'pointer', color: '#4a4268', padding: 0, display: 'flex', alignItems: 'center' },
  alertError: { display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.18)', borderRadius: 9, padding: '8px 12px', fontSize: 12, color: '#f87171', width: '100%', boxSizing: 'border-box' as const, marginTop: 10 },
  alertSuccess: { display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.18)', borderRadius: 9, padding: '8px 12px', fontSize: 12, color: '#4fc3f7', width: '100%', boxSizing: 'border-box' as const, marginTop: 10 },
  btn: { marginTop: 16, width: '100%', background: 'linear-gradient(135deg, #1585c7 0%, #6366f1 100%)', border: 'none', borderRadius: 11, padding: '12px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 4px 24px rgba(167,139,250,0.3)', transition: 'opacity .15s', fontFamily: 'inherit' },
  linkBtn: { marginTop: 12, background: 'none', border: 'none', color: '#3aa9e5', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0 },
  footNote: { marginTop: 14, fontSize: 11, color: '#4a4268', textAlign: 'center' as const },
}
