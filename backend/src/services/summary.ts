import { C, FONT, esc, shell, header, footer, button } from './emailTheme';
const { supabase } = require('../config/supabase');
const { sendMail } = require('./mailer');

async function buildSummaryData(businessId: string, sinceIso: string, todayStr: string) {
  const convIds = (
    await supabase.from('conversations').select('id').eq('business_id', businessId)
  ).data?.map((c: any) => c.id) ?? [];

  const [{ data: convs }, { data: msgs }, { data: appts }, { data: escalated }] = await Promise.all([
    supabase.from('conversations')
      .select('id, status')
      .eq('business_id', businessId)
      .gte('updated_at', sinceIso),
    convIds.length
      ? supabase.from('messages').select('id, sender').gte('created_at', sinceIso).in('conversation_id', convIds)
      : Promise.resolve({ data: [] }),
    supabase.from('appointments')
      .select('client_name, appointment_time, title, appointment_date')
      .eq('business_id', businessId)
      .gte('appointment_date', todayStr)
      .order('appointment_date').order('appointment_time'),
    supabase.from('conversations')
      .select('id')
      .eq('business_id', businessId)
      .eq('status', 'pending')
      .gte('updated_at', sinceIso),
  ]);

  return {
    totalConvs: convs?.length ?? 0,
    totalMsgs: msgs?.filter((m: any) => m.sender === 'user').length ?? 0,
    totalAppts: appts?.length ?? 0,
    pendingCount: escalated?.length ?? 0,
    appts: appts ?? [],
  };
}

// Card de métrica. Se renderiza como <td> porque Gmail, Outlook y Yahoo
// descartan display:grid / flex — por eso las tarjetas salían apiladas.
function metricCell(value: number | string, label: string, opts: { alert?: boolean } = {}) {
  const bg     = opts.alert ? C.warnBg : C.cardAlt;
  const border = opts.alert ? C.warnBorder : C.border;
  const color  = opts.alert ? C.warnText : C.accent;
  return `<td width="33.33%" valign="top" style="padding:0 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:${bg};border:1px solid ${border};border-radius:10px;">
      <tr><td align="center" style="padding:18px 8px;">
        <div style="font-family:${FONT};font-size:30px;line-height:34px;font-weight:700;color:${color};">${value}</div>
        <div style="font-family:${FONT};font-size:11px;line-height:15px;color:${C.text2};margin-top:6px;letter-spacing:.02em;">${label}</div>
      </td></tr>
    </table>
  </td>`;
}

