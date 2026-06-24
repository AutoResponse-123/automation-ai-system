export {};

// ── Difusiones masivas ────────────────────────────────────────────────────────
// Filtra los contactos destinatarios de una difusión según el segmento elegido.
// Función pura (sin DB) para poder testearla.

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

// ── Personalización de plantillas ─────────────────────────────────────────────
// Tokens amigables que el dueño escribe; se mapean a {{1}}, {{2}}… en orden.
const TOKEN_KEYS = ['nombre', 'negocio', 'telefono'];

function parseTemplate(rawBody: string): { body: string; varKeys: string[] } {
  const order: string[] = [];
  const body = String(rawBody || '').replace(/\[(nombre|negocio|telefono)\]/gi, (_m, tk) => {
    const key = String(tk).toLowerCase();
    let idx = order.indexOf(key);
    if (idx === -1) { order.push(key); idx = order.length - 1; }
    return `{{${idx + 1}}}`;
  });
  return { body, varKeys: order };
}

function resolveVars(varKeys: string[], contact: any, businessName?: string): Record<string, string> {
  const out: Record<string, string> = {};
  (varKeys || []).forEach((key, i) => {
    let v = '';
    if (key === 'nombre') v = contact?.name || '';
    else if (key === 'telefono') v = contact?.phone || '';
    else if (key === 'negocio') v = businessName || '';
    out[String(i + 1)] = v;
  });
  return out;
}

module.exports = { resolveRecipients, uniqueByPhone, parseTemplate, resolveVars, TOKEN_KEYS };
