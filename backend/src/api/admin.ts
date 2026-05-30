import { Router, Request, Response } from 'express';
const { createClient } = require('@supabase/supabase-js');

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
// Body: { name, email, plan, phone_whatsapp?, trial_days? }
router.post('/create-client', async (req: Request, res: Response) => {
  if (!checkAdminSecret(req, res)) return;

  const { name, email, plan = 'trial', phone_whatsapp = '', trial_days = 14 } = req.body;
  if (!name || !email) {
    res.status(400).json({ error: 'name y email son requeridos' });
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

  // 2. Calcular trial_ends_at
  const trialEndsAt = plan === 'trial'
    ? new Date(Date.now() + trial_days * 24 * 3600000).toISOString()
    : null;

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

  // 4. Enviar password reset para que el cliente ponga su contrasena
  await adminSupabase.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: 'https://automation-ai-dashboard.vercel.app' },
  });

  res.json({ ok: true, userId, businessId: biz.id, email, plan, trialEndsAt });
});

// GET /api/admin/stats — metricas globales rapidas
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
