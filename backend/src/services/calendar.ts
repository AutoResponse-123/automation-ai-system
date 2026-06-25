export {};
const { google } = require('googleapis');
const { supabase } = require('../config/supabase');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Helpers de timezone
// Offset (ms) tal que: horaLocal = horaUTC + offset, para una TZ en un instante dado.
function tzOffsetAt(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: any = Object.fromEntries(dtf.formatToParts(date).map((x: any) => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUTC - date.getTime();
}

// Convierte una fecha+hora "de pared" (la que ve el cliente en su TZ) al instante UTC real.
// Imprescindible porque el server (Railway) corre en UTC.
function wallTimeToUtc(dateStr: string, timeStr: string, tz: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = (timeStr || '00:00').split(':').map(Number);
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi, 0);
  const offset = tzOffsetAt(new Date(utcGuess), tz);
  return new Date(utcGuess - offset);
}

// Suma n dias a una fecha "YYYY-MM-DD" y devuelve el mismo formato.
function addDaysStr(dateStr: string, n: number): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function getAuthUrl(businessId: string): string {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar'],
    state: businessId,
  });
}

async function saveTokens(businessId: string, tokens: any) {
  await supabase.from('businesses').update({
    google_refresh_token: tokens.refresh_token,
    google_calendar_id: 'primary',
  }).eq('id', businessId);
}

async function getCalendarClient(business: any) {
  if (!business.google_refresh_token) throw new Error('Calendar no conectado');
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  client.setCredentials({ refresh_token: business.google_refresh_token });
  return google.calendar({ version: 'v3', auth: client });
}

// Resuelve duracion, paso y buffer segun la config del negocio.
// Modo 'fixed' (default): todos los turnos duran lo mismo (fixed_duration, default 60),
// y el paso = esa duracion (turnos consecutivos sin huecos -> comportamiento clasico).
// Modo 'per_service': usa la duracion del servicio pedido y un paso configurable.
function resolveSlot(business: any, requestedMinutes?: number) {
  const sch = business.schedule || {};
  const mode = sch.slot_mode === 'per_service' ? 'per_service' : 'fixed';
  const fixed = Math.max(5, Number(sch.fixed_duration) || 60);
  const duration = mode === 'per_service'
    ? Math.max(5, Number(requestedMinutes) || fixed)
    : fixed;
  const step = Math.max(5, Number(sch.slot_step) || (mode === 'per_service' ? 20 : duration));
  const buffer = Math.max(0, Number(sch.buffer_minutes) || 0);
  return { mode, duration, step, buffer };
}

// Funcion PURA (sin Google API) que calcula los arranques disponibles dentro de un dia,
// empaquetando dinamicamente contra los turnos ya reservados. Trabaja en milisegundos UTC.
//
// Idea clave: en vez de una grilla fija desde la apertura, se calculan los HUECOS LIBRES
// reales = [apertura, cierre] menos (turnos ocupados + descansos), y dentro de cada hueco se
// ofrecen arranques PEGADOS al inicio del hueco (= fin del turno anterior + buffer), avanzando
// de a stepMs. Asi, tras un turno de 60min que termina 15:00, el proximo arranque ofrecido es
// 15:00 (no 15:20 de una grilla fija); y en un hueco de 40min entran dos turnos de 20 o uno de
// 40, segun la duracion del servicio pedido.
//
// - busy: turnos ocupados (del calendario). Se inflan por bufferMs a ambos lados.
// - breaks: descansos del negocio. Son limites duros (NO se inflan por buffer).
// - El turno debe ENTRAR COMPLETO en el hueco: start + durationMs <= finDelHueco.
function packFreeStarts(params: {
  dayStartMs: number;
  dayEndMs: number;
  durationMs: number;
  stepMs: number;
  bufferMs: number;
  busy: { start: number; end: number }[];
  breaks: { start: number; end: number }[];
  nowMs: number;
}): number[] {
  const { dayStartMs, dayEndMs, durationMs, bufferMs, busy, breaks, nowMs } = params;
  const stepMs = Math.max(60000, params.stepMs);
  if (durationMs <= 0 || dayEndMs <= dayStartMs) return [];

  const blocked: { start: number; end: number }[] = [
    ...busy.map(b => ({ start: b.start - bufferMs, end: b.end + bufferMs })),
    ...breaks.map(b => ({ start: b.start, end: b.end })),
  ]
    .map(b => ({ start: Math.max(b.start, dayStartMs), end: Math.min(b.end, dayEndMs) }))
    .filter(b => b.end > b.start)
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];
  for (const b of blocked) {
    const last = merged[merged.length - 1];
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
    else merged.push({ ...b });
  }

  const gaps: { start: number; end: number }[] = [];
  let cursor = dayStartMs; // anclar a limites estructurales; "now" solo filtra (abajo)
  for (const b of merged) {
    if (b.start > cursor) gaps.push({ start: cursor, end: Math.min(b.start, dayEndMs) });
    cursor = Math.max(cursor, b.end);
    if (cursor >= dayEndMs) break;
  }
  if (cursor < dayEndMs) gaps.push({ start: cursor, end: dayEndMs });

  const starts: number[] = [];
  for (const g of gaps) {
    for (let t = g.start; t + durationMs <= g.end; t += stepMs) {
      if (t <= nowMs) continue;
      starts.push(t);
    }
  }
  return starts;
}