function buildHtml(business: any, period: 'daily' | 'weekly', data: ReturnType<typeof buildSummaryData> extends Promise<infer T> ? T : never, dateLabel: string) {
  const periodLabel = period === 'weekly' ? 'Resumen semanal' : 'Resumen diario';

  const apptRows = data.appts.map((a: any, i: number) =>
    `<tr style="background:${i % 2 ? C.cardAlt : C.card};">
      <td style="padding:10px 12px;border-bottom:1px solid ${C.border};font-family:${FONT};font-size:13px;color:${C.text1};white-space:nowrap;">${esc(a.appointment_date)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${C.border};font-family:${FONT};font-size:13px;color:${C.text1};font-weight:600;white-space:nowrap;">${esc(a.appointment_time?.slice(0, 5))}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${C.border};font-family:${FONT};font-size:13px;color:${C.text1};">${esc(a.client_name) || '—'}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${C.border};font-family:${FONT};font-size:13px;color:${C.accentDark};">${esc(a.title)}</td>
    </tr>`
  ).join('');

  const preheader = `${data.totalConvs} conversaciones · ${data.totalAppts} turnos próximos${data.pendingCount > 0 ? ` · ${data.pendingCount} escaladas` : ''}`;

  return shell({
    title: `${periodLabel} — ${business.name}`,
    preheader,
    body: `
    ${header(`${periodLabel} — ${esc(business.name)}`, esc(dateLabel))}

    <tr><td style="padding:24px 24px 8px;">
      <!-- Métricas en fila real (tabla, no grid) -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 -4px;">
        <tr>
          ${metricCell(data.totalConvs, 'Conversaciones')}
          ${metricCell(data.totalMsgs, 'Mensajes recibidos')}
          ${metricCell(data.pendingCount, 'Escaladas', { alert: data.pendingCount > 0 })}
        </tr>
      </table>
    </td></tr>

    ${data.totalAppts > 0 ? `
    <tr><td style="padding:20px 24px 0;">
      <div style="font-family:${FONT};font-size:13px;font-weight:700;color:${C.text1};margin-bottom:10px;">Próximos turnos <span style="color:${C.text3};font-weight:500;">(${data.totalAppts})</span></div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="border:1px solid ${C.border};border-radius:10px;overflow:hidden;border-collapse:separate;">
        <tr style="background:${C.navy};">
          <th align="left" style="padding:9px 12px;font-family:${FONT};font-size:11px;font-weight:600;color:#8A96A3;text-transform:uppercase;letter-spacing:.05em;">Fecha</th>
          <th align="left" style="padding:9px 12px;font-family:${FONT};font-size:11px;font-weight:600;color:#8A96A3;text-transform:uppercase;letter-spacing:.05em;">Hora</th>
          <th align="left" style="padding:9px 12px;font-family:${FONT};font-size:11px;font-weight:600;color:#8A96A3;text-transform:uppercase;letter-spacing:.05em;">Cliente</th>
          <th align="left" style="padding:9px 12px;font-family:${FONT};font-size:11px;font-weight:600;color:#8A96A3;text-transform:uppercase;letter-spacing:.05em;">Servicio</th>
        </tr>
        ${apptRows}
      </table>
    </td></tr>` : `
    <tr><td style="padding:16px 24px 0;">
      <div style="font-family:${FONT};font-size:13px;color:${C.text2};background:${C.cardAlt};border:1px solid ${C.border};border-radius:10px;padding:14px 16px;">
        No hay turnos agendados para los próximos días.
      </div>
    </td></tr>`}

    <tr><td style="padding:22px 24px 26px;">
      ${button('Ver dashboard &rarr;')}
    </td></tr>

    ${footer('Wasso · Podés desactivar este resumen desde Configuración &rarr; Notificaciones')}`,
  });
}

export async function sendSummary(business: any, period: 'daily' | 'weekly') {
  if (!business.escalation_email) return;

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const msBack = period === 'weekly' ? 7 * 24 * 3600000 : 24 * 3600000;
  const sinceIso = new Date(now.getTime() - msBack).toISOString();

  const data = await buildSummaryData(business.id, sinceIso, todayStr);

  const dateLabel = period === 'weekly'
    ? `Semana del ${new Date(now.getTime() - msBack).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })} al ${now.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}`
    : now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

  const periodLabel = period === 'weekly' ? 'semana' : 'hoy';
  const subject = `Resumen de ${periodLabel} — ${business.name} (${data.totalConvs} conv, ${data.totalAppts} turnos)`;

  await sendMail({
    to: business.escalation_email,
    subject,
    html: buildHtml(business, period, data, dateLabel),
  });

  console.log(`[${period}-summary] enviado a ${business.escalation_email} para ${business.name}`);
}

export async function sendDailySummaries() {
  const { data: businesses } = await supabase
    .from('businesses')
    .select('*')
    .eq('daily_summary', true)
    .eq('summary_frequency', 'daily')
    .eq('is_active', true);

  if (!businesses?.length) return;
  for (const biz of businesses) {
    try { await sendSummary(biz, 'daily'); }
    catch (err: any) { console.error(`[daily-summary] error para ${biz.name}:`, err.message); }
  }
}

export async function sendWeeklySummaries() {
  const { data: businesses } = await supabase
    .from('businesses')
    .select('*')
    .eq('daily_summary', true)
    .eq('summary_frequency', 'weekly')
    .eq('is_active', true);

  if (!businesses?.length) return;
  for (const biz of businesses) {
    try { await sendSummary(biz, 'weekly'); }
    catch (err: any) { console.error(`[weekly-summary] error para ${biz.name}:`, err.message); }
  }
}

export const sendDailySummary = (business: any) => sendSummary(business, 'daily');
