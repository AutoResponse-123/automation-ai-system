// Único lugar del panel admin que define los planes, sus precios y sus colores.
// Antes PLAN_PRICE estaba copiado en Overview.tsx y Revenue.tsx: si tocabas uno
// solo, las dos pantallas mostraban facturaciones distintas.
// Los precios son mensuales en USD.

export const PLANS = ['basic', 'pro', 'premium'] as const
export type Plan = typeof PLANS[number]

export const PLAN_PRICE: Record<string, number> = {
  basic: 19.99,
  pro: 39.99,
  premium: 89.99,
}

// Colores para las insignias de plan (variables CSS del panel).
export const PLAN_COLORS: Record<string, string> = {
  basic: 'var(--accent-2)',
  pro: 'var(--accent)',
  premium: 'var(--purple)',
}

// Misma paleta pero en hexadecimal, para los gráficos que no leen variables CSS.
export const PLAN_COLORS_HEX: Record<string, string> = {
  basic: '#3b82f6',
  pro: '#10b981',
  premium: '#8b5cf6',
}

export const DEFAULT_PLAN: Plan = 'basic'
