import { useState, useEffect } from 'react'
import { supabase } from './supabase'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

type Mode = 'login' | 'signup'

export default function Login() {
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
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

  function clearState() {
    setError(''); setSuccess('')
    setName(''); setPassword(''); setConfirmPassword(''); setAcceptedTerms(false)
  }

  function switchMode(m: Mode) {
    setMode(m); clearState(); setEmail('')
  }

  async function handleLogin() {
    if (!email || !password) return
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : error.message)
    setLoading(false)
  }

  async function handleSignup() {
    setError('')
    if (!name.trim() || !email || !password || !confirmPassword) { setError('Completá todos los campos.'); return }
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return }
    if (password !== confirmPassword) { setError('Las contraseñas no coinciden.'); return }
    if (!acceptedTerms) { setError('Tenés que aceptar los Términos y Condiciones y la Política de Privacidad.'); return }
    setLoading(true)
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.toLowerCase().trim(), password, acceptedTerms: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al crear la cuenta.')
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
        if (loginError) { setSuccess('¡Cuenta creada! Ya podés ingresar.'); setMode('login') }
      }
    } catch {
      setError('Error de conexión. Revisá tu internet.')
    }
    setLoading(false)
  }

  const handleSubmit = mode === 'login' ? handleLogin : handleSignup
  const onKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSubmit() }

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
        <div style={s.tagline}>{mode === 'login' ? 'Bienvenido de vuelta 👋' : 'Probalo gratis 7 días 🚀'}</div>

        {/* Tabs */}
        <div style={s.tabs}>
          <button style={{ ...s.tab, ...(mode === 'login' ? s.tabActive : {}) }} onClick={() => switchMode('login')}>Ingresar</button>
          <button style={{ ...s.tab, ...(mode === 'signup' ? s.tabActive : {}) }} onClick={() => switchMode('signup')}>Crear cuenta</button>
          <div style={{ ...s.tabIndicator, left: mode === 'login' ? 4 : 'calc(50%)', width: 'calc(50% - 4px)' }} />
        </div>

        {/* Campos */}
        <div style={s.fields}>
          {mode === 'signup' && (
            <div style={s.fieldGroup}>
              <label style={s.label}>Nombre del negocio</label>
              <div style={s.inputWrap}>
                <i className="ti ti-building-store" style={s.inputIcon} />
                <input style={s.input} type="text" placeholder="Mi Peluquería" value={name} onChange={e => setName(e.target.value)} onKeyDown={onKeyDown} autoFocus />
              </div>
            </div>
          )}
          <div style={s.fieldGroup}>
            <label style={s.label}>Email</label>
            <div style={s.inputWrap}>
              <i className="ti ti-mail" style={s.inputIcon} />
              <input style={s.input} type="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={onKeyDown} autoFocus={mode === 'login'} />
            </div>
          </div>
          <div style={s.fieldGroup}>
            <label style={s.label}>Contraseña</label>
            <div style={s.inputWrap}>
              <i className="ti ti-lock" style={s.inputIcon} />
              <input style={{ ...s.input, paddingRight: 40 }} type={showPwd ? 'text' : 'password'} placeholder={mode === 'signup' ? 'Mínimo 8 caracteres' : '••••••••'} value={password} onChange={e => setPassword(e.target.value)} onKeyDown={onKeyDown} />
              <button type="button" onClick={() => setShowPwd(p => !p)} style={s.eyeBtn}>
                <i className={`ti ${showPwd ? 'ti-eye' : 'ti-eye-off'}`} style={{ fontSize: 15 }} />
              </button>
            </div>
          </div>
          {mode === 'signup' && (
            <div style={s.fieldGroup}>
              <label style={s.label}>Repetir contraseña</label>
              <div style={s.inputWrap}>
                <i className="ti ti-lock-check" style={s.inputIcon} />
                <input style={s.input} type={showPwd ? 'text' : 'password'} placeholder="Repetí tu contraseña" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} onKeyDown={onKeyDown} />
              </div>
            </div>
          )}
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

        {mode === 'signup' && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: '4px 0 14px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={e => setAcceptedTerms(e.target.checked)}
              style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer', accentColor: '#1585c7', flexShrink: 0 }}
            />
            <span style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
              Acepto los <a href="https://landing-five-tau-86.vercel.app/terms.html" target="_blank" rel="noopener noreferrer" style={{ color: '#3aa9e5', textDecoration: 'underline' }}>Términos y Condiciones</a> y la <a href="https://landing-five-tau-86.vercel.app/privacy.html" target="_blank" rel="noopener noreferrer" style={{ color: '#3aa9e5', textDecoration: 'underline' }}>Política de Privacidad</a>, incluido que el número de WhatsApp es provisto por Wasso.
            </span>
          </label>
        )}

        <button onClick={handleSubmit} disabled={loading} style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}>
          {loading
            ? <><i className="ti ti-loader-2" style={{ fontSize: 15, animation: 'spin 1s linear infinite' }} /> Procesando...</>
            : mode === 'login' ? 'Ingresar →' : 'Empezar prueba gratis →'
          }
        </button>

        {mode === 'signup' && (
          <div style={s.trialBadge}>
            <i className="ti ti-shield-check" style={{ fontSize: 12, color: '#4fc3f7' }} />
            <span>Sin tarjeta · 7 días gratis · Cancelá cuando quieras</span>
          </div>
        )}
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
  tabs: { display: 'flex', width: '100%', background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 11, padding: 4, position: 'relative', marginBottom: 20 },
  tab: { flex: 1, padding: '8px 0', fontSize: 13, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', color: '#5a5478', borderRadius: 8, position: 'relative', zIndex: 1, transition: 'color .2s', fontFamily: 'inherit' },
  tabActive: { color: 'var(--text-1)' },
  tabIndicator: { position: 'absolute', top: 4, bottom: 4, background: 'rgba(167,139,250,0.14)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 8, transition: 'left .25s cubic-bezier(.4,0,.2,1)', pointerEvents: 'none' },
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
  trialBadge: { display: 'flex', alignItems: 'center', gap: 5, marginTop: 14, fontSize: 11, color: '#4a4268' },
}
