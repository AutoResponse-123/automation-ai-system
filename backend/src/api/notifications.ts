import { Router, Request, Response } from 'express';
const { supabase } = require('../config/supabase');
const { sendSummary } = require('../services/summary');

const router = Router();

// Devuelve { user, business } a partir del JWT de Supabase (login del dueño). null si inválido.
async function getUserAndBusiness(authHeader?: string): Promise<{ user: any; business: any } | null> {
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '');
  const { createClient } = require('@supabase/supabase-js');
  const authClient = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_ANON_KEY || '');
  const { data: { user }, error } = await authClient.auth.getUser(token);
  if (error || !user) return null;
  const { data: business } = await supabase.from('businesses').select('*').eq('user_id', user.id).maybeSingle();
  if (!business) return null;
  return { user, business };
}

// POST /api/notifications/test-summary — envía un resumen de prueba AL INSTANTE al email de
// notificaciones del negocio. Autenticado con el login del dueño (no usa el secreto del cron),
// así se puede probar desde el panel con un clic.
router.post('/test-summary', async (req: Request, res: Response) => {
  const auth = await getUserAndBusiness(req.headers.authorization);
  if (!auth) { res.status(403).json({ error: 'No autorizado' }); return; }
  const { user, business } = auth;

  // Destinatario: el email de escalación/notificaciones si está cargado; si no, el de la cuenta.
  const recipient = String(business.escalation_email || '').trim() || user.email;
  if (!recipient) { res.status(400).json({ error: 'No hay un email donde enviar el resumen.' }); return; }

  const period: 'daily' | 'weekly' = req.body?.period === 'weekly'
    ? 'weekly'
    : req.body?.period === 'daily'
      ? 'daily'
      : (business.summary_frequency === 'weekly' ? 'weekly' : 'daily');

  try {
    // sendSummary usa business.escalation_email como destinatario; lo forzamos al elegido
    // (copia local, no toca la base).
    await sendSummary({ ...business, escalation_email: recipient }, period);
    res.json({ ok: true, sentTo: recipient, period });
  } catch (err: any) {
    console.error('[test-summary] error', err?.message || err);
    res.status(500).json({ error: 'No se pudo enviar el resumen de prueba.' });
  }
});

module.exports = router;
