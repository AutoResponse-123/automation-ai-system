export {};

// Última línea de defensa, en código y sin modelo de por medio.
//
// Ningún texto de instrucciones garantiza que el bot no filtre sus reglas o no
// se deje convencer por un cliente: eso está documentado como irresoluble a
// nivel del modelo. Lo que sí se puede es revisar la salida ANTES de mandarla,
// con reglas determinísticas. Si algo huele a fuga, no sale: se manda un
// mensaje neutro y se deriva a un humano.
//
// Criterio: alta precisión antes que alta cobertura. Un falso positivo deriva
// una conversación sana a un humano, que es molesto; preferimos que pase algo
// dudoso a bloquear conversaciones normales todo el tiempo.

// Nombres de funciones internas: minúsculas con guión bajo (create_appointment).
// En castellano no existen palabras así, por eso casi no da falsos positivos.
const FUNCTION_NAME = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/;

// Marcadores nuestros y jerga técnica que un cliente jamás debería ver.
const TECHNICAL_MARKERS: RegExp[] = [
  /<\/?historial_cliente>/i,
  /<\/?turnos_proximos>/i,
  /<\/?conversacion>/i,
  /CONFIDENCIALIDAD Y ROL/i,
  /REGLAS INNEGOCIABLES/i,
  /\bsystem\s*prompt\b/i,
  /\bprompt\b/i,
  /\bsystem\s*message\b/i,
  /\bmis\s+instrucciones\b/i,
  /\bmis\s+reglas\b/i,
  /\bherramienta\s+interna\b/i,
  /\bllamar?\s+a\s+la\s+herramienta\b/i,
];

// Frases de manual para secuestrar un modelo. Se aplican SOLO a lo que se
// guarda y vuelve al system prompt, no a los mensajes que salen: ahí el costo
// de un falso positivo es distinto (un cliente puede decir "seguí las
// instrucciones del shampoo" sin ninguna mala intención).
const INJECTION_PHRASES: RegExp[] = [
  /\b(ignor|olvid|descart|desestim)\w*\b[^.]{0,30}\b(instruccion|regla|indicacion|orden|anterior|previo)/i,
  /\b(ignore|disregard|forget|override)\b[^.]{0,30}\b(instruction|rule|previous|prior|above)/i,
  /\bnuevas?\s+(instruccion|regla|orden)/i,
  /\ba\s+partir\s+de\s+ahora\s+(sos|actuá|comportate|vas\s+a)/i,
  /\bfrom\s+now\s+on\s+(you|act|behave)/i,
];

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

// ¿La respuesta está repitiendo pedazos textuales del system prompt?
// Busca coincidencias de 8 palabras seguidas: suficiente para no saltar por
// una frase corriente ("en qué te puedo ayudar") y sensible a una fuga real.
export function repeatsSystemPrompt(output: string, systemPrompt: string): boolean {
  const out = normalize(output);
  if (out.length < 40) return false;
  const words = normalize(systemPrompt).split(' ');
  const WINDOW = 8;
  for (let i = 0; i + WINDOW <= words.length; i++) {
    const chunk = words.slice(i, i + WINDOW).join(' ');
    if (chunk.length >= 40 && out.includes(chunk)) return true;
  }
  return false;
}

export type GuardResult = { safe: true } | { safe: false; reason: string };

export function inspectOutgoing(output: string, systemPrompt?: string): GuardResult {
  if (!output || !output.trim()) return { safe: false, reason: 'respuesta vacía' };

  if (FUNCTION_NAME.test(output)) {
    const m = output.match(FUNCTION_NAME);
    return { safe: false, reason: `nombre de función interna en la respuesta: ${m?.[0]}` };
  }
  for (const re of TECHNICAL_MARKERS) {
    if (re.test(output)) return { safe: false, reason: `jerga técnica en la respuesta: ${re.source}` };
  }
  if (systemPrompt && repeatsSystemPrompt(output, systemPrompt)) {
    return { safe: false, reason: 'la respuesta repite texto del system prompt' };
  }
  return { safe: true };
}

// Lo que se manda cuando la respuesta no pasa el control. Neutro a propósito:
// no menciona el problema ni pide disculpas por el funcionamiento interno.
export function safeFallbackMessage(lang?: string): string {
  return lang === 'en'
    ? 'Sorry, I had trouble with that one 🙈 Someone from the team will get back to you shortly.'
    : 'Perdón, tuve un problema para responderte eso 🙈 En un rato te contesta alguien del equipo.';
}

// ── Saneado de campos que se guardan y vuelven al prompt ────────────────────
// Un valor corto, de una línea y sin caracteres de marcado no puede llevar
// instrucciones adentro. Esto es estructural: no depende de que el modelo
// colabore.
export function sanitizeField(value: any, maxLen: number): string | null {
  if (typeof value !== 'string') return null;
  const clean = value
    .replace(/[\r\n\t]+/g, ' ')      // sin saltos de línea: una instrucción necesita respirar
    .replace(/[<>{}`|]/g, '')        // sin caracteres de marcado ni delimitadores
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
  if (!clean) return null;
  if (FUNCTION_NAME.test(clean)) return null;
  for (const re of TECHNICAL_MARKERS) if (re.test(clean)) return null;
  for (const re of INJECTION_PHRASES) if (re.test(clean)) return null;
  return clean;
}
