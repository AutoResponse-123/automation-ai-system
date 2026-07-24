export {};
const nodemailer = require('nodemailer');

let gmailTransporter: any = null;
function getGmailTransporter() {
  if (!gmailTransporter) {
    gmailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
      // Timeouts cortos: muchos hosts cloud (Railway, etc.) bloquean SMTP saliente y la
      // conexión se cuelga. Con esto falla rápido y podemos caer al fallback (Resend).
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });
  }
  return gmailTransporter;
}

async function viaResend(opts: { to: string; subject: string; html: string; replyTo?: string }) {
  const { Resend } = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  // Resend NO lanza excepción ante errores de API: devuelve { error }. Lo chequeamos
  // y lo propagamos para que el que llama se entere (si no, "éxito" falso).
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM || 'Wasso <onboarding@resend.dev>',
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
  });
  if (error) throw new Error(`Resend: ${error.message || JSON.stringify(error)}`);
}

async function viaGmail(opts: { to: string; subject: string; html: string; replyTo?: string }) {
  const fromName = process.env.MAIL_FROM_NAME || 'Wasso';
  await getGmailTransporter().sendMail({
    from: `${fromName} <${process.env.GMAIL_USER}>`,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
  });
}

// Punto único de envío de emails. Preferimos Resend (HTTPS, funciona en hosts que bloquean
// SMTP saliente); si no hay Resend o falla, caemos a Gmail (SMTP). Si ambos fallan, lanzamos
// el error combinado para que el que llama lo muestre.
export async function sendMail(opts: { to: string; subject: string; html: string; replyTo?: string }) {
  if (!opts.to) return;

  const hasResend = !!process.env.RESEND_API_KEY;
  const hasGmail = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
  const errors: string[] = [];

  if (hasResend) {
    try { await viaResend(opts); return; }
    catch (e: any) { errors.push(`Resend: ${e?.message || String(e)}`); }
  }
  if (hasGmail) {
    try { await viaGmail(opts); return; }
    catch (e: any) { errors.push(`Gmail: ${e?.message || String(e)}`); }
  }

  if (errors.length) throw new Error(errors.join(' | '));
  console.warn('[mailer] Sin GMAIL_* ni RESEND_API_KEY — email no enviado:', opts.subject);
}
