import { Router, Request, Response } from 'express';
const { Resend } = require('resend');

const router = Router();

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// POST /api/contact — formulario de contacto desde la landing
router.post('/', async (req: Request, res: Response) => {
  const { name, email, message, business_type } = req.body;

  if (!name || !email || !message) {
    res.status(400).json({ error: 'Nombre, email y mensaje son requeridos' });
    return;
  }

  // Validación básica de email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Email inválido' });
    return;
  }

  // Sanitizar inputs para evitar HTML injection en el email
  const safeName = escapeHtml(String(name).slice(0, 100))
  const safeEmail = escapeHtml(String(email).slice(0, 200))
  const safeMessage = escapeHtml(String(message).slice(0, 2000)).replace(/\n/g, '<br>')
  const safeBizType = business_type ? escapeHtml(String(business_type).slice(0, 100)) : ''

  try {
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'Wasso <onboarding@resend.dev>',
        to: process.env.CONTACT_EMAIL || 'zaza42069zaza69@gmail.com',
        replyTo: email,
        subject: `📩 Consulta de ${safeName} — Wasso`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
            <div style="background:#7c3aed;padding:24px 28px;">
              <h2 style="color:#fff;margin:0;font-size:18px;">📩 Nueva consulta desde la landing</h2>
            </div>
            <div style="padding:24px 28px;">
              <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
                <tr><td style="padding:8px 0;color:#6b7280;width:140px;">Nombre</td><td style="padding:8px 0;font-weight:600;">${safeName}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280;">Email</td><td style="padding:8px 0;">${safeEmail}</td></tr>
                ${safeBizType ? `<tr><td style="padding:8px 0;color:#6b7280;">Tipo de negocio</td><td style="padding:8px 0;">${safeBizType}</td></tr>` : ''}
                <tr><td style="padding:8px 0;color:#6b7280;vertical-align:top;">Mensaje</td><td style="padding:8px 0;">${safeMessage}</td></tr>
              </table>
              <p style="font-size:12px;color:#9ca3af;">Respondé a este email para contactar directamente a ${safeName}.</p>
            </div>
            <div style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
              Wasso · Formulario de contacto
            </div>
          </div>`,
      });
    }
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[contact]', err.message);
    res.status(500).json({ error: 'No se pudo enviar el mensaje' });
  }
});

module.exports = router;
