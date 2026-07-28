import { Router, Request, Response } from 'express';
import { C, FONT, shell, header, footer, detailRows } from '../services/emailTheme';
const { sendMail } = require('../services/mailer');

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
    await sendMail({
      to: process.env.CONTACT_EMAIL || 'zaza42069zaza69@gmail.com',
      replyTo: email,
      subject: `Consulta de ${safeName} — Wasso`,
      html: shell({
        title: 'Nueva consulta desde la landing',
        preheader: `${safeName}${safeBizType ? ` · ${safeBizType}` : ''} — ${safeEmail}`,
        width: 520,
        body: `
          ${header('Nueva consulta', 'Formulario de contacto de la landing')}
          <tr><td style="padding:24px 24px 0;">
            ${detailRows([
              ['Nombre', safeName],
              ['Email', `<a href="mailto:${safeEmail}" style="color:${C.accentDark};text-decoration:none;">${safeEmail}</a>`],
              ...(safeBizType ? [['Tipo de negocio', safeBizType] as [string, string]] : []),
              ['Mensaje', `<span style="font-weight:400;">${safeMessage}</span>`],
            ])}
          </td></tr>
          <tr><td style="padding:18px 24px 26px;">
            <div style="font-family:${FONT};font-size:12px;color:${C.text2};">Respondé a este email para contactar directamente a ${safeName}.</div>
          </td></tr>
          ${footer('Wasso · Formulario de contacto')}`,
      }),
    });
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[contact]', err.message);
    res.status(500).json({ error: 'No se pudo enviar el mensaje' });
  }
});

module.exports = router;
