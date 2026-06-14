export {};

// Único lugar que define el acceso a las features Pro (turnos/Calendar, recordatorios,
// Mercado Pago): Pro, Enterprise y el trial (para que prueben). Basic/starter NO.
export function hasProFeatures(plan?: string): boolean {
  return plan === 'pro' || plan === 'enterprise' || plan === 'trial';
}

export function buildSystemPrompt(business: any, contactSummary?: string): string {
  const parts: string[] = [];

  const botName = business.bot_name || 'Asistente';
  const botEmoji = business.bot_emoji || '🤖';
  const tone = business.tone || 'amigable';
  const language = business.language || 'es';

  parts.push(`Sos ${botEmoji} ${botName}, el asistente virtual de ${business.name}.`);
  parts.push(`Tu tono de comunicación es ${tone}. Respondé siempre en ${language === 'es' ? 'español' : language === 'en' ? 'inglés' : 'portugués'}.`);
  parts.push(`Respondé de manera breve y clara. Máximo 2-3 oraciones por respuesta salvo que sea necesario más detalle.`);

  if (business.welcome_message) parts.push(`\nCuando saludes a un cliente al inicio de la conversación, usá (o adaptá naturalmente) este mensaje de bienvenida: "${business.welcome_message}"`);

  const tz = business.schedule?.timezone || 'America/Argentina/Buenos_Aires';
  const nowStr = new Date().toLocaleDateString('es-AR', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  parts.push(`\nFecha y hora actual (${tz}): ${nowStr}. Usá esta fecha como referencia para interpretar palabras como "hoy", "mañana", "pasado mañana", etc.`);

  if (business.business_description) parts.push(`\nSobre el negocio: ${business.business_description}`);
  if (business.services) parts.push(`\nServicios que ofrecemos: ${business.services}`);
  if (business.prices) parts.push(`\nPrecios: ${business.prices}`);
  if (business.address) parts.push(`\nDirección: ${business.address}`);
  if (business.website) parts.push(`\nSitio web: ${business.website}`);
  if (business.instagram) parts.push(`\nInstagram: ${business.instagram}`);

  if (business.schedule?.enabled) {
    const schedule = business.schedule;
    const tz = schedule.timezone || 'America/Argentina/Buenos_Aires';
    const now = new Date().toLocaleString('es-AR', { timeZone: tz, weekday: 'long', hour: '2-digit', minute: '2-digit' });
    parts.push(`\nHorario de atención (${tz}): ${Object.entries(schedule.hours || {}).map(([day, h]: any) => {
      if (h.closed) return `${day}: cerrado`;
      let str = `${day}: ${h.open} - ${h.close}`;
      if (h.breaks?.length > 0) str += ` (descanso: ${h.breaks.map((b: any) => `${b.start}-${b.end}`).join(', ')})`;
      return str;
    }).join(', ')}`);
    parts.push(`Ahora es: ${now}`);
  }

  if (business.prompt_template) parts.push(`\nInstrucciones adicionales: ${business.prompt_template}`);
  if (business.forbidden_words?.length > 0) parts.push(`\nNUNCA uses estas palabras: ${business.forbidden_words.join(', ')}`);

  if (business.closing_phrases?.length > 0) {
    const randomClosing = business.closing_phrases[Math.floor(Math.random() * business.closing_phrases.length)];
    parts.push(`\nAl cerrar una conversación, usá esta frase: "${randomClosing}"`);
  }

  if (business.appointment_categories?.length > 0) {
    const cats = business.appointment_categories.map((c: any) => `- ${c.name} (${c.duration_minutes} min)`).join('\n');
    parts.push(`\nCategorías de servicio disponibles:\n${cats}\nUsá estas categorías y duraciones al crear turnos.`);
  }

  if (hasProFeatures(business.plan) && business.google_refresh_token) {
    parts.push(`\nTenés acceso al calendario del negocio. SIEMPRE seguí este flujo para agendar turnos:
1) Preguntá qué fecha prefiere el cliente
2) OBLIGATORIO: llamá get_available_slots para esa fecha ANTES de confirmar cualquier hora
3) Mostrá SOLO los horarios que devuelve la herramienta — no inventes ni sugieras horas
4) Si el cliente pide una hora que NO está en la lista, decile "ese horario no está disponible" y mostrá las opciones disponibles
5) Cuando el cliente elija una hora disponible, pedí su nombre y llamá create_appointment
6) NUNCA confirmes un turno sin haber llamado create_appointment primero. Si no llamaste al tool, NO digas que el turno está agendado.`);
  }

  if (hasProFeatures(business.plan) && business.mp_payment_link) {
    parts.push(`\nMedio de pago: si el cliente quiere pagar, señar o reservar con anticipo, compartile EXACTAMENTE este dato de Mercado Pago: ${business.mp_payment_link}. No inventes alias, links ni CBU distintos a ese.`);
  }

  if (contactSummary) {
    parts.push(`\nHistorial de este cliente (conversaciones anteriores):\n${contactSummary}`);
  }

  parts.push(`\nSi no sabés algo, decilo honestamente y ofrecé derivar al equipo humano.`);
  parts.push(`No inventes información sobre precios, disponibilidad o servicios que no se mencionan arriba.`);
  parts.push(`IMPORTANTE: Cuando haya un error técnico o necesites derivar a un humano, NUNCA menciones datos de contacto (Instagram, dirección, teléfono). Solo decí que vas a derivar al equipo y que alguien se va a comunicar.`);

  return parts.join('\n');
}

export function checkEscalation(message: string, keywords: string[]): boolean {
  if (!keywords?.length) return false;
  const lower = message.toLowerCase();
  return keywords.some((kw: string) => lower.includes(kw.toLowerCase()));
}

export function isOutsideHours(schedule: any): boolean {
  if (!schedule?.enabled) return false;
  try {
    const tz = schedule.timezone || 'America/Argentina/Buenos_Aires';
    const now = new Date();
    const dayName = now.toLocaleDateString('es-AR', { timeZone: tz, weekday: 'long' }).toLowerCase();
    const timeStr = now.toLocaleTimeString('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
    const dayConfig = schedule.hours?.[dayName];
    if (!dayConfig) return false;
    if (dayConfig.closed) return true;
    const [curH, curM] = timeStr.split(':').map(Number);
    const [openH, openM] = dayConfig.open.split(':').map(Number);
    const [closeH, closeM] = dayConfig.close.split(':').map(Number);
    const curMins = (curH % 24) * 60 + curM;
    const openMins = openH * 60 + openM;
    const closeMins = closeH * 60 + closeM;
    // Horario que cruza medianoche (ej. 20:00–02:00): close <= open.
    const crossesMidnight = closeMins <= openMins;
    const withinHours = crossesMidnight
      ? (curMins >= openMins || curMins <= closeMins)
      : (curMins >= openMins && curMins <= closeMins);
    if (!withinHours) return true;
    // Verificar franjas de descanso
    const breaks: Array<{ start: string; end: string }> = dayConfig.breaks ?? [];
    for (const b of breaks) {
      const [bStartH, bStartM] = b.start.split(':').map(Number);
      const [bEndH, bEndM] = b.end.split(':').map(Number);
      if (curMins >= bStartH * 60 + bStartM && curMins < bEndH * 60 + bEndM) return true;
    }
    return false;
  } catch { return false; }
}
