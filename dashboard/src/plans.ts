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
