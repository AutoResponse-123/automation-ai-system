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

// Resuelve duración, grilla y buffer según la config del negocio.
// Modo 'fixed' (default): todos los turnos duran lo mismo (fixed_duration, default 60),
// y la grilla = esa duración (turnos consecutivos sin huecos → comportamiento clásico).
// Modo 'per_service': usa la duración del servicio pedido y una grilla configurable.
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

async function getAvailableSlots(business: any, date: string, durationMinutes: number = 60): Promise<string[]> {
  const calendar = await getCalendarClient(business);
  const calendarId = business.google_calendar_id || 'primary';
  const tz = business.schedule?.timezone || 'America/Argentina/Buenos_Aires';

  const weekday = new Date(`${date}T12:00:00Z`)
    .toLocaleDateString('es-AR', { timeZone: tz, weekday: 'long' })
    .toLowerCase();
  // Los horarios configurados definen los slots SIEMPRE (independiente de "enabled",
  // que solo controla el aviso de fuera de horario). Así el bot puede atender 24hs
  // pero ofrecer turnos solo en el horario real del negocio.
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
  const endMins = crossesMidnight ? closeMins + 1440 : closeMins;

  const dayStart = wallTimeToUtc(date, `${pad(openH)}:${pad(openM)}`, tz);
  const dayEnd = crossesMidnight
    ? wallTimeToUtc(addDaysStr(date, 1), `${pad(closeH)}:${pad(closeM)}`, tz)
    : wallTimeToUtc(date, `${pad(closeH)}:${pad(closeM)}`, tz);

  const { data } = await calendar.freebusy.query({
    requestBody: {
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      items: [{ id: calendarId }],
    },
  });
  const busy: { start: string; end: string }[] = data.calendars?.[calendarId]?.busy || [];

  // Duración, grilla y buffer según la config del negocio (modo fijo o por servicio).
  const { duration, step: GRID, buffer } = resolveSlot(business, durationMinutes);
  const bufMs = buffer * 60000;
  const now = Date.now();
  const slots: string[] = [];

  // El turno debe TERMINAR antes (o justo) del cierre: m + duration <= endMins.
  // Avanzamos en pasos de GRID (no de la duración), así no quedan huecos raros.
  for (let m = startMins; m + duration <= endMins; m += GRID) {
    const dayOffset = Math.floor(m / 1440);
    const minInDay = m % 1440;
    const hh = Math.floor(minInDay / 60), mm = minInDay % 60;
    const slotDate = dayOffset === 0 ? date : addDaysStr(date, dayOffset);
    const slotStart = wallTimeToUtc(slotDate, `${pad(hh)}:${pad(mm)}`, tz);
    const slotEnd = new Date(slotStart.getTime() + duration * 60000);

    if (slotStart.getTime() <= now) continue;
    const inBreak = breaks.some(b => slotStart.getTime() < b.end && slotEnd.getTime() > b.start);
    if (inBreak) continue;
    // Solapamiento con turnos existentes, inflando cada uno por el buffer en ambos
    // lados → garantiza un hueco mínimo entre turnos.
    const isBusy = busy.some(b => {
      const bs = new Date(b.start).getTime() - bufMs;
      const be = new Date(b.end).getTime() + bufMs;
      return slotStart.getTime() < be && slotEnd.getTime() > bs;
    });
    if (!isBusy) {
      slots.push(slotStart.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }));
    }
  }
  console.log('[slots]', JSON.stringify({
    date, weekday, duration, grid: GRID, buffer,
    scheduleEnabled: !!business.schedule?.enabled,
    dayClosed: dayCfg?.closed ?? null,
    openClose: `${pad(openH)}:${pad(openM)}-${pad(closeH)}:${pad(closeM)}`,
    busyBlocks: busy.length,
    slotsFound: slots.length,
    window: `${dayStart.toISOString()} → ${dayEnd.toISOString()}`,
  }));
  return slots;
}

async function isSlotFree(business: any, date: string, time: string, durationMinutes: number = 60): Promise<boolean> {
  const calendar = await getCalendarClient(business);
  const calendarId = business.google_calendar_id || 'primary';
  const tz = business.schedule?.timezone || 'America/Argentina/Buenos_Aires';
  const start = wallTimeToUtc(date, time, tz);
  const { duration, buffer } = resolveSlot(business, durationMinutes);
  const end = new Date(start.getTime() + duration * 60000);
  const bufMs = buffer * 60000;
  // Consultamos una ventana ampliada por el buffer para no perder eventos cercanos.
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

module.exports = { getAuthUrl, saveTokens, getAvailableSlots, createEvent, isSlotFree, cancelEvent, wallTimeToUtc, resolveSlot };
