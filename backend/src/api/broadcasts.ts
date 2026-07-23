import { Router, Request, Response } from 'express';
const { supabase } = require('../config/supabase');
const { sendWhatsAppTemplate } = require('../services/twilio');
const { resolveRecipients, uniqueByPhone, parseTemplate, resolveVars } = require('../services/broadcast');

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

// WhatsApp/Twilio RECHAZA una plantilla si alguna variable va vacía (ej. un contacto
// sin nombre → {{1}} vacío → falla el envío). Cuando falta el dato usamos este fallback
// en vez de mandar "" y que falle. Cambiá esta palabra si querés otro saludo genérico.
const NAME_FALLBACK = 'crack';

// Última red de seguridad: garantiza que ningún valor de variable quede vacío.
function ensureNonEmpty(vars: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(vars || {})) {
    out[k] = String(vars[k] ?? '').trim() || NAME_FALLBACK;
  }
  return out;
}

// Reemplaza el token {name} en los valores de las variables por el nombre del contacto.
function personalize(variables: Record<string, string>, name?: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(variables || {})) {
    out[k] = String(variables[k] ?? '').replace(/\{name\}/gi, (name || '').trim() || NAME_FALLBACK);
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
    .select('id, name, plan, phone_whatsapp, is_active')
    .eq('id', businessId)
    .maybeSingle();

  if (!business) { res.status(404).json({ error: 'Negocio no encontrado' }); return; }
  // Difusiones = feature Pro (igual que recordatorios).
  if (!['pro', 'premium', 'enterprise', 'trial'].includes(business.plan)) {
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

  // Mapeo de variables de la plantilla (nombre/negocio/teléfono) para personalizar por contacto.
  const { data: tpl } = await supabase
    .from('broadcast_templates')
    .select('var_keys')
    .eq('business_id', businessId)
    .eq('content_sid', contentSid)
    .maybeSingle();
  const varKeys: string[] = tpl?.var_keys || [];

  // Si la plantilla usa datos del turno, cargamos el próximo turno de cada contacto.
  const usesAppt = varKeys.some((k: string) => ['fecha', 'hora', 'servicio'].includes(k));
  const apptByContact: Record<string, any> = {};
  if (usesAppt) {
    const today = new Date().toISOString().split('T')[0];
    const ids = recipients.map((r: any) => r.id).filter(Boolean);
    const { data: appts } = await supabase
      .from('appointments')
      .select('contact_id, appointment_date, appointment_time, title')
      .eq('business_id', businessId)
      .in('contact_id', ids)
      .eq('status', 'scheduled')
      .gte('appointment_date', today)
      .order('appointment_date', { ascending: true })
      .order('appointment_time', { ascending: true });
    for (const a of appts || []) {
      if (a.contact_id && !apptByContact[a.contact_id]) apptByContact[a.contact_id] = a;
    }
  }

  const fmtDate = (d: string): string => {
    try { return new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }); }
    catch { return d; }
  };
  const ctxFor = (r: any): Record<string, string> => {
    const a = apptByContact[r.id];
    return {
      nombre: (r.name || '').trim() || NAME_FALLBACK,
      negocio: business.name || 'nuestro negocio',
      telefono: r.phone || '',
      fecha: a ? fmtDate(a.appointment_date) : 'a coordinar',
      hora: a ? String(a.appointment_time).slice(0, 5) : 'a coordinar',
      servicio: a ? (a.title || 'tu servicio') : 'tu servicio',
    };
  };

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
    let lastError = '';
    for (const r of recipients) {
      try {
        const rawVars = varKeys.length
          ? resolveVars(varKeys, ctxFor(r))
          : personalize(variables || {}, r.name);
        const vars = ensureNonEmpty(rawVars);
        await sendWhatsAppTemplate(
          r.phone,
          contentSid,
          vars,
          process.env.TWILIO_ACCOUNT_SID!,
          process.env.TWILIO_AUTH_TOKEN!,
          business.phone_whatsapp
        );
        sent++;
      } catch (err: any) {
        failed++;
        // Guardamos el motivo real (código + mensaje de Twilio) para mostrarlo en el panel.
        lastError = err?.code ? `${err.code}: ${err?.message || ''}`.trim() : (err?.message || String(err));
        console.error('[broadcast] envío falló', r.phone, err?.message || err);
      }
      if (broadcastId && (sent + failed) % 10 === 0) {
        await supabase.from('broadcasts').update({ sent, failed }).eq('id', broadcastId);
      }
      await sleep(250);
    }
    if (broadcastId) {
      await supabase.from('broadcasts').update({ sent, failed, status: 'done', last_error: failed > 0 ? lastError.slice(0, 300) : null }).eq('id', broadcastId);
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

// Helpers para la API de Content de Twilio (crear plantilla + mandar a aprobar).
function twilioAuthHeader() {
  const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID || ''}:${process.env.TWILIO_AUTH_TOKEN || ''}`).toString('base64');
  return { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` };
}

