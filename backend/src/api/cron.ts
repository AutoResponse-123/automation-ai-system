import { Router, Request, Response } from 'express';

const router = Router();
const { supabase } = require('../config/supabase');
const { sendDailySummaries, sendWeeklySummaries } = require('../services/summary');

function checkSecret(req: Request, res: Response): boolean {
  const secret = req.headers['x-cron-secret'];
  const valid = process.env.CRON_SECRET || process.env.ADMIN_SECRET;
  if (!secret || secret !== valid) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// El cron /expire-trials fue eliminado junto con el plan 'trial'. El período de
// prueba se controla manualmente: se asigna el plan real y, al terminar, se baja
// el plan o se desactiva el negocio desde el panel admin.

// GET /api/cron/daily-summary — llamar a las 9am
router.get('/daily-summary', async (req: Request, res: Response) => {
  if (!checkSecret(req, res)) return;
  try {
    await sendDailySummaries();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cron/weekly-summary — llamar los lunes a las 9am
router.get('/weekly-summary', async (req: Request, res: Response) => {
  if (!checkSecret(req, res)) return;
  try {
    await sendWeeklySummaries();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cron/send-reminders — disparar manualmente
router.get('/send-reminders', async (req: Request, res: Response) => {
  if (!checkSecret(req, res)) return;
  try {
    const { sendPendingReminders } = require('../services/reminders');
    await sendPendingReminders();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cron/sync-provider-spend — gasto de Anthropic/OpenAI → provider_spend_daily
// Agregar ?dry=1 para ver qué traería y la respuesta cruda, sin escribir nada.
// Agregar ?days=N (máx 31) para mirar más atrás; útil para verificar contra las
// consolas en días que sí tuvieron consumo.
router.get('/sync-provider-spend', async (req: Request, res: Response) => {
  if (!checkSecret(req, res)) return;
  try {
    const { syncProviderSpend } = require('../services/providerBalance');
    const days = parseInt(String(req.query.days || ''), 10);
    const result = await syncProviderSpend(
      req.query.dry === '1',
      isNaN(days) ? undefined : days
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cron/sync-twilio-balance — saldo real de Twilio → system_status
// ?dry=1 para consultarlo sin escribir.
router.get('/sync-twilio-balance', async (req: Request, res: Response) => {
  if (!checkSecret(req, res)) return;
  try {
    const { syncTwilioBalance } = require('../services/systemHealth');
    res.json(await syncTwilioBalance(req.query.dry === '1'));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
