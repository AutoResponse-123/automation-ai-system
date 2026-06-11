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
  const [expanded, setExpanded] = useState(true)

  if (dismissed) return null

  const steps = [
    {
      id: 'nombre',
      num: 1,
      icon: 'ti-building-store',
      label: 'Nombre y descripción',
      desc: 'Contale al bot sobre tu negocio: a qué te dedicás, qué lo hace especial.',
      done: !!(business?.name && business?.business_description),
      section: 'negocio',
    },
    {
      id: 'servicios',
      num: 2,
      icon: 'ti-list',
      label: 'Servicios y precios',
      desc: 'El bot necesita saber qué ofrecés y a qué precio para responder bien.',
      done: !!(business?.services || business?.prices),
      section: 'negocio',
    },
    {
      id: 'whatsapp',
      num: 3,
      icon: 'ti-brand-whatsapp',
      label: 'Número de WhatsApp',
      desc: 'Ingresá el número de WhatsApp conectado a Twilio.',
      done: !!(business?.phone_whatsapp),
      section: 'bot',
    },
    {
      id: 'horario',
      num: 4,
      icon: 'ti-clock',
      label: 'Horario de atención',
      desc: 'Definí cuándo atendés para que el bot informe correctamente.',
      done: !!(business?.schedule?.enabled),
      section: 'horarios',
    },
    {
      id: 'escalacion',
      num: 5,
      icon: 'ti-mail',
      label: 'Email de escalación',
      desc: 'Recibí una notificación cuando el bot no puede ayudar y deriva a un humano.',
      done: !!(business?.escalation_email),
      section: 'escalacion',
    },
    {
      id: 'test',
      num: 6,
      icon: 'ti-brand-whatsapp',
      label: 'Activá tu WhatsApp',
      desc: 'Coordinamos con vos la activación de tu número para que el bot empiece a atender a tus clientes. Te contactamos.',
      done: false, // siempre como call-to-action
      section: null,
      isAction: true,
    },
  ]

  const configurableSteps = steps.filter(s => !s.isAction)
  const doneCount = configurableSteps.filter(s => s.done).length
  const allConfigured = doneCount === configurableSteps.length
  const pct = Math.round((doneCount / configurableSteps.length) * 100)

  if (allConfigured && dismissed) return null

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0d0d1a 0%, #0a0a14 100%)',
      border: `1px solid ${allConfigured ? '#10b98140' : 'var(--accent)'}`,
      borderRadius: 14,
      marginBottom: 20,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ width: 36, height: 36, borderRadius: 9, background: allConfigured ? '#10b98118' : 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className={`ti ${allConfigured ? 'ti-circle-check' : 'ti-rocket'}`} style={{ color: allConfigured ? '#10b981' : 'var(--accent)', fontSize: 18 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: 14 }}>
            {allConfigured ? '¡Listo para empezar!' : `Configuración — ${doneCount}/${configurableSteps.length} pasos`}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
            {allConfigured ? 'Tu bot está configurado. Probalo enviando un mensaje.' : 'Completá estos pasos para que tu bot responda correctamente'}
          </div>
        </div>
        {/* Progress bar inline */}
        <div style={{ width: 80, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: allConfigured ? '#10b981' : 'var(--accent)' }}>{pct}%</span>
          <div style={{ width: '100%', height: 4, background: '#1e1e2e', borderRadius: 2 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: allConfigured ? '#10b981' : 'var(--accent)', borderRadius: 2, transition: 'width 0.4s' }} />
          </div>
        </div>
        <i className={`ti ti-chevron-${expanded ? 'up' : 'down'}`} style={{ fontSize: 14, color: 'var(--text-3)', flexShrink: 0 }} />
        <button
          onClick={e => { e.stopPropagation(); setDismissed(true); try { localStorage.setItem('onboarding_dismissed', '1') } catch {} }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 16, padding: '0 0 0 4px', lineHeight: 1, flexShrink: 0 }}
          title="Ocultar">✕</button>
      </div>

      {/* Steps */}
      {expanded && (
        <div style={{ borderTop: '1px solid #1e1e2e', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {steps.map((step, i) => (
            <div key={step.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10,
              background: step.done ? 'var(--accent-dim)' : step.isAction ? '#10b98108' : '#0d0d18',
              border: `1px solid ${step.done ? 'var(--accent)30' : step.isAction ? '#10b98130' : '#1e1e2e'}`,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: step.done ? 'var(--accent)' : step.isAction ? '#10b98130' : '#1e1e2e',
                fontSize: step.done ? 12 : 11, fontWeight: 700,
                color: step.done ? '#fff' : step.isAction ? '#10b981' : 'var(--text-3)',
              }}>
                {step.done ? <i className="ti ti-check" style={{ fontSize: 12 }} /> : step.isAction ? <i className={`ti ${step.icon}`} style={{ fontSize: 13 }} /> : step.num}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: step.done ? 'var(--text-2)' : 'var(--text-1)', textDecoration: step.done ? 'line-through' : 'none' }}>
                  {step.label}
                </div>
                {!step.done && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{step.desc}</div>}
              </div>
              {!step.done && (
                step.isAction ? (
                  <span style={{ fontSize: 11, color: '#10b981', background: '#10b98118', border: '1px solid #10b98130', borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap' }}>
                    Te contactamos
                  </span>
                ) : (
                  <button onClick={onGoToSettings} style={{ fontSize: 11, color: 'var(--accent)', background: 'var(--accent-dim)', border: '1px solid var(--accent)30', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                    Configurar →
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