// POST /api/broadcasts/templates — crea una plantilla de difusión y la manda a
// aprobar a WhatsApp/Meta. Queda 'pending' hasta que Meta la apruebe (~1 día hábil).
router.post('/templates', async (req: Request, res: Response) => {
  const { businessId, body, category, name } = req.body || {};
  if (!businessId || !body) { res.status(400).json({ error: 'businessId y body son requeridos' }); return; }
  if (!(await verifyBusinessOwner(req.headers.authorization, businessId))) {
    res.status(403).json({ error: 'No autorizado' }); return;
  }

  const cat = ['marketing', 'utility'].includes(String(category)) ? String(category) : 'marketing';
  // Nombre amigable que elige el dueño para diferenciar plantillas en el panel (opcional).
  const displayName = String(name || '').trim().slice(0, 60) || null;

  // Convertir tokens amigables ([nombre]/[negocio]/[telefono]) a {{1}}, {{2}}…
  const { body: tBody, varKeys } = parseTemplate(body);
  const SAMPLES: Record<string, string> = { nombre: 'Juan', negocio: 'Tu Negocio', telefono: '+5491100000000', fecha: 'lunes 30 de junio', hora: '14:30', servicio: 'Corte de pelo' };
  const sampleVars: Record<string, string> = {};
  varKeys.forEach((k: string, i: number) => { sampleVars[String(i + 1)] = SAMPLES[k] || 'ejemplo'; });

  try {
    // 1) Crear el contenido (texto, con las variables que correspondan).
    const createResp = await fetch('https://content.twilio.com/v1/Content', {
      method: 'POST',
      headers: twilioAuthHeader(),
      body: JSON.stringify({
        friendly_name: `wasso_dif_${businessId.slice(0, 8)}_${Date.now()}`,
        language: 'es',
        variables: sampleVars,
        types: { 'twilio/text': { body: String(tBody).slice(0, 1024) } },
      }),
    });
    const created: any = await createResp.json();
    if (!createResp.ok || !created?.sid) {
      console.error('[templates] create falló', created);
      res.status(502).json({ error: created?.message || 'Twilio no pudo crear la plantilla' }); return;
    }

    // 2) Enviarla a aprobación de WhatsApp con su categoría.
    const approvalName = `wasso_dif_${Date.now()}`;
    const apprResp = await fetch(`https://content.twilio.com/v1/Content/${created.sid}/ApprovalRequests/whatsapp`, {
      method: 'POST',
      headers: twilioAuthHeader(),
      body: JSON.stringify({ name: approvalName, category: cat.toUpperCase() }),
    });
    const appr: any = await apprResp.json().catch(() => ({}));
    if (!apprResp.ok) {
      console.error('[templates] approval falló', appr);
      res.status(502).json({ error: appr?.message || 'No se pudo enviar a aprobación' }); return;
    }

    const { data: row } = await supabase
      .from('broadcast_templates')
      .insert({ business_id: businessId, content_sid: created.sid, name: approvalName, display_name: displayName, body: tBody, var_keys: varKeys, category: cat, status: 'pending' })
      .select('id, content_sid, name, display_name, body, category, status, created_at')
      .maybeSingle();

    res.json({ ok: true, template: row });
  } catch (err: any) {
    console.error('[templates] error', err?.message || err);
    res.status(500).json({ error: 'No se pudo crear la plantilla' });
  }
});

// GET /api/broadcasts/templates?businessId=... — lista las plantillas y refresca
// el estado de aprobación de las que siguen pendientes consultando a Twilio.
router.get('/templates', async (req: Request, res: Response) => {
  const businessId = String(req.query.businessId || '');
  if (!businessId) { res.status(400).json({ error: 'businessId requerido' }); return; }
  if (!(await verifyBusinessOwner(req.headers.authorization, businessId))) {
    res.status(403).json({ error: 'No autorizado' }); return;
  }

  const { data: templates } = await supabase
    .from('broadcast_templates')
    .select('id, content_sid, name, display_name, body, var_keys, category, status, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  // Refrescar estado de las pendientes.
  for (const tpl of (templates || []).filter((t: any) => t.status === 'pending')) {
    try {
      const r = await fetch(`https://content.twilio.com/v1/Content/${tpl.content_sid}/ApprovalRequests`, { headers: twilioAuthHeader() });
      const j: any = await r.json();
      const st = j?.whatsapp?.status;
      if (st && st !== tpl.status) {
        const mapped = st === 'approved' ? 'approved' : st === 'rejected' ? 'rejected' : 'pending';
        if (mapped !== 'pending') {
          await supabase.from('broadcast_templates').update({ status: mapped }).eq('id', tpl.id);
          tpl.status = mapped;
        }
      }
    } catch { /* si falla la consulta, dejamos el estado como estaba */ }
  }

  res.json({ templates: templates || [] });
});

module.exports = router;
