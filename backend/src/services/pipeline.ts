export {};
const { supabase } = require('../config/supabase');

// ── Embudo de clientes (estilo Kommo) ────────────────────────────────────────
// Cada contacto (fila de la tabla `contacts`) tiene una etapa `stage`. Las etapas
// avanzan SOLO hacia adelante de forma automática (un mensaje viejo nunca puede
// "pisar" una etapa más avanzada). El dueño puede mover a mano cualquier tarjeta
// desde el dashboard, incluida la etapa especial 'perdido'.

const STAGE_ORDER: string[] = ['nuevo', 'contactado', 'agendó', 'atendió', 'recurrente'];

// 'perdido' no está en el orden: es manual. Si un lead "perdido" vuelve a escribir,
// resolveStageAdvance lo devuelve a 'contactado' (perdido cuenta como índice -1).
function stageIndex(stage: string | null | undefined): number {
  if (!stage) return 0; // sin etapa = 'nuevo'
  return STAGE_ORDER.indexOf(stage); // -1 si es 'perdido' o desconocida
}

/**
 * Función pura: decide a qué etapa pasar.
 * Devuelve `target` si representa un avance respecto de `current`; si no, `null`
 * (no hay que tocar la base).
 */
function resolveStageAdvance(current: string | null | undefined, target: string): string | null {
  if (!STAGE_ORDER.includes(target)) return null; // sólo se auto-avanza a etapas del orden
  return stageIndex(target) > stageIndex(current) ? target : null;
}

/**
 * Avanza el contacto a `target` si corresponde. Seguro para fire-and-forget:
 * nunca lanza (loguea y sigue). No retrocede etapas.
 */
async function advanceStage(contactId: string | null | undefined, target: string): Promise<void> {
  if (!contactId) return;
  try {
    const { data: contact } = await supabase
      .from('contacts')
      .select('stage')
      .eq('id', contactId)
      .maybeSingle();
    const next = resolveStageAdvance(contact?.stage, target);
    if (!next) return;
    await supabase
      .from('contacts')
      .update({ stage: next, stage_updated_at: new Date().toISOString() })
      .eq('id', contactId);
  } catch (err: any) {
    console.error('[pipeline] advanceStage', err?.message || err);
  }
}

module.exports = { STAGE_ORDER, stageIndex, resolveStageAdvance, advanceStage };
