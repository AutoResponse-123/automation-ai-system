import { Router, Request, Response } from 'express';
const { createClient } = require('@supabase/supabase-js');
const { PLANS, isValidPlan } = require('../utils');

const router = Router();

// Cliente con service role para operaciones admin
const adminSupabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

function checkAdminSecret(req: Request, res: Response): boolean {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// POST /api/admin/create-client
// Body: { name, email, plan, phone_whatsapp?, trial_ends_at? }
// El plan es obligatorio y debe ser uno de basic/pro/premium. El período de
// prueba se maneja a mano: se asigna el plan real y, si se quiere dejar
// registrada la fecha de corte, se pasa trial_ends_at (solo informativo).
router.post('/create-client', async (req: Request, res: Response) => {
  if (!checkAdminSecret(req, res)) return;

  const { name, email, plan, phone_whatsapp = '', trial_ends_at = null } = req.body;
  if (!name || !email) {
    res.status(400).json({ error: 'name y email son requeridos' });
    return;
  }
  if (!isValidPlan(plan)) {
    res.status(400).json({ error: `plan inválido. Debe ser uno de: ${PLANS.join(', ')}` });
    return;
  }

  // 1. Crear usuario en Supabase Auth
  const tempPassword = Math.random().toString(36).slice(-10) + 'A1!';
  const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });

  if (authError) {
    res.status(400).json({ error: authError.message });
    return;
  }

  const userId = authData.user.id;

  // 2. Fecha de corte del período de prueba (opcional, solo informativa)
  const trialEndsAt = trial_ends_at ?? null;

  // 3. Crear registro en businesses
  const { data: biz, error: bizError } = await adminSupabase
    .from('businesses')
    .insert({
      user_id: userId,
      name,
      phone_whatsapp,
      plan,
      trial_ends_at: trialEndsAt,
      is_active: true,
      escalation_email: email,
      bot_name: 'Asistente',
      bot_emoji: '\u{1F916}',
    })
    .select()
    .single();

  if (bizError) {
    // Rollback: eliminar el usuario si falla el negocio
    await adminSupabase.auth.admin.deleteUser(userId);
    res.status(500).json({ error: bizError.message });
    return;
  }

  // 4. Generar link de setup para que el cliente defina su contraseña
  const { data: linkData } = await adminSupabase.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: 'https://automation-ai-dashboard.vercel.app' },
  });

  res.json({ ok: true, userId, businessId: biz.id, email, plan, trialEndsAt, setupLink: linkData?.properties?.action_link ?? null });
});

// POST /api/admin/reset-link — genera nuevo link de setup para un usuario existente
router.post('/reset-link', async (req: Request, res: Response) => {
  if (!checkAdminSecret(req, res)) return;
  const { email } = req.body;
  if (!email) { res.status(400).json({ error: 'email requerido' }); return; }
  const { data, error } = await adminSupabase.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: 'https://automation-ai-dashboard.vercel.app' },
  });
  if (error) { res.status(400).json({ error: error.message }); return; }
  res.json({ setupLink: data?.properties?.action_link ?? null });
});

// GET /api/admin/stats
router.get('/stats', async (req: Request, res: Response) => {
  if (!checkAdminSecret(req, res)) return;
  const [{ count: totalBiz }, { count: activeBiz }, { count: totalMsg }] = await Promise.all([
    adminSupabase.from('businesses').select('*', { count: 'exact', head: true }),
    adminSupabase.from('businesses').select('*', { count: 'exact', head: true }).eq('is_active', true),
    adminSupabase.from('messages').select('*', { count: 'exact', head: true }),
  ]);
  res.json({ totalBusinesses: totalBiz, activeBusinesses: activeBiz, totalMessages: totalMsg });
});

module.exports = router;