async function getAvailableSlots(business: any, date: string, durationMinutes: number = 60): Promise<string[]> {
  const calendar = await getCalendarClient(business);
  const calendarId = business.google_calendar_id || 'primary';
  const tz = business.schedule?.timezone || 'America/Argentina/Buenos_Aires';

  // Feriados / días cerrados puntuales: ese día no se ofrece ningún horario.
  if ((business.schedule?.blocked_dates || []).includes(date)) return [];

  const weekday = new Date(`${date}T12:00:00Z`)
    .toLocaleDateString('es-AR', { timeZone: tz, weekday: 'long' })
    .toLowerCase();
  const dayCfg = business.schedule?.hours?.[weekday] || null;

  let openH = 9, openM = 0, closeH = 18, closeM = 0;
  let breaks: { start: number; end: number }[] = [];
  if (dayCfg) {
    if (dayCfg.closed) return [];
    [openH, openM] = String(dayCfg.open || '09:00').split(':').map(Number);
    [closeH, closeM] = String(dayCfg.close || '18:00').split(':').map(Number);
    breaks = (dayCfg.breaks || []).map((b: any) => ({
      start: wallTimeToUtc(date, b.start, tz).getTime(),
      end: wallTimeToUtc(date, b.end, tz).getTime(),
    }));
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const startMins = openH * 60 + openM;
  const closeMins = closeH * 60 + closeM;
  const crossesMidnight = closeMins <= startMins;

  const dayStart = wallTimeToUtc(date, `${pad(openH)}:${pad(openM)}`, tz);
  const dayEnd = crossesMidnight
    ? wallTimeToUtc(addDaysStr(date, 1), `${pad(closeH)}:${pad(closeM)}`, tz)
    : wallTimeToUtc(date, `${pad(closeH)}:${pad(closeM)}`, tz);

  const { duration, step, buffer } = resolveSlot(business, durationMinutes);
  // Semantica del cierre: si last_slot_starts_at_close, la hora de cierre es el ULTIMO
  // ARRANQUE posible (el turno termina despues). Lo logramos extendiendo el horizonte de
  // calculo por la duracion: asi "t + duration <= dayEndFit" equivale a "t <= cierre".
  // Default (false): el turno debe TERMINAR antes del cierre (comportamiento clasico).
  const lastStartAtClose = business.schedule?.last_slot_starts_at_close === true;
  const dayEndFit = lastStartAtClose ? new Date(dayEnd.getTime() + duration * 60000) : dayEnd;

  const { data } = await calendar.freebusy.query({
    requestBody: {
      timeMin: dayStart.toISOString(),
      timeMax: dayEndFit.toISOString(),
      items: [{ id: calendarId }],
    },
  });
  const busyRaw: { start: string; end: string }[] = data.calendars?.[calendarId]?.busy || [];

  const startMs = packFreeStarts({
    dayStartMs: dayStart.getTime(),
    dayEndMs: dayEndFit.getTime(),
    durationMs: duration * 60000,
    stepMs: step * 60000,
    bufferMs: buffer * 60000,
    busy: busyRaw.map(b => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() })),
    breaks,
    nowMs: Date.now(),
  });

  const slots = startMs.map(msVal =>
    new Date(msVal).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz })
  );

  console.log('[slots]', JSON.stringify({
    date, weekday, duration, step, buffer,
    scheduleEnabled: !!business.schedule?.enabled,
    dayClosed: dayCfg?.closed ?? null,
    openClose: `${pad(openH)}:${pad(openM)}-${pad(closeH)}:${pad(closeM)}`,
    busyBlocks: busyRaw.length,
    slotsFound: slots.length,
    lastStartAtClose,
  }));
  return slots;
}

