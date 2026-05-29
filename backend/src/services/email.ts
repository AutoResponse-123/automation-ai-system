const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export async function sendEscalationEmail(opts: {
  to: string;
  businessName: string;
  botName: string;
  clientPhone: string;
  reason: 'keyword' | 'limit';
  keyword?: string;
}) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;
  if (!opts.to) return;

  const subject = `🔔 ${opts.botName} necesita tu atención — ${opts.businessName}`;
  const reasonText = opts.reason === 'keyword'
    ? `El cliente mencionó una palabra clave de escalación${opts.keyword ? ` ("${opts.keyword}")` : ''}.`
    : `Se alcanzó el límite de mensajes automáticos.`;

  const dashboardUrl = 'https://automation-ai-dashboard.vercel.app';

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#7c3aed;padding:24px 28px;">
        <h2 style="color:#ffffff;margin:0;font-size:18px;">🔔 Conversación escalada</h2>
        <p style="color:#ddd6fe;margin:4px 0 0;font-size:13px;">${opts.businessName} · ${opts.botName}</p>
      </div>
      <div style="padding:24px 28px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
          <tr>
            <td style="padding:8px 0;color:#6b7280;width:120px;">Cliente</td>
            <td style="padding:8px 0;color:#111827;font-weight:500;">${opts.clientPhone}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;">Motivo</td>
            <td style="padding:8px 0;color:#111827;">${reasonText}</td>
          </tr>
        </table>
        <a href="${dashboardUrl}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
          Ir al dashboard →
        </a>
      </div>
      <div style="padding:12px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:11px;color:#9ca3af;">AutoResponse SaaS · El cliente está esperando tu respuesta</p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"AutoResponse" <${process.env.EMAIL_USER}>`,
    to: opts.to,
    subject,
    html,
  });
}
