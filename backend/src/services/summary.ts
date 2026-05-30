const nodemailer = require('nodemailer');
const { supabase } = require('../config/supabase');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

export async function sendDailySummary(business: any) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;
  if (!business.escalation_email) return;

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const yesterday = new Date(today.getTime() - 24 * 3600000).toISOString();

  const [{ data: convs }, { data: msgs }, { data: appts }, { data: escalated }] = await Promise.all([
    supabase.from('conversations')
      .select('id, status')
      .eq('business_id', business.id)
      .gte('updated_at', yesterday),
    supabase.from('messages')
      .select('id, sender')
      .gte('created_at', yesterday)
      .in('conversation_id',
        (await supabase.from('conversations').select('id').eq('business_id', business.id)).data?.map((c: any) => c.id) ?? []
      ),
    supabase.from('appointments')
      .select('client_name, appointment_time, title')
      .eq('business_id', business.id)
      .eq('appointment_date', todayStr),
    supabase.from('conversations')
      .select('id')
      .eq('business_id', business.id)
      .eq('status', 'pending')
      .gte('updated_at', yesterday),
  ]);

  const totalConvs = convs?.length ?? 0;
  const totalMsgs = msgs?.filter((m: any) => m.sender === 'user').length ?? 0;
  const totalAppts = appts?.length ?? 0;
  const pendingCount = escalated?.length ?? 0;

  const apptRows = appts?.map((a: any) =>
    `<tr><td style="padding:6px 8px;border-bottom:1px solid #1e1e2e;">${a.appointment_time?.slice(0,5)}</td><td style="padding:6px 8px;border-bottom:1px solid #1e1e2e;">${a.client_name ?? '—'}</td><td style="padding:6px 8px;border-bottom:1px solid #1e1e2e;color:#a78bfa;">${a.title ?? ''}</td></tr>`
  ).join('') ?? '';

  const dashUrl = 'https://automation-ai-dashboard.vercel.app';
  const dateLabel = today.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

  const html = `
  <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0d0d14;color:#e2e8f0;border-radius:12px;overflow:hidden;border:1px solid #1e1e2e;">
    <div style="background:#7c3aed;padding:24px 28px;">
      <h2 style="color:#fff;margin:0;font-size:18px;">📊 Resumen diario — ${business.name}</h2>
      <p style="color:#ddd6fe;margin:4px 0 0;font-size:13px;">${dateLabel}</p>
    </div>
    <div style="padding:24px 28px;">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px;">
        <div style="background:#1a1a2e;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:28px;font-weight:700;color:#a78bfa;">${totalConvs}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:4px;">Conversaciones</div>
        </div>
        <div style="background:#1a1a2e;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:28px;font-weight:700;color:#a78bfa;">${totalMsgs}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:4px;">Mensajes recibidos</div>
        </div>
        <div style="background:${pendingCount > 0 ? '#2e1a1a' : '#1a1a2e'};border-radius:8px;padding:16px;text-align:center;border:${pendingCount > 0 ? '1px solid #7f1d1d' : 'none'};">
          <div style="font-size:28px;font-weight:700;color:${pendingCount > 0 ? '#ef4444' : '#a78bfa'};">${pendingCount}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:4px;">Escaladas</div>
        </div>
      </div>
      ${totalAppts > 0 ? `
      <h3 style="font-size:14px;font-weight:600;margin:0 0 12px;color:#e2e8f0;">📅 Turnos de hoy (${totalAppts})</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
        <thead><tr style="background:#1a1a2e;">
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
      AutoResponse · Podés desactivar este resumen desde Configuración → Notificaciones
    </div>
  </div>`;

  await transporter.sendMail({
    from: `"AutoResponse" <${process.env.EMAIL_USER}>`,
    to: business.escalation_email,
    subject: `📊 Resumen de hoy — ${business.name} (${totalConvs} conv, ${totalAppts} turnos)`,
    html,
  });

  console.log(`[daily-summary] enviado a ${business.escalation_email} para ${business.name}`);
}

export async function sendDailySummaries() {
  const { data: businesses } = await supabase
    .from('businesses')
    .select('*')
    .eq('daily_summary', true)
    .eq('is_active', true);

  if (!businesses?.length) return;
  for (const biz of businesses) {
    try {
      await sendDailySummary(biz);
    } catch (err: any) {
      console.error(`[daily-summary] error para ${biz.name}:`, err.message);
    }
  }
}