async function isSlotFree(business: any, date: string, time: string, durationMinutes: number = 60): Promise<boolean> {
  const calendar = await getCalendarClient(business);
  const calendarId = business.google_calendar_id || 'primary';
  const tz = business.schedule?.timezone || 'America/Argentina/Buenos_Aires';
  // Feriados / días cerrados puntuales: no se puede reservar ese día.
  if ((business.schedule?.blocked_dates || []).includes(date)) return false;
  const start = wallTimeToUtc(date, time, tz);
  const { duration, buffer } = resolveSlot(business, durationMinutes);
  const end = new Date(start.getTime() + duration * 60000);
  const bufMs = buffer * 60000;
  const { data } = await calendar.freebusy.query({
    requestBody: {
      timeMin: new Date(start.getTime() - bufMs).toISOString(),
      timeMax: new Date(end.getTime() + bufMs).toISOString(),
      items: [{ id: calendarId }],
    },
  });
  const busy: { start: string; end: string }[] = data.calendars?.[calendarId]?.busy || [];
  return !busy.some(b => {
    const bs = new Date(b.start).getTime() - bufMs;
    const be = new Date(b.end).getTime() + bufMs;
    return start.getTime() < be && end.getTime() > bs;
  });
}

async function createEvent(business: any, params: {
  title: string;
  date: string;
  time: string;
  clientName: string;
  clientPhone: string;
  durationMinutes?: number;
}): Promise<string> {
  const calendar = await getCalendarClient(business);
  const calendarId = business.google_calendar_id || 'primary';
  const tz = business.schedule?.timezone || 'America/Argentina/Buenos_Aires';
  const { duration } = resolveSlot(business, params.durationMinutes);

  const start = wallTimeToUtc(params.date, params.time, tz);
  const end = new Date(start.getTime() + duration * 60000);

  const { data } = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: `${params.title} - ${params.clientName}`,
      description: `Cliente: ${params.clientName}\nTeléfono: ${params.clientPhone}`,
      start: { dateTime: start.toISOString(), timeZone: tz },
      end: { dateTime: end.toISOString(), timeZone: tz },
    },
  });

  return data.id;
}

async function cancelEvent(business: any, googleEventId: string): Promise<boolean> {
  if (!business?.google_refresh_token || !googleEventId) return false;
  try {
    const calendar = await getCalendarClient(business);
    const calendarId = business.google_calendar_id || 'primary';
    await calendar.events.delete({ calendarId, eventId: googleEventId });
    return true;
  } catch (err: any) {
    const code = err?.code || err?.response?.status;
    if (code === 404 || code === 410) return false;
    console.error('[cancelEvent]', err?.message || err);
    return false;
  }
}

module.exports = { getAuthUrl, saveTokens, getAvailableSlots, createEvent, isSlotFree, cancelEvent, wallTimeToUtc, resolveSlot, packFreeStarts };
