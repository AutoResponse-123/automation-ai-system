const { supabase } = require('../config/supabase');
const { sendMail } = require('./mailer');

// Escapa texto que viene de clientes antes de meterlo en el HTML del email
function esc(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

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

function buildHtml(business: any, period: 'daily' | 'weekly', data: ReturnType<typeof buildSummaryData> extends Promise<infer T> ? T : never, dateLabel: string) {
  const periodLabel = period === 'weekly' ? 'Resumen semanal' : 'Resumen diario';
  const dashUrl = 'https://automation-ai-dashboard.vercel.app';

  const apptRows = data.appts.map((a: any) =>
    `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #1e1e2e;">${a.appointment_date}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #1e1e2e;">${a.appointment_time?.slice(0,5)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #1e1e2e;">${esc(a.client_name) || '—'}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #1e1e2e;color:#a78bfa;">${esc(a.title)}</td>
    </tr>`
  ).join('');

  return `
  <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0d0d14;color:#e2e8f0;border-radius:12px;overflow:hidden;border:1px solid #1e1e2e;">
    <div style="background:#7c3aed;padding:24px 28px;">
      <h2 style="color:#fff;margin:0;font-size:18px;">📊 ${periodLabel} — ${esc(business.name)}</h2>
      <p style="color:#ddd6fe;margin:4px 0 0;font-size:13px;">${dateLabel}</p>
    </div>
    <div style="padding:24px 28px;">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px;">
        <div style="background:#1a1a2e;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:28px;font-weight:700;color:#a78bfa;">${data.totalConvs}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:4px;">Conversaciones</div>
        </div>
        <div style="background:#1a1a2e;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:28px;font-weight:700;color:#a78bfa;">${data.totalMsgs}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:4px;">Mensajes recibidos</div>
        </div>
        <div style="background:${data.pendingCount > 0 ? '#2e1a1a' : '#1a1a2e'};border-radius:8px;padding:16px;text-align:center;border:${data.pendingCount > 0 ? '1px solid #7f1d1d' : 'none'};">
          <div style="font-size:28px;font-weight:700;color:${data.pendingCount > 0 ? '#ef4444' : '#a78bfa'};">${data.pendingCount}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:4px;">Escaladas</div>
        </div>
      </div>
      ${data.totalAppts > 0 ? `
      <h3 style="font-size:14px;font-weight:600;margin:0 0 12px;color:#e2e8f0;">📅 Próximos turnos (${data.totalAppts})</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
        <thead><tr style="background:#1a1a2e;">
          <th style="padding:8px;text-align:left;color:#6b7280;font-weight:500;">Fecha</th>
          <th style="padding:8px;text-align:left;color:#6b7280;font-weight:500;">Hora</th>
          <th style="padding:8px;text-align:left;color:#6b7280;font-weight:500;">Cliente</th>
          <th style="padding:8px;text-align:left;color:#6b7280;font-weight:500;">Servicio</th>
        </tr></thead>
        <tbody>${apptRows}</tbody>
      </table>` : ''}
      <a href="${dashUrl}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
        Ver dashboard →
      </a>
    </div>
    <div style="padding:14px 28px;background:#0a0a12;border-top:1px solid #1e1e2e;font-size:11px;color:#4b5563;">
      Wasso · Podés desactivar este resumen desde Configuración → Notificaciones
    </div>
  </div>`;
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
  const subject = `📊 Resumen de ${periodLabel} — ${business.name} (${data.totalConvs} conv, ${data.totalAppts} turnos)`;

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
