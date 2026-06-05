export {};
const express = require('express');
const { getOrCreateConversation, saveMessage, getConversationHistory, getBusinessByPhone, updateConversationStatus, updateContactSummary } = require('../services/conversation');
const { callClaude } = require('../services/claude');
const { getAuthUrl, saveTokens } = require('../services/calendar');
const { getSheetsAuthUrl, saveSheetsTokens, exportToSheets } = require('../services/sheets');
const { sendEscalationEmail } = require('../services/email');
const { supabase } = require('../config/supabase');
const { buildSystemPrompt, checkEscalation, isOutsideHours } = require('../utils');

const router = express.Router();

async function verifyBusinessOwner(authHeader: string | undefined, businessId: string): Promise<boolean> {
  if (!authHeader) return false;
  const token = authHeader.replace('Bearer ', '');
  const { createClient } = require('@supabase/supabase-js');
  const client = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_ANON_KEY || '');
  const { data: { user } } = await client.auth.getUser(token);
  if (!user) return false;
  const { data } = await client.from('businesses').select('id').eq('id', businessId).eq('user_id', user.id).single();
  return !!data;
}

router.post('/whatsapp', async (req: any, res: any) => {
  try {
    // ── Validación firma Twilio ──────────────────────────────────────────────
    const authToken = process.env.TWILIO_AUTH_TOKEN || '';
    if (!authToken) {
      console.error('[webhook] TWILIO_AUTH_TOKEN no configurado — rechazando por seguridad');
      res.status(403).send('Forbidden');
      return;
    }
    const twilio = require('twilio');
    const signature = req.headers['x-twilio-signature'] as string || '';
    const webhookUrl = process.env.WEBHOOK_URL || `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const isValid = twilio.validateRequest(authToken, signature, webhookUrl, req.body);
    if (!isValid) {
      console.warn('[webhook] Firma Twilio inválida — rechazando');
      res.status(403).send('Forbidden');
      return;
    }

    console.log('Webhook recibido:', req.body);

    const rawBody = req.body.Body || '';
    const numMedia = parseInt(req.body.NumMedia || '0', 10);
    const mediaType = req.body.MediaContentType0 || '';
    let messageBody = rawBody;

    // Si llegó media sin texto, construir un mensaje descriptivo para Claude
    if (numMedia > 0 && !rawBody) {
      if (mediaType.startsWith('audio/')) {
        messageBody = '[El usuario envió un mensaje de voz]';
      } else if (mediaType.startsWith('image/')) {
        messageBody = '[El usuario envió una imagen]';
      } else if (mediaType.startsWith('video/')) {
        messageBody = '[El usuario envió un video]';
      } else {
        messageBody = '[El usuario envió un archivo adjunto]';
      }
    }

    // Si no hay cuerpo ni media, ignorar (ej: delivery receipts)
    if (!messageBody) {
      res.status(200).send('<Response/>');
      return;
    }

    const fromPhone = req.body.From?.replace('whatsapp:', '') || '';
    const toPhone = req.body.To?.replace('whatsapp:', '') || '';

    console.log('Mensaje:', messageBody, 'De:', fromPhone, 'A:', toPhone);

    // Multi-tenant: buscar negocio por número de teléfono destino
    const business = await getBusinessByPhone(toPhone);
    if (!business) {
      console.error('No se encontró negocio para el número:', toPhone);
      res.status(404).json({ error: 'Business not found' });
      return;
    }

    console.log('Negocio encontrado:', business.name, '(', business.id, ')');

    // Verificar si el servicio está activo
    if (!business.is_active) {
      console.log('Servicio suspendido para:', business.id);
      const suspendedMsg = `Lo sentimos, el servicio está temporalmente suspendido. Por favor contactanos directamente para más información.`;
      const twiml = new (require('twilio').twiml.MessagingResponse)();
      twiml.message(suspendedMsg);
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    // Verificar trial vencido (solo para plan 'trial')
    if (business.plan === 'trial' && business.trial_ends_at) {
      const trialEnd = new Date(business.trial_ends_at);
      if (trialEnd < new Date()) {
        console.log('Trial vencido para:', business.id, '— suspendiendo');
        await supabase.from('businesses').update({ is_active: false }).eq('id', business.id);
        const trialMsg = `Tu período de prueba ha finalizado. Para continuar usando el servicio, contactanos para activar tu plan.`;
        const twiml = new (require('twilio').twiml.MessagingResponse)();
        twiml.message(trialMsg);
        res.type('text/xml');
        return res.send(twiml.toString());
      }
    }

    // ── Límite mensual de mensajes por plan ─────────────────────────────────
    const PLAN_LIMITS: Record<string, number> = { trial: 200, starter: 500, basic: 500, pro: -1, enterprise: -1 };
    const planLimit = PLAN_LIMITS[business.plan] ?? -1;
    if (planLimit > 0) {
      const monthStart = new Date();
      monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const { data: bizConvs } = await supabase.from('conversations').select('id').eq('business_id', business.id);
      const bizConvIds = (bizConvs || []).map((c: any) => c.id);
      if (bizConvIds.length > 0) {
        const { count: monthlyCount } = await supabase
          .from('messages').select('id', { count: 'exact', head: true })
          .in('conversation_id', bizConvIds)
          .eq('sender', 'user')
          .gte('created_at', monthStart.toISOString());
        if ((monthlyCount ?? 0) >= planLimit) {
          console.log(`[webhook] Límite mensual alcanzado para ${business.id}: ${monthlyCount}/${planLimit}`);
          const limitPlanMsg = `Lo sentimos, hemos alcanzado el límite de mensajes del plan este mes. Para continuar, contactanos para actualizar tu plan.`;
          const twimlLP = new (require('twilio').twiml.MessagingResponse)();
          twimlLP.message(limitPlanMsg);
          res.type('text/xml');
          return res.send(twimlLP.toString());
        }
      }
    }

    const { conversationId, contactId, contactSummary } = await getOrCreateConversation(business.id, fromPhone);
    console.log('Conversación:', conversationId);

    await saveMessage(conversationId, 'user', messageBody);

    // Verificar si está fuera de horario
    if (isOutsideHours(business.schedule)) {
      const offMsg = `Hola! En este momento estamos fuera de nuestro horario de atención. Te respondemos a la brevedad. ${business.closing_phrases?.[0] || ''}`.trim();
      await saveMessage(conversationId, 'assistant', offMsg);
      const twiml = new (require('twilio').twiml.MessagingResponse)();
      twiml.message(offMsg);
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    // Verificar palabras de escalación
    if (checkEscalation(messageBody, business.escalation_keywords)) {
      console.log('Escalación detectada');
      await updateConversationStatus(conversationId, 'pending');
      const matchedKw = business.escalation_keywords?.find((kw: string) => messageBody.toLowerCase().includes(kw.toLowerCase()));
      sendEscalationEmail({ to: business.escalation_email, businessName: business.name, botName: business.bot_name, clientPhone: fromPhone, reason: 'keyword', keyword: matchedKw }).catch(console.error);
      const escalMsg = `Entendido! Te voy a comunicar con un miembro de nuestro equipo lo antes posible. Por favor esperá unos momentos.`;
      await saveMessage(conversationId, 'assistant', escalMsg);
      const twiml = new (require('twilio').twiml.MessagingResponse)();
      twiml.message(escalMsg);
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    // Verificar límite de mensajes
    const history = await getConversationHistory(conversationId);
    const msgCount = history.filter((m: any) => m.sender === 'user').length;
    const maxMsgs = business.max_messages_before_escalation || 10;

    if (msgCount >= maxMsgs) {
      console.log('Límite de mensajes alcanzado, escalando');
      await updateConversationStatus(conversationId, 'pending');
      sendEscalationEmail({ to: business.escalation_email, businessName: business.name, botName: business.bot_name, clientPhone: fromPhone, reason: 'limit' }).catch(console.error);
      const limitMsg = `Gracias por tu paciencia! Para darte una mejor atención, voy a derivarte con uno de nuestros agentes.`;
      await saveMessage(conversationId, 'assistant', limitMsg);
      const twiml = new (require('twilio').twiml.MessagingResponse)();
      twiml.message(limitMsg);
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    // Buscar turnos próximos del contacto para contexto
    const today = new Date().toISOString().split('T')[0];
    const { data: upcomingAppts } = await supabase
      .from('appointments')
      .select('title, client_name, appointment_date, appointment_time')
      .eq('business_id', business.id)
      .eq('client_phone', fromPhone)
      .gte('appointment_date', today)
      .order('appointment_date').order('appointment_time')
      .limit(3);

    // Construir prompt dinámico y llamar a Claude
    let systemPrompt = buildSystemPrompt(business, contactSummary || undefined);
    if (upcomingAppts && upcomingAppts.length > 0) {
      const apptLines = upcomingAppts.map((a: any) =>
        `- ${a.title || 'Turno'} el ${a.appointment_date} a las ${String(a.appointment_time).slice(0,5)}`
      ).join('\n');
      systemPrompt += `\n\nTurnos próximos de este cliente:\n${apptLines}`;
    }
    const messages = history.map((msg: any) => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.content,
    }));

    console.log('Llamando a Claude...');
    const { text: assistantMessage, tokens } = await callClaude(messages, systemPrompt, business.max_tokens || 600, business, fromPhone);
    console.log('Respuesta Claude:', assistantMessage, `(${tokens} tokens)`);

    await saveMessage(conversationId, 'assistant', assistantMessage, tokens);
    console.log('Respuesta guardada');

    // Actualizar summary del contacto cada 10 mensajes de usuario (async, no bloquea)
    const userMsgCount = history.filter((m: any) => m.sender === 'user').length + 1; // +1 por el mensaje actual
    if (userMsgCount % 10 === 0 && contactId) {
      updateContactSummary(contactId, conversationId, business).catch((e: any) =>
        console.error('[summary async]', e.message)
      );
    }

    const twiml = new (require('twilio').twiml.MessagingResponse)();
    twiml.message(assistantMessage);
    res.type('text/xml');
    res.send(twiml.toString());

  } catch (error) {
    console.error('Error en webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Google Calendar OAuth ────────────────────────────────────────────────────

// ── Resumen IA de conversación ──────────────────────────────────────────────
router.post('/conversations/:id/summary', async (req: any, res: any) => {
  const { id: conversationId } = req.params;
  const { supabase } = require('../config/supabase');

  try {
    // Traer mensajes de la conversación (máx 60)
    const { data: messages } = await supabase
      .from('messages')
      .select('sender, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(60);

    if (!messages || messages.length === 0) {
      return res.json({ summary: 'Esta conversación no tiene mensajes todavía.' });
    }

    // Traer info del negocio
    const { data: conv } = await supabase
      .from('conversations')
      .select('business_id, contacts(name, phone)')
      .eq('id', conversationId)
      .single();

    const contact = (conv as any)?.contacts;
    const clientLabel = contact?.name || contact?.phone || 'el cliente';

    // Formatear historial
    const transcript = messages.map((m: any) => {
      const who = m.sender === 'user' ? clientLabel : 'Bot';
      return `${who}: ${m.content}`;
    }).join('\n');

    const systemPrompt = `Sos un asistente que resume conversaciones de atención al cliente de forma concisa y útil para el equipo de soporte. Respondé siempre en español.`;

    const userPrompt = `Resumí esta conversación en 3-5 puntos clave. Indicá: el motivo de contacto, lo que se acordó o resolvió, y si hay alguna acción pendiente. Sé conciso.\n\nConversación:\n${transcript}`;

    const response = await callClaude(
      [{ role: 'user', content: userPrompt }],
      systemPrompt,
      400
    );

    res.json({ summary: response.text });
  } catch (err: any) {
    console.error('[summary] Error:', err.message);
    res.status(500).json({ error: 'No se pudo generar el resumen.' });
  }
});

router.get('/calendar/connect/:businessId', async (req: any, res: any) => {
  const { businessId } = req.params;
  const token = req.query.token as string;
  const authorized = await verifyBusinessOwner(token ? `Bearer ${token}` : undefined, businessId);
  if (!authorized) { res.status(403).send('No autorizado'); return; }
  const url = getAuthUrl(businessId);
  res.redirect(url);
});

router.get('/calendar/callback', async (req: any, res: any) => {
  const { code, state } = req.query;
  const { google } = require('googleapis');
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  try {
    const { tokens } = await oauth2.getToken(code);
    // Distinguir si es conexión de Calendar o Sheets por el state
    if (String(state).startsWith('sheets:')) {
      const businessId = String(state).replace('sheets:', '');
      await saveSheetsTokens(businessId, tokens);
      res.send('<script>window.close()</script><p>✅ Google Sheets conectado. Podés cerrar esta ventana.</p>');
    } else {
      await saveTokens(state, tokens);
      res.send('<script>window.close()</script><p>✅ Calendario conectado. Podés cerrar esta ventana.</p>');
    }
  } catch (err) {
    res.status(500).send('Error conectando Google');
  }
});

// ── Google Sheets ──────────────────────────────────────────────────────────
router.get('/sheets/connect/:businessId', async (req: any, res: any) => {
  const { businessId } = req.params;
  const token = req.query.token as string;
  const authorized = await verifyBusinessOwner(token ? `Bearer ${token}` : undefined, businessId);
  if (!authorized) { res.status(403).send('No autorizado'); return; }
  const url = getSheetsAuthUrl(businessId);
  res.redirect(url);
});

// Exportar data a Google Sheets
router.post('/sheets/export/:businessId', async (req: any, res: any) => {
  const { businessId } = req.params;
  const { data: business, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', businessId)
    .single();
  if (error || !business) {
    res.status(404).json({ error: 'Business no encontrado' });
    return;
  }
  try {
    const url = await exportToSheets(business);
    res.json({ url });
  } catch (err: any) {
    console.error('Error exportando a Sheets:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/webhooks/send-manual
// Envía un mensaje manual desde el dashboard al cliente por WhatsApp
router.post('/send-manual', async (req: any, res: any) => {
  const { conversationId, text } = req.body;
  if (!conversationId || !text?.trim()) {
    res.status(400).json({ error: 'conversationId y text son requeridos' });
    return;
  }

  try {
    // Obtener conversación + contacto + business
    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .select('id, business_id, contact:contacts(phone), ai_enabled')
      .eq('id', conversationId)
      .single();

    if (convErr || !conv) { res.status(404).json({ error: 'Conversación no encontrada' }); return; }

    // Verificar que el caller es dueño del negocio
    const authorized = await verifyBusinessOwner(req.headers['authorization'], conv.business_id);
    if (!authorized) { res.status(403).json({ error: 'No autorizado' }); return; }

    const { data: business } = await supabase.from('businesses').select('*').eq('id', conv.business_id).single();
    if (!business) { res.status(404).json({ error: 'Negocio no encontrado' }); return; }

    const phone = (conv.contact as any)?.phone;
    if (!phone) { res.status(400).json({ error: 'Sin teléfono de contacto' }); return; }

    // Enviar por Twilio
    const { sendWhatsAppMessage } = require('../services/twilio');
    await sendWhatsAppMessage(phone, text.trim(), process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);

    // Guardar en messages
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender: 'assistant',
      content: text.trim(),
      tokens_used: 0,
    });

    res.json({ ok: true });
  } catch (err: any) {
    console.error('[send-manual]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/webhooks/appointments/:id/cancel
// Cancela un turno desde el dashboard y avisa al cliente por WhatsApp
router.post('/appointments/:id/cancel', async (req: any, res: any) => {
  const { id } = req.params;

  try {
    const { data: appt, error } = await supabase
      .from('appointments')
      .select('*, businesses(name, bot_name, bot_emoji, language, phone_whatsapp)')
      .eq('id', id)
      .single();

    if (error || !appt) { res.status(404).json({ error: 'Turno no encontrado' }); return; }

    // Verificar que el caller es dueño del negocio
    const authorized = await verifyBusinessOwner(req.headers['authorization'], appt.business_id);
    if (!authorized) { res.status(403).json({ error: 'No autorizado' }); return; }

    if (appt.status === 'cancelled') { res.status(400).json({ error: 'El turno ya está cancelado' }); return; }

    await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', id);

    const business = appt.businesses;
    const isSpanish = (business?.language || 'es') === 'es';
    const botEmoji = business?.bot_emoji || '🤖';
    const timeStr = String(appt.appointment_time).slice(0, 5);
    const dateStr = new Date(appt.appointment_date + 'T12:00:00').toLocaleDateString(
      isSpanish ? 'es-AR' : 'en-US',
      { weekday: 'long', day: 'numeric', month: 'long' }
    );

    const message = isSpanish
      ? `${botEmoji} Hola ${appt.client_name}! Te informamos que tu turno de *${appt.title}* del *${dateStr}* a las *${timeStr}* fue cancelado.\n\nSi querés reprogramar, escribinos por acá.`
      : `${botEmoji} Hi ${appt.client_name}! Your *${appt.title}* appointment on *${dateStr}* at *${timeStr}* has been cancelled.\n\nTo reschedule, message us here.`;

    if (appt.client_phone) {
      const { sendWhatsAppMessage } = require('../services/twilio');
      await sendWhatsAppMessage(
        appt.client_phone, message,
        process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!
      );
    }

    res.json({ ok: true });
  } catch (err: any) {
    console.error('[cancel appointment]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Verificación Meta/WhatsApp: graba llamada entrante y manda el audio por email ──
router.post('/voice', async (req: any, res: any) => {
  try {
    const twilio = require('twilio');
    const twiml = new twilio.twiml.VoiceResponse();

    if (req.body.RecordingUrl) {
      // Segunda llamada: llegó la grabación → mandar por email
      const recordingUrl = req.body.RecordingUrl + '.mp3';
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'noreply@autoresponse-landing.vercel.app',
        to: 'zaza42069zaza69@gmail.com',
        subject: '🔑 Código de verificación Meta WhatsApp',
        html: `<h2>Código de verificación</h2><p>Escuchá la grabación con el código:</p><p><a href="${recordingUrl}">${recordingUrl}</a></p>`,
      });
      console.log('[voice webhook] Grabación enviada por email:', recordingUrl);
      twiml.say('Gracias');
    } else {
      // Primera llamada: grabar
      console.log('[voice webhook] Llamada entrante de:', req.body.From, '— grabando...');
      twiml.record({ maxLength: 30, playBeep: false, action: '/api/webhooks/voice' });
    }

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (err: any) {
    console.error('[voice webhook]', err.message);
    res.status(500).send('Error');
  }
});

module.exports = router;
