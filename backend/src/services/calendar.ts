export {};
const { google } = require('googleapis');
const { supabase } = require('../config/supabase');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

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

  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(`${date}T23:59:59`);

  const { data } = await calendar.freebusy.query({
    requestBody: {
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      items: [{ id: calendarId }],
    },
  });

  const busy: { start: string; end: string }[] = data.calendars?.[calendarId]?.busy || [];

  // Generar slots de 1 hora entre 09:00 y 18:00
  const tz = business.schedule?.timezone || 'America/Argentina/Buenos_Aires';
  const slots: string[] = [];
  for (let hour = 9; hour < 18; hour++) {
    const slotStart = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`);
    const slotEnd = new Date(`${date}T${String(hour + 1).padStart(2, '0')}:00:00`);
    const isBusy = busy.some(b => {
      const bStart = new Date(b.start).getTime();
      const bEnd = new Date(b.end).getTime();
      return slotStart.getTime() < bEnd && slotEnd.getTime() > bStart;
    });
    if (!isBusy) {
      slots.push(slotStart.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: tz }));
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

  const [hour, minute] = params.time.split(':').map(Number);
  const start = new Date(`${params.date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);
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

module.exports = { getAuthUrl, saveTokens, getAvailableSlots, createEvent };
