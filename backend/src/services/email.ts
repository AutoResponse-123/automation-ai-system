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

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#f9f9f9;border-radius:8px;">
      <h2 style="color:#7c3aed;margin-top:0;">Conversación escalada a humano</h2>
      <p><strong>Negocio:</strong> ${opts.businessName}</p>
      <p><strong>Cliente:</strong> ${opts.clientPhone}</p>
      <p><strong>Motivo:</strong> ${reasonText}</p>
      <p style="margin-top:24px;font-size:13px;color:#666;">
        Ingresá al dashboard para responder al cliente.
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: `"AutoResponse" <${process.env.EMAIL_USER}>`,
    to: opts.to,
    subject,
    html,
  });
}
