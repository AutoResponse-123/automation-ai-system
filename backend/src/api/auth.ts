import { Router, Request, Response } from 'express';
const { createClient } = require('@supabase/supabase-js');
const { sendWelcomeEmail } = require('../services/email');

const router = Router();

const adminSupabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// POST /api/auth/signup
router.post('/signup', async (req: Request, res: Response) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    res.status(400).json({ error: 'Nombre, email y contraseña son requeridos.' }); return;
  }
  if (name.trim().length < 2) {
    res.status(400).json({ error: 'El nombre debe tener al menos 2 caracteres.' }); return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' }); return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Email inválido.' }); return;
  }

  // Anti-multicuenta: verificar si el email ya existe
  const { data: existing } = await adminSupabase.auth.admin.listUsers();
  if (existing?.users?.some((u: any) => u.email?.toLowerCase() === email.toLowerCase())) {
    res.status(409).json({ error: 'Ya existe una cuenta con ese email.' }); return;
  }

  const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
    email: email.toLowerCase().trim(),
    password,
    email_confirm: true,
    user_metadata: { name: name.trim() },
  });

  if (authError) { res.status(400).json({ error: authError.message }); return; }

  const userId = authData.user.id;
  const trialEndsAt = new Date(Date.now() + 7 * 24 * 3600000).toISOString();

  const { error: bizError } = await adminSupabase.from('businesses').insert({
    user_id: userId,
    name: name.trim(),
    phone_whatsapp: '',
    plan: 'trial',
    trial_ends_at: trialEndsAt,
    is_active: true,
    escalation_email: email.toLowerCase().trim(),
    bot_name: 'Asistente',
    bot_emoji: '🤖',
    language: 'es',
    tone: 'amigable',
  });

  if (bizError) {
    await adminSupabase.auth.admin.deleteUser(userId);
    res.status(500).json({ error: 'Error al crear tu cuenta. Intentá de nuevo.' }); return;
  }

  // Enviar email de bienvenida con instrucciones del sandbox
  sendWelcomeEmail({ to: email.toLowerCase().trim(), businessName: name.trim() }).catch(() => {});

  res.json({ ok: true });
});

export default router;
