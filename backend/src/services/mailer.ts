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
    });
  }
  return gmailTransporter;
}

// Punto único de envío de emails.
// 1) Si hay GMAIL_USER + GMAIL_APP_PASSWORD -> manda por Gmail (no requiere dominio propio).
// 2) Si no, y hay RESEND_API_KEY -> manda por Resend.
// 3) Si no hay nada configurado, no envía (solo avisa por consola).
export async function sendMail(opts: { to: string; subject: string; html: string }) {
  if (!opts.to) return;

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  if (gmailUser && gmailPass) {
    const fromName = process.env.MAIL_FROM_NAME || 'Wasso';
    await getGmailTransporter().sendMail({
      from: `${fromName} <${gmailUser}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    return;
  }

  if (process.env.RESEND_API_KEY) {
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.RESEND_FROM || 'Wasso <onboarding@resend.dev>',
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    return;
  }

  console.warn('[mailer] Sin GMAIL_* ni RESEND_API_KEY — email no enviado:', opts.subject);
}
