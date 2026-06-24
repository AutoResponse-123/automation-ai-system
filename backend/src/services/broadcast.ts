export {};

// ── Difusiones masivas ────────────────────────────────────────────────────────
// Filtra los contactos destinatarios de una difusión según el segmento elegido.
// Función pura (sin DB) para poder testearla.
//
// Segmentos soportados:
//   'all'            → todos los contactos
//   'stage:<etapa>'  → contactos en una etapa del Embudo (nuevo/contactado/…)
//   'tag:<etiqueta>' → contactos cuya conversación tiene esa etiqueta (si se pasa)
//
// Cada contacto debe tener al menos { phone } y opcionalmente { stage, name }.

interface Recipient {
  id?: string;
  phone: string;
  name?: string;
  stage?: string;
}

function resolveRecipients(contacts: Recipient[], segment: string): Recipient[] {
  const list = (contacts || []).filter(c => c && c.phone);
  const seg = (segment || 'all').trim();

  if (seg === 'all' || seg === '') return list;

  if (seg.startsWith('stage:')) {
    const stage = seg.slice('stage:'.length);
    return list.filter(c => (c.stage || 'nuevo') === stage);
  }

  // Compatibilidad: si pasan la etapa pelada (sin prefijo).
  return list.filter(c => (c.stage || 'nuevo') === seg);
}

// Dedupe por teléfono (evita mandar dos veces al mismo número).
function uniqueByPhone(recipients: Recipient[]): Recipient[] {
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const r of recipients) {
    const p = (r.phone || '').trim();
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(r);
  }
  return out;
}

module.exports = { resolveRecipients, uniqueByPhone };
