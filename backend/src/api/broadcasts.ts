import { Router, Request, Response } from 'express';
const { supabase } = require('../config/supabase');
const { sendWhatsAppTemplate } = require('../services/twilio');
const { resolveRecipients, uniqueByPhone } = require('../services/broadcast');

const router = Router();

// Verifica que el usuario (JWT de Supabase) sea dueño del negocio.
async function verifyBusinessOwner(authHeader: string | undefined, businessId: string): Promise<boolean> {
  if (!authHeader) return false;
  const token = authHeader.replace('Bearer ', '');
  const { createClient } = require('@supabase/supabase-js');
  const authClient = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_ANON_KEY || '');
  const { data: { user }, error } = await authClient.auth.getUser(token);
  if (error || !user) return false;
  const { data } = await supabase.from('businesses').select('id').eq('id', businessId).eq('user_id', user.id).maybeSingle();
  return !!data;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Reemplaza el token {name} en los valores de las variables por el nombre del contacto.
function personalize(variables: Record<string, string>, name?: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(variables || {})) {
    out[k] = String(variables[k] ?? '').replace(/\{name\}/gi, name || '');
  }
  return out;
}

// POST /api/broadcasts/send — dispara una difusión por segmento.
router.post('/send', async (req: Request, res: Response) => {
  const { businessId, name, segment, contentSid, variables } = req.body || {};

  if (!businessId || !contentSid) {
    res.status(400).json({ error: 'businessId y contentSid son requeridos' }); return;
  }
  if (!(await verifyBusinessOwner(req.headers.authorization, businessId))) {
    res.status(403).json({ error: 'No autorizado' }); return;
  }

  const { data: business } = await supabase
    .from('businesses')
    .select('id, plan, phone_whatsapp, is_active')
    .eq('id', businessId)
    .maybeSingle();

  if (!business) { res.status(404).json({ error: 'Negocio no encontrado' }); return; }
  // Difusiones = feature Pro (igual que recordatorios).
  if (!['pro', 'enterprise', 'trial'].includes(business.plan)) {
    res.status(403).json({ error: 'Las difusiones están disponibles en el plan Pro.' }); return;
  }

  // Destinatarios según segmento.
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, phone, name, stage')
    .eq('business_id', businessId);

  const recipients = uniqueByPhone(resolveRecipients(contacts || [], segment || 'all')).slice(0, 1000);

  if (recipients.length === 0) {
    res.status(400).json({ error: 'No hay contactos en ese segmento' }); return;
  }

  // Registrar la difusión y responder YA (el envío sigue en segundo plano).
  const { data: bc } = await supabase
    .from('broadcasts')
    .insert({ business_id: businessId, name: name || null, segment: segment || 'all', content_sid: contentSid, variables: variables || {}, status: 'sending', total: recipients.length })
    .select('id')
    .maybeSingle();

  const broadcastId = bc?.id;
  res.json({ ok: true, broadcastId, total: recipients.length });

  // Envío en segundo plano: secuencial con una pausa corta para respetar rate limits.
  (async () => {
    let sent = 0, failed = 0;
    for (const r of recipients) {
      try {
        await sendWhatsAppTemplate(
          r.phone,
          contentSid,
          personalize(variables || {}, r.name),
          process.env.TWILIO_ACCOUNT_SID!,
          process.env.TWILIO_AUTH_TOKEN!,
          business.phone_whatsapp
        );
        sent++;
      } catch (err: any) {
        failed++;
        console.error('[broadcast] envío falló', r.phone, err?.message || err);
      }
      if (broadcastId && (sent + failed) % 10 === 0) {
        await supabase.from('broadcasts').update({ sent, failed }).eq('id', broadcastId);
      }
      await sleep(250);
    }
    if (broadcastId) {
      await supabase.from('broadcasts').update({ sent, failed, status: 'done' }).eq('id', broadcastId);
    }
    console.log(`[broadcast] ${broadcastId} terminado: ${sent} enviados, ${failed} fallidos`);
  })().catch((e: any) => console.error('[broadcast bg]', e?.message || e));
});

// POST /api/broadcasts/menu — crea (o reemplaza) el menú de botones quick-reply
// del bot en Twilio y guarda su Content SID en el negocio. Así el dueño define los
// botones desde el panel sin tocar la consola de Twilio.
router.post('/menu', async (req: Request, res: Response) => {
  const { businessId, body, buttons } = req.body || {};

  if (!businessId || !body || !Array.isArray(buttons)) {
    res.status(400).json({ error: 'businessId, body y buttons son requeridos' }); return;
  }
  if (!(await verifyBusinessOwner(req.headers.authorization, businessId))) {
    res.status(403).json({ error: 'No autorizado' }); return;
  }

  const cleanButtons = buttons
    .map((b: any) => String(b || '').trim().slice(0, 20))
    .filter((b: string) => b.length > 0)
    .slice(0, 3); // WhatsApp permite hasta 3 botones quick-reply

  if (cleanButtons.length === 0) {
    res.status(400).json({ error: 'Agregá al menos un botón' }); return;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
  const authToken = process.env.TWILIO_AUTH_TOKEN || '';

  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const resp = await fetch('https://content.twilio.com/v1/Content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
      body: JSON.stringify({
        friendly_name: `wasso_menu_${businessId}_${Date.now()}`,
        language: 'es',
        types: {
          'twilio/quick-reply': {
            body: String(body).slice(0, 1024),
            actions: cleanButtons.map((title: string, i: number) => ({ id: `btn_${i + 1}`, title })),
          },
        },
      }),
    });

    const data: any = await resp.json();
    if (!resp.ok || !data?.sid) {
      console.error('[menu] Twilio content create falló', data);
      res.status(502).json({ error: data?.message || 'Twilio no pudo crear el menú' }); return;
    }

    await supabase.from('businesses').update({ menu_content_sid: data.sid }).eq('id', businessId);
    res.json({ ok: true, sid: data.sid });
  } catch (err: any) {
    console.error('[menu] error', err?.message || err);
    res.status(500).json({ error: 'No se pudo crear el menú' });
  }
});

module.exports = router;
