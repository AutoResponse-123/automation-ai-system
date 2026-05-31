const { Resend } = require('resend');

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

export async function sendCancellationEmail(opts: {
  to: string;
  businessName: string;
  botName: string;
  clientPhone: string;
  clientName: string;
  appointmentDate: string;
  appointmentTime: string;
  title: string;
}) {
  if (!process.env.RESEND_API_KEY) return;
  if (!opts.to) return;

  const dashboardUrl = 'https://automation-ai-dashboard.vercel.app';
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#dc2626;padding:24px 28px;">
        <h2 style="color:#fff;margin:0;font-size:18px;">❌ Turno cancelado</h2>
        <p style="color:#fecaca;margin:4px 0 0;font-size:13px;">${opts.businessName} · ${opts.botName}</p>
      </div>
      <div style="padding:24px 28px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
          <tr><td style="padding:8px 0;color:#6b7280;width:140px;">Cliente</td><td style="padding:8px 0;font-weight:600;">${opts.clientName} (${opts.clientPhone})</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Servicio</td><td style="padding:8px 0;">${opts.title}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Fecha</td><td style="padding:8px 0;">${opts.appointmentDate} a las ${opts.appointmentTime}</td></tr>
        </table>
        <p style="font-size:13px;color:#6b7280;">El cliente canceló automáticamente. El horario quedó disponible.</p>
        <a href="${dashboardUrl}" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
          Ver en el dashboard →
        </a>
      </div>
      <div style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
        Napps · Sistema automático de atención por WhatsApp
      </div>
    </div>`;

  await getResend().emails.send({
    from: 'Napps <onboarding@resend.dev>',
    to: opts.to,
    subject: `❌ Turno cancelado — ${opts.clientName} (${opts.appointmentDate})`,
    html,
  });
}

export async function sendEscalationEmail(opts: {
  to: string;
  businessName: string;
  botName: string;
  clientPhone: string;
  reason: 'keyword' | 'limit';
  keyword?: string;
}) {
  if (!process.env.RESEND_API_KEY) return;
  if (!opts.to) return;

  const subject = `🔔 ${opts.botName} necesita tu atención — ${opts.businessName}`;
  const reasonText = opts.reason === 'keyword'
    ? `El cliente mencionó una palabra clave de escalación${opts.keyword ? ` ("${opts.keyword}")` : ''}.`
    : `Se alcanzó el límite de mensajes automáticos.`;

  const dashboardUrl = 'https://automation-ai-dashboard.vercel.app';

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#7c3aed;padding:24px 28px;">
        <h2 style="color:#fff;margin:0;font-size:18px;">🔔 Conversación escalada</h2>
        <p style="color:#ddd6fe;margin:4px 0 0;font-size:13px;">${opts.businessName} · ${opts.botName}</p>
      </div>
      <div style="padding:24px 28px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
          <tr><td style="padding:8px 0;color:#6b7280;width:140px;">Motivo</td><td style="padding:8px 0;font-weight:600;">${reasonText}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Teléfono cliente</td><td style="padding:8px 0;">${opts.clientPhone}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Negocio</td><td style="padding:8px 0;">${opts.businessName}</td></tr>
        </table>
        <a href="${dashboardUrl}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
          Ver conversación en el dashboard →
        </a>
      </div>
      <div style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
        Napps · Sistema automático de atención por WhatsApp
      </div>
    </div>`;

  await getResend().emails.send({
    from: 'Napps <onboarding@resend.dev>',
    to: opts.to,
    subject,
    html,
  });
}
