export {};
import { useState } from 'react'

interface OnboardingProps {
  business: any
  onGoToSettings: () => void
}

export default function Onboarding({ business, onGoToSettings }: OnboardingProps) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('onboarding_dismissed') === '1' } catch { return false }
  })

  if (dismissed) return null

  const steps = [
    {
      id: 'nombre',
      label: 'Nombre y descripción del negocio',
      done: !!(business?.name && business?.business_description),
      hint: 'Completá el nombre y describí a qué se dedica tu negocio',
    },
    {
      id: 'whatsapp',
      label: 'Número de WhatsApp configurado',
      done: !!(business?.phone_whatsapp),
      hint: 'Ingresá el número de WhatsApp que usás con Twilio',
    },
    {
      id: 'servicios',
      label: 'Servicios y precios cargados',
      done: !!(business?.services || business?.prices),
      hint: 'Describí los servicios que ofrecés para que el bot pueda responder sobre ellos',
    },
    {
      id: 'horario',
      label: 'Horario de atención definido',
      done: !!(business?.schedule?.enabled),
      hint: 'Configurá los días y horarios en que atendés',
    },
    {
      id: 'escalacion',
      label: 'Email de escalación configurado',
      done: !!(business?.escalation_email),
      hint: 'Recibí notificaciones cuando el bot deriva una conversación a un humano',
    },
  ]

  const doneCount = steps.filter(s => s.done).length
  const allDone = doneCount === steps.length

  if (allDone) {
    try { localStorage.setItem('onboarding_dismissed', '1') } catch {}
    return null
  }

  return (
    <div style={{
      background: 'var(--bg-panel)',
      border: '1px solid var(--accent)',
      borderRadius: 12,
      padding: '16px 20px',
      marginBottom: 20,
      position: 'relative',
    }}>
      <button onClick={() => {
        setDismissed(true)
        try { localStorage.setItem('onboarding_dismissed', '1') } catch {}
      }} style={{
        position: 'absolute', top: 12, right: 14,
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--text-3)', fontSize: 16, lineHeight: 1,
      }}>✕</button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'var(--accent-dim)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <i className="ti ti-rocket" style={{ color: 'var(--accent)', fontSize: 16 }} />
        </div>
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: 14 }}>
            Configuración inicial — {doneCount}/{steps.length} pasos completados
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Completá estos pasos para que tu bot funcione correctamente
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ background: 'var(--border)', borderRadius: 4, height: 4, marginBottom: 14 }}>
        <div style={{
          width: `${(doneCount / steps.length) * 100}%`,
          background: 'var(--accent)', height: '100%', borderRadius: 4,
          transition: 'width 0.3s ease',
        }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map(step => (
          <div key={step.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', borderRadius: 8,
            background: step.done ? 'var(--accent-dim)' : '#0d0d18',
            border: `1px solid ${step.done ? 'var(--accent)' : '#2a2a3e'}`,
            opacity: step.done ? 0.8 : 1,
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: step.done ? 'var(--accent)' : 'var(--border)',
            }}>
              {step.done
                ? <i className="ti ti-check" style={{ fontSize: 11, color: '#fff' }} />
                : <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-3)' }} />
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 500,
                color: step.done ? 'var(--text-2)' : 'var(--text-1)',
                textDecoration: step.done ? 'line-through' : 'none',
              }}>{step.label}</div>
              {!step.done && (
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{step.hint}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <button onClick={onGoToSettings} style={{
        marginTop: 12, background: 'var(--accent)', color: '#fff',
        border: 'none', borderRadius: 8, padding: '8px 16px',
        fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <i className="ti ti-settings" style={{ fontSize: 14 }} />
        Ir a Configuración
      </button>
    </div>
  )
}
