// Bloqueos por plan, en un solo lugar y con un solo formato.
// Antes cada feature bloqueada repetía su propio JSX en Settings.tsx, así que
// era fácil que dos se vieran distinto. Usar estos componentes para cualquier
// feature nueva que dependa del plan.

type Tier = 'pro' | 'premium'

const TIER_STYLE: Record<Tier, { label: string; color: string; bg: string; border: string }> = {
  pro:     { label: 'PRO',     color: '#3aa9e5', bg: '#1585c722', border: '#1585c744' },
  premium: { label: 'PREMIUM', color: '#a78bfa', bg: '#8b5cf622', border: '#8b5cf644' },
}

// "Disponible en Pro y Premium" / "Disponible solo en Premium"
export function tierText(tier: Tier, lang: string): string {
  if (tier === 'premium') {
    return lang === 'en' ? 'Available on Premium only' : 'Disponible solo en Premium'
  }
  return lang === 'en' ? 'Available on Pro and Premium' : 'Disponible en Pro y Premium'
}

export function PlanBadge({ tier }: { tier: Tier }) {
  const t = TIER_STYLE[tier]
  return (
    <span style={{ fontSize: 10, fontWeight: 700, background: t.bg, color: t.color, border: `1px solid ${t.border}`, borderRadius: 4, padding: '2px 8px', flexShrink: 0 }}>
      {t.label}
    </span>
  )
}

// Fila bloqueada, del tamaño de una tarjeta de integración (Configuración).
export function LockedRow({ icon, iconColor, name, tier, lang, detail }: {
  icon: string
  iconColor: string
  name: string
  tier: Tier
  lang: string
  detail?: string
}) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border-mid)', borderRadius: 10, padding: '14px 16px', marginBottom: 10, opacity: 0.6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className={`ti ${icon}`} style={{ fontSize: 18, color: iconColor }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{detail || tierText(tier, lang)}</div>
        </div>
        <PlanBadge tier={tier} />
      </div>
    </div>
  )
}

// Panel bloqueado a pantalla completa, para una sección entera del menú.
export function LockedPanel({ icon, title, tier, description, currentPlan, lang }: {
  icon: string
  title: string
  tier: Tier
  description: string
  currentPlan?: string
  lang: string
}) {
  const t = TIER_STYLE[tier]
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 24 }}>
      <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border-mid)', borderRadius: 14, padding: '32px 28px', maxWidth: 460, textAlign: 'center' }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <i className={`ti ${icon}`} style={{ fontSize: 24, color: t.color }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-1)' }}>{title}</span>
          <PlanBadge tier={tier} />
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 18 }}>{description}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
          {lang === 'en' ? 'Your current plan: ' : 'Tu plan actual: '}
          <b style={{ color: 'var(--text-2)' }}>{currentPlan ?? 'basic'}</b>
          {lang === 'en' ? '. Contact us to upgrade.' : '. Escribinos para subir de plan.'}
        </div>
      </div>
    </div>
  )
}
