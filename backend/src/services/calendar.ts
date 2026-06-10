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

async function getAvailableSlots(business: any, date: string): Promise<string[]> {
  const calendar = await getCalendarClient(business);
  const calendarId = business.google_calendar_id || 'primary';
  const tz = business.schedule?.timezone || 'America/Argentina/Buenos_Aires';

  const weekday = new Date(`${date}T12:00:00Z`)
    .toLocaleDateString('es-AR', { timeZone: tz, weekday: 'long' })
    .toLowerCase();
  const dayCfg = business.schedule?.enabled ? business.schedule?.hours?.[weekday] : null;

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

  const dayStart = wallTimeToUtc(date, `${String(openH).padStart(2, '0')}:${String(openM).padStart(2, '0')}`, tz);
  const dayEnd = wallTimeToUtc(date, `${String(closeH).padStart(2, '0')}:${String(closeM).padStart(2, '0')}`, tz);

  const { data } = await calendar.freebusy.query({
    requestBody: {
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      items: [{ id: calendarId }],
    },
  });
  const busy: { start: string; end: string }[] = data.calendars?.[calendarId]?.busy || [];

  const SLOT_MIN = 60;
  const startMins = openH * 60 + openM;
  const endMins = closeH * 60 + closeM;
  const now = Date.now();
  const slots: string[] = [];

  for (let m = startMins; m + SLOT_MIN <= endMins; m += SLOT_MIN) {
    const hh = Math.floor(m / 60), mm = m % 60;
    const slotStart = wallTimeToUtc(date, `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, tz);
    const slotEnd = new Date(slotStart.getTime() + SLOT_MIN * 60000);

    if (slotStart.getTime() <= now) continue;
    const inBreak = breaks.some(b => slotStart.getTime() < b.end && slotEnd.getTime() > b.start);
    if (inBreak) continue;
    const isBusy = busy.some(b => {
      const bs = new Date(b.start).getTime();
      const be = new Date(b.end).getTime();
      return slotStart.getTime() < be && slotEnd.getTime() > bs;
    });
    if (!isBusy) {
      slots.push(slotStart.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }));
    }
  }
  return slots;
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
  const duration = params.durationMinutes || 60;

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

module.exports = { getAuthUrl, saveTokens, getAvailableSlots, createEvent, wallTimeToUtc };
