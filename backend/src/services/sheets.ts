export {};
const { google } = require('googleapis');
const { supabase } = require('../config/supabase');

function getSheetsAuthUrl(businessId: string): string {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
    ],
    state: `sheets:${businessId}`,
  });
}

async function saveSheetsTokens(businessId: string, tokens: any) {
  if (!tokens.refresh_token) return; // Google no devuelve refresh_token si ya existe uno válido
  await supabase.from('businesses').update({
    sheets_refresh_token: tokens.refresh_token,
  }).eq('id', businessId);
}

async function getSheetsClient(business: any) {
  const token = business.sheets_refresh_token || business.google_refresh_token;
  if (!token) throw new Error('Google Sheets no conectado');
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  client.setCredentials({ refresh_token: token });
  return google.sheets({ version: 'v4', auth: client });
}

async function exportToSheets(business: any): Promise<string> {
  const sheets = await getSheetsClient(business);

  // ── Obtener datos de Supabase ──────────────────────────────────────────────
  const [contactsRes, appointmentsRes, conversationsRes] = await Promise.all([
    supabase.from('contacts')
      .select('phone, name, interaction_count, created_at')
      .eq('business_id', business.id)
      .order('interaction_count', { ascending: false }),
    supabase.from('appointments')
      .select('client_name, client_phone, appointment_date, appointment_time, title, created_at')
      .eq('business_id', business.id)
      .order('appointment_date', { ascending: false }),
    supabase.from('conversations')
      .select('status, created_at, updated_at, tags, contact:contacts(phone, name)')
      .eq('business_id', business.id)
      .order('updated_at', { ascending: false })
      .limit(500),
  ]);

  const contacts      = contactsRes.data      ?? [];
  const appointments  = appointmentsRes.data   ?? [];
  const conversations = conversationsRes.data  ?? [];

  // ── Crear o actualizar spreadsheet ────────────────────────────────────────
  let spreadsheetId = business.sheets_spreadsheet_id;

  if (!spreadsheetId) {
    const { data: ss } = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: `${business.name} — Napps` },
        sheets: [
          { properties: { title: 'Contactos' } },
          { properties: { title: 'Turnos' } },
          { properties: { title: 'Conversaciones' } },
        ],
      },
    });
    spreadsheetId = ss.spreadsheetId;
    await supabase.from('businesses')
      .update({ sheets_spreadsheet_id: spreadsheetId })
      .eq('id', business.id);
  }

  // ── Índices para enriquecer contactos ─────────────────────────────────────
  const appointmentsByPhone: Record<string, number> = {};
  for (const a of appointments) {
    if (a.client_phone) appointmentsByPhone[a.client_phone] = (appointmentsByPhone[a.client_phone] ?? 0) + 1;
  }

  const lastConvByPhone: Record<string, { updated_at: string; status: string }> = {};
  for (const conv of conversations) {
    const phone = conv.contact?.phone;
    if (!phone) continue;
    if (!lastConvByPhone[phone] || conv.updated_at > lastConvByPhone[phone].updated_at) {
      lastConvByPhone[phone] = { updated_at: conv.updated_at, status: conv.status };
    }
  }

  // ── Escribir datos ─────────────────────────────────────────────────────────
  const contactRows = [
    ['Teléfono', 'Nombre', 'Interacciones', 'Turnos agendados', 'Último contacto', 'Estado'],
    ...contacts.map((c: any) => {
      const conv = lastConvByPhone[c.phone];
      return [
        c.phone,
        c.name ?? '',
        c.interaction_count,
        appointmentsByPhone[c.phone] ?? 0,
        conv?.updated_at?.split('T')[0] ?? '',
        conv?.status ?? '',
      ];
    }),
  ];

  const appointmentRows = [
    ['Fecha', 'Hora', 'Servicio', 'Cliente', 'Teléfono', 'Registrado'],
    ...appointments.map((a: any) => [
      a.appointment_date, a.appointment_time?.slice(0, 5),
      a.title, a.client_name ?? '', a.client_phone ?? '',
      a.created_at?.split('T')[0],
    ]),
  ];

  const convRows = [
    ['Teléfono', 'Nombre', 'Estado', 'Etiquetas', 'Última actividad'],
    ...conversations.map((c: any) => [
      c.contact?.phone ?? '', c.contact?.name ?? '',
      c.status, (c.tags ?? []).join(', '),
      c.updated_at?.split('T')[0],
    ]),
  ];

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        { range: 'Contactos!A1', values: contactRows },
        { range: 'Turnos!A1',    values: appointmentRows },
        { range: 'Conversaciones!A1', values: convRows },
      ],
    },
  });

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}

module.exports = { getSheetsAuthUrl, saveSheetsTokens, exportToSheets };
