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

// GET /api/cron/expire-trials
router.get('/expire-trials', async (req: Request, res: Response) => {
  if (!checkSecret(req, res)) return;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('businesses')
    .update({ is_active: false })
    .eq('plan', 'trial')
    .eq('is_active', true)
    .lt('trial_ends_at', now)
    .select('id, name, trial_ends_at');
  if (error) { res.status(500).json({ error: error.message }); return; }
  const count = data?.length ?? 0;
  console.log('Cron expire-trials: ' + count + ' businesses suspendidos');
  res.json({ suspended: count, businesses: data });
});

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

module.exports = router;
