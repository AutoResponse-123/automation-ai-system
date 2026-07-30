// Único lugar del dashboard que define qué habilita cada plan.
// Espeja backend/src/utils.ts — si cambiás uno, cambiá el otro.
// No repitas `plan === 'pro' || ...` suelto por los componentes: usá estos helpers.

export const PLANS = ['basic', 'pro', 'premium'] as const
export type Plan = typeof PLANS[number]

// Features Pro: turnos/Google Calendar, recordatorios, Mercado Pago, difusiones.
export function hasProFeatures(plan?: string): boolean {
  return plan === 'pro' || plan === 'premium'
}

// Notas de voz (transcripción con IA): exclusivas de Premium.
export function hasAudioFeature(plan?: string): boolean {
  return plan === 'premium'
}

// Tope de conversaciones nuevas por mes. Espeja PLAN_LIMITS en
// backend/src/api/webhooks.ts — si cambiás uno, cambiá el otro.
// Ojo con la semántica: el backend cuenta TODAS las conversaciones iniciadas
// en el mes, pero solo frena a un contacto NUEVO cuando se pasa del tope. Un
// cliente que vuelve nunca queda bloqueado.
export const PLAN_LIMITS: Record<string, number> = {
  basic: 500,
  pro: 1500,
  premium: 4000,
}

export function planLimit(plan?: string): number {
  return PLAN_LIMITS[plan ?? ''] ?? PLAN_LIMITS.basic
}

// Inicio del mes en curso, igual que lo calcula el backend.
export function monthStart(): Date {
  const d = new Date()
  d.setDate(1); d.setHours(0, 0, 0, 0)
  return d
}
