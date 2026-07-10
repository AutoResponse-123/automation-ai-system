export {};
const express = require('express');
const { getOrCreateConversation, saveMessage, getConversationHistory, getBusinessByPhone, updateConversationStatus, updateContactSummary } = require('../services/conversation');
const { callClaude } = require('../services/claude');
const { getAuthUrl, saveTokens } = require('../services/calendar');
const { getSheetsAuthUrl, saveSheetsTokens, exportToSheets } = require('../services/sheets');
const { sendEscalationEmail } = require('../services/email');
const { supabase } = require('../config/supabase');
const { buildSystemPrompt, buildOutsideHoursMessage, getNextOpeningTime, checkEscalation, isOutsideHours, hasProFeatures, hasAudioFeature, resolveAutoResumeHours } = require('../utils');
const { transcribeAudio } = require('../services/transcribe');

const router = express.Router();

// Dedup de mensajes: Twilio puede reintentar el mismo webhook. Guardamos los SID
// procesados en memoria (single-instance) y descartamos repetidos dentro de 10 min.
const recentSids = new Map<string, number>();
function isDuplicateSid(sid: string): boolean {
  if (!sid) return false;
  const now = Date.now();
  for (const [k, t] of recentSids) if (now - t > 10 * 60 * 1000) recentSids.delete(k);
  if (recentSids.has(sid)) return true;
  recentSids.set(sid, now);
  return false;
}

// Nonce de un solo uso (5 min) para iniciar OAuth sin exponer el JWT del usuario
// en la URL del popup (que termina en logs/historial). Single-instance, en memoria.
const connectNonces = new Map<string, { businessId: string; exp: number }>();
function mintNonce(businessId: string): string {
  const nonce = require('crypto').randomBytes(24).toString('hex');
  connectNonces.set(nonce, { businessId, exp: Date.now() + 5 * 60 * 1000 });
  return nonce;
}
function consumeNonce(nonce: string | undefined, businessId: string): boolean {
  if (!nonce) return false;
  const e = connectNonces.get(nonce);
  if (!e) return false;
  connectNonces.delete(nonce); // un solo uso
  return e.businessId === businessId && e.exp > Date.now();
}

async function verifyBusinessOwner(authHeader: string | undefined, businessId: string): Promise<boolean> {
  if (!authHeader) return false;
  const token = authHeader.replace('Bearer ', '');
  const { createClient } = require('@supabase/supabase-js');
  // 1) Validar el token del usuario con el cliente anónimo.
  const authClient = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_ANON_KEY || '');
  const { data: { user }, error: authErr } = await authClient.auth.getUser(token);
  if (authErr || !user) return false;
  // 2) Chequear la propiedad con service role. Necesario: con RLS activado, una consulta
  //    como anónimo NO ve la fila (auth.uid() es null) y siempre daría "No autorizado".
  const admin = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
  const { data } = await admin.from('businesses').select('id').eq('id', businessId).eq('user_id', user.id).maybeSingle();
  return !!data;
}

router.post('/whatsapp', async (req: any, res: any) => {
  try {
    const authToken = process.env.TWILIO_AUTH_TOKEN || '';
    if (!authToken) {
      console.error('[webhook] TWILIO_AUTH_TOKEN no configurado');
      res.status(403).send('Forbidden');
      return;
    }
    const twilio = require('twilio');
    const signature = req.headers['x-twilio-signature'] as string || '';
    // Validar la firma contra WEBHOOK_URL (si está) y/o la URL reconstruida de producción.
    // Aceptamos si alguna coincide, para no rechazar por una WEBHOOK_URL desactualizada (ngrok viejo).
    const reconstructed = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const candidateUrls = [process.env.WEBHOOK_URL, reconstructed].filter(Boolean) as string[];
    const isValid = candidateUrls.some((url) => twilio.validateRequest(authToken, signature, url, req.body));
    if (!isValid) {
      console.warn('[webhook] Firma Twilio inválida. URLs probadas:', candidateUrls.join(' | '));
      res.status(403).send('Forbidden');
      return;
    }

    // Idempotencia: si ya procesamos este MessageSid, ignorar el reintento
    const messageSid = req.body.MessageSid || req.body.SmsSid || '';
    if (isDuplicateSid(messageSid)) {
      console.log('[webhook] MessageSid duplicado, ignorando:', messageSid);
      res.status(200).send('<Response/>');
      return;
    }

    const rawBody = req.body.Body || '';
    const numMedia = parseInt(req.body.NumMedia || '0', 10);
    const mediaType = req.body.MediaContentType0 || '';
    const mediaUrl = req.body.MediaUrl0 || '';
    const isAudio = numMedia > 0 && !rawBody && mediaType.startsWith('audio/');
    let messageBody = rawBody;

    if (numMedia > 0 && !rawBody) {
      if (mediaType.startsWith('audio/')) {
        // Fallback si la transcripción no aplica (plan sin audios) o falla: guía al bot a pedir texto.
        messageBody = '[El usuario envió un mensaje de voz que no puedo escuchar. Pedile amablemente que escriba su consulta por texto.]';
      } else if (mediaType.startsWith('image/')) {
        messageBody = '[El usuario envió una imagen]';
      } else if (mediaType.startsWith('video/')) {
        messageBody = '[El usuario envió un video]';
      } else {
        messageBody = '[El usuario envió un archivo adjunto]';
      }
    }

    if (!messageBody) {
      res.status(200).send('<Response/>');
      return;
    }

    const fromPhone = req.body.From?.replace('whatsapp:', '') || '';
    const toPhone = req.body.To?.replace('whatsapp:', '') || '';

    const business = await getBusinessByPhone(toPhone);
    if (!business) {
      console.error('No se encontró negocio para el número:', toPhone);
      res.status(404).json({ error: 'Business not found' });
      return;
    }

    if (!business.is_active) {
      const suspendedMsg = `Lo sentimos, el servicio está temporalmente suspendido. Por favor contactanos directamente para más información.`;
      const twiml = new (require('twilio').twiml.MessagingResponse)();
      twiml.message(suspendedMsg);
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    if (business.plan === 'trial' && business.trial_ends_at) {
      const trialEnd = new Date(business.trial_ends_at);
      if (trialEnd < new Date()) {
        await supabase.from('businesses').update({ is_active: false }).eq('id', business.id);
        const trialMsg = `Tu período de prueba ha finalizado. Para continuar usando el servicio, contactanos para activar tu plan.`;
        const twiml = new (require('twilio').twiml.MessagingResponse)();
        twiml.message(trialMsg);
        res.type('text/xml');
        return res.send(twiml.toString());
      }
    }

    // Tope de conversaciones nuevas por mes según plan (coincide con la guía de venta).
    // Las conversaciones ya iniciadas siguen respondiendo; solo se frena un contacto
    // NUEVO una vez superado el tope. Pro/Premium dejan de ser ilimitados → protege margen.
    const PLAN_LIMITS: Record<string, number> = { trial: 200, starter: 500, basic: 500, pro: 1500, enterprise: 4000 };
    const planLimit = PLAN_LIMITS[business.plan] ?? 500;
    if (planLimit > 0) {
      const monthStart = new Date();
      monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      // Un contacto que ya existe (cliente que vuelve) no cuenta contra el tope;
      // solo se evalúa cuando es un contacto NUEVO de este mes.
      const { data: existingContact } = await supabase
        .from('contacts')
        .select('id')
        .eq('business_id', business.id)
        .eq('phone', fromPhone)
        .limit(1);
      const isReturning = !!(existingContact && existingContact.length);
      if (!isReturning) {
        const { count: monthlyConvs } = await supabase
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', business.id)
          .gte('started_at', monthStart.toISOString());
        if ((monthlyConvs ?? 0) >= planLimit) {
          const limitPlanMsg = `Lo sentimos, alcanzamos el límite del plan este mes. Para continuar, contactanos para actualizar tu plan.`;
          const twimlLP = new (require('twilio').twiml.MessagingResponse)();
          twimlLP.message(limitPlanMsg);
          res.type('text/xml');
          return res.send(twimlLP.toString());
        }
      }
    }

    // Notas de voz: si es audio y el plan lo permite, transcribimos con Whisper y usamos
    // el texto como si el cliente lo hubiera escrito. Si falla, pedimos que lo escriban.
    if (isAudio && hasAudioFeature(business.plan)) {
      const transcript = await transcribeAudio(mediaUrl, mediaType);
      if (transcript) {
        messageBody = transcript;
        console.log('[webhook] audio transcripto:', transcript.slice(0, 80));
      } else {
        const { sendWhatsAppMessage } = require('../services/twilio');
        const askText = 'Perdón, no pude escuchar bien el audio 🙉 ¿Me lo escribís por texto, porfa?';
        await sendWhatsAppMessage(fromPhone, askText, process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!, business.phone_whatsapp);
        res.status(200).send('<Response/>');
        return;
      }
    }

    const { conversationId: initialConversationId, contactId, contactSummary, aiEnabled, lastMessageAt } = await getOrCreateConversation(business.id, fromPhone, business.schedule?.session_timeout_hours ?? 6);
    let conversationId = initialConversationId;

    // Conversación derivada a un humano => la IA está en pausa y el bot NO responde
    // (el humano la atiende desde el panel). Excepción: reactivación automática configurable.
    if (!aiEnabled) {
      // Sin configurar => 24 h por defecto (una conversación derivada no queda muda para siempre).
      const autoResumeH = resolveAutoResumeHours(business.schedule?.escalation_auto_resume_hours);
      const lastTs = lastMessageAt ? new Date(lastMessageAt).getTime() : null;
      const resume = autoResumeH > 0 && lastTs !== null && (Date.now() - lastTs) >= autoResumeH * 60 * 60 * 1000;
      if (!resume) {
        // No corresponde retomar: guardamos el mensaje en la conversación derivada (para que el
        // humano lo vea en el panel) y el bot NO responde.
        await saveMessage(conversationId, 'user', messageBody);
        res.type('text/xml');
        res.send('<Response/>');
        return;
      }
      // Auto-resume: cerramos la conversación derivada vieja y arrancamos una FRESCA, para no
      // arrastrar el historial largo/derivado a la nueva interacción. El resumen del contacto
      // (contactSummary) se conserva, así no se pierde el contexto útil del cliente.
      await supabase.from('conversations').update({ status: 'resolved', updated_at: new Date().toISOString() }).eq('id', conversationId);
      const fresh = await supabase.from('conversations').insert({ business_id: business.id, contact_id: contactId, status: 'active' }).select('id').maybeSingle();
      if (fresh.data?.id) {
        conversationId = fresh.data.id;
        console.log('[handoff] IA reactivada en conversación NUEVA tras inactividad:', conversationId);
      } else {
        // Fallback defensivo: si no se pudo crear la nueva, reactivamos la vieja (mejor que quedar muda).
        await supabase.from('conversations').update({ status: 'active', ai_enabled: true, updated_at: new Date().toISOString() }).eq('id', conversationId);
        console.warn('[handoff] no se pudo crear conversación nueva; reactivada la vieja:', conversationId, fresh.error?.message);
      }
    }

    // Guardar el mensaje entrante en la conversación que corresponde (la nueva si hubo resume).
    await saveMessage(conversationId, 'user', messageBody);

    let outsideHoursAiMode = false;
    if (isOutsideHours(business.schedule)) {
      if (business.schedule && business.schedule.outside_hours_ai) {
        // Bot sigue respondiendo pero avisa que esta cerrado (util para agendar de noche).
        outsideHoursAiMode = true;
      } else {
        const offMsg = buildOutsideHoursMessage(business);
        await saveMessage(conversationId, 'assistant', offMsg);
        const twiml = new (require('twilio').twiml.MessagingResponse)();
        twiml.message(offMsg);
        res.type('text/xml');
        return res.send(twiml.toString());
      }
    }

    if (business.schedule?.escalation_keyword_enabled !== false && checkEscalation(messageBody, business.escalation_keywords)) {
      await supabase.from('conversations').update({ status: 'pending', ai_enabled: false, updated_at: new Date().toISOString() }).eq('id', conversationId);
      supabase.from('escalations').insert({ business_id: business.id, conversation_id: conversationId, contact_phone: fromPhone, reason: 'keyword' }).then((r: any) => { if (r.error) console.error('[escalation]', r.error.message); });
      const matchedKw = business.escalation_keywords?.find((kw: string) => messageBody.toLowerCase().includes(kw.toLowerCase()));
      sendEscalationEmail({ to: business.escalation_email, businessName: business.name, botName: business.bot_name, clientPhone: fromPhone, reason: 'keyword', keyword: matchedKw }).catch(console.error);
      const escalMsg = `Entendido! Te voy a comunicar con un miembro de nuestro equipo lo antes posible. Por favor esperá unos momentos.`;
      await saveMessage(conversationId, 'assistant', escalMsg);
      const twiml = new (require('twilio').twiml.MessagingResponse)();
      twiml.message(escalMsg);
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    const today = new Date().toISOString().split('T')[0];
    // Paralelizamos las dos consultas independientes (historial + próximos turnos) para
    // arrancar a pensar la respuesta antes (menos latencia percibida por el cliente).
    const [history, upcomingApptsRes] = await Promise.all([
      getConversationHistory(conversationId),
      supabase
        .from('appointments')
        .select('title, client_name, appointment_date, appointment_time')
        .eq('business_id', business.id)
        .eq('client_phone', fromPhone)
        .gte('appointment_date', today)
        .order('appointment_date').order('appointment_time')
        .limit(3),
    ]);
    const upcomingAppts = upcomingApptsRes.data;
    const msgCount = history.filter((m: any) => m.sender === 'user').length;
    const maxMsgs = business.max_messages_before_escalation || 10;

    if (business.schedule?.escalation_limit_enabled !== false && msgCount >= maxMsgs) {
      await supabase.from('conversations').update({ status: 'pending', ai_enabled: false, updated_at: new Date().toISOString() }).eq('id', conversationId);
      supabase.from('escalations').insert({ business_id: business.id, conversation_id: conversationId, contact_phone: fromPhone, reason: 'limit' }).then((r: any) => { if (r.error) console.error('[escalation]', r.error.message); });
      sendEscalationEmail({ to: business.escalation_email, businessName: business.name, botName: business.bot_name, clientPhone: fromPhone, reason: 'limit' }).catch(console.error);
      const limitMsg = `Gracias por tu paciencia! Para darte una mejor atención, voy a derivarte con uno de nuestros agentes.`;
      await saveMessage(conversationId, 'assistant', limitMsg);
      const twiml = new (require('twilio').twiml.MessagingResponse)();
      twiml.message(limitMsg);
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    let systemPrompt = buildSystemPrompt(business, contactSummary || undefined);
    if (outsideHoursAiMode) {
      const nextOpen = getNextOpeningTime(business.schedule);
      const openNote = nextOpen ? ' (volvemos ' + nextOpen + ')' : '';
      systemPrompt += '\n\nIMPORTANTE - FUERA DE HORARIO: El negocio esta cerrado ahora' + openNote + '. Al inicio de tu respuesta avisale al cliente que esta fuera del horario pero que igual podes ayudarlo. Luego continua normalmente.';
    }
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

    // Responder a Twilio YA con un ack vacío para evitar timeouts: Twilio corta la espera
    // a los ~15s y el mensaje quedaría sin contestar. El bot piensa y responde por la API
    // de Twilio cuando termina, sin importar cuánto tarde (no se cae ningún mensaje).
    res.type('text/xml');
    res.send('<Response/>');

    (async () => {
      try {
        const { text: assistantMessage, tokens, escalate } = await callClaude(messages, systemPrompt, business.max_tokens || 600, business, fromPhone);
        // Mandar la respuesta PRIMERO (lo que el cliente percibe), guardar después.
        const { sendWhatsAppMessage } = require('../services/twilio');
        await sendWhatsAppMessage(fromPhone, assistantMessage, process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!, business.phone_whatsapp);
        await saveMessage(conversationId, 'assistant', assistantMessage, tokens);

        // Embudo: el negocio ya le respondió a este cliente → etapa 'contactado'.
        const { advanceStage } = require('../services/pipeline');
        advanceStage(contactId, 'contactado').catch((e: any) => console.error('[pipeline async]', e.message));

        // El bot decidió derivar a un humano: pausamos la IA y avisamos al equipo.
        if (escalate) {
          await supabase.from('conversations').update({ status: 'pending', ai_enabled: false, updated_at: new Date().toISOString() }).eq('id', conversationId);
          supabase.from('escalations').insert({ business_id: business.id, conversation_id: conversationId, contact_phone: fromPhone, reason: 'bot' }).then((r: any) => { if (r.error) console.error('[escalation]', r.error.message); });
          sendEscalationEmail({ to: business.escalation_email, businessName: business.name, botName: business.bot_name, clientPhone: fromPhone, reason: 'bot' }).catch(console.error);
          console.log('[handoff] el bot derivó a un humano:', conversationId);
        }

        const userMsgCount = history.filter((m: any) => m.sender === 'user').length + 1;
        if (userMsgCount % 10 === 0 && contactId) {
          updateContactSummary(contactId, conversationId, business).catch((e: any) => console.error('[summary async]', e.message));
        }
      } catch (err: any) {
        const { captureError } = require('../services/logger');
        captureError(err, 'webhook-ai-async');
        console.error('[webhook-ai-async]', err?.message || err);
        // Error técnico => derivar a un humano (si el negocio lo tiene activado).
        if (business.schedule?.escalation_on_error !== false) {
          try {
            await supabase.from('conversations').update({ status: 'pending', ai_enabled: false, updated_at: new Date().toISOString() }).eq('id', conversationId);
            supabase.from('escalations').insert({ business_id: business.id, conversation_id: conversationId, contact_phone: fromPhone, reason: 'error' }).then((r: any) => { if (r.error) console.error('[escalation]', r.error.message); });
            sendEscalationEmail({ to: business.escalation_email, businessName: business.name, botName: business.bot_name, clientPhone: fromPhone, reason: 'error' }).catch(() => {});
            const { sendWhatsAppMessage } = require('../services/twilio');
            await sendWhatsAppMessage(fromPhone, 'Disculpá, tuve un inconveniente para procesar tu mensaje. Ya avisé al equipo y alguien te va a responder en breve.', process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!, business.phone_whatsapp);
          } catch (e2: any) { console.error('[handoff on_error]', e2?.message || e2); }
        }
      }
    })();
    return;

  } catch (error) {
    const { captureError } = require('../services/logger');
    captureError(error, 'webhook');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Resumen IA de conversacion
router.post('/conversations/:id/summary', async (req: any, res: any) => {
  const { id: conversationId } = req.params;

  try {
    const { data: convAuth } = await supabase
      .from('conversations').select('business_id').eq('id', conversationId).single();
    if (!convAuth) { res.status(404).json({ error: 'Conversación no encontrada' }); return; }
    const authorized = await verifyBusinessOwner(req.headers['authorization'], convAuth.business_id);
    if (!authorized) { res.status(403).json({ error: 'No autorizado' }); return; }

    const { data: messages } = await supabase
      .from('messages')
      .select('sender, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(60);

    if (!messages || messages.length === 0) {
      return res.json({ summary: 'Esta conversación no tiene mensajes todavía.' });
    }

    const { data: conv } = await supabase
      .from('conversations')
      .select('business_id, contacts(name, phone)')
      .eq('id', conversationId)
      .single();

    const contact = (conv as any)?.contacts;
    const clientLabel = contact?.name || contact?.phone || 'el cliente';

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

// Mintea un nonce de un solo uso para iniciar la conexión OAuth desde el dashboard.
router.post('/connect-token/:businessId', async (req: any, res: any) => {
  const { businessId } = req.params;
  const authorized = await verifyBusinessOwner(req.headers['authorization'], businessId);
  if (!authorized) { res.status(403).json({ error: 'No autorizado' }); return; }
  res.json({ nonce: mintNonce(businessId) });
});

router.get('/calendar/connect/:businessId', async (req: any, res: any) => {
  const { businessId } = req.params;
  const nonce = req.query.nonce as string;
  const token = req.query.token as string;
  // Preferir nonce (no expone el JWT en la URL); mantener token como fallback.
  const authorized = consumeNonce(nonce, businessId)
    || await verifyBusinessOwner(token ? `Bearer ${token}` : undefined, businessId);
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

router.get('/sheets/connect/:businessId', async (req: any, res: any) => {
  const { businessId } = req.params;
  const nonce = req.query.nonce as string;
  const token = req.query.token as string;
  const authorized = consumeNonce(nonce, businessId)
    || await verifyBusinessOwner(token ? `Bearer ${token}` : undefined, businessId);
  if (!authorized) { res.status(403).send('No autorizado'); return; }
  const url = getSheetsAuthUrl(businessId);
  res.redirect(url);
});

router.post('/sheets/export/:businessId', async (req: any, res: any) => {
  const { businessId } = req.params;
  const authorized = await verifyBusinessOwner(req.headers['authorization'], businessId);
  if (!authorized) { res.status(403).json({ error: 'No autorizado' }); return; }
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

router.post('/send-manual', async (req: any, res: any) => {
  const { conversationId, text } = req.body;
  if (!conversationId || !text?.trim()) {
    res.status(400).json({ error: 'conversationId y text son requeridos' });
    return;
  }

  try {
    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .select('id, business_id, contact:contacts(phone), ai_enabled')
      .eq('id', conversationId)
      .single();

    if (convErr || !conv) { res.status(404).json({ error: 'Conversación no encontrada' }); return; }

    const authorized = await verifyBusinessOwner(req.headers['authorization'], conv.business_id);
    if (!authorized) { res.status(403).json({ error: 'No autorizado' }); return; }

    const { data: business } = await supabase.from('businesses').select('*').eq('id', conv.business_id).single();
    if (!business) { res.status(404).json({ error: 'Negocio no encontrado' }); return; }
    if (!business.is_active) { res.status(403).json({ error: 'Negocio suspendido' }); return; }

    const phone = (conv.contact as any)?.phone;
    if (!phone) { res.status(400).json({ error: 'Sin teléfono de contacto' }); return; }

    const { sendWhatsAppMessage } = require('../services/twilio');
    await sendWhatsAppMessage(phone, text.trim(), process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!, business.phone_whatsapp);

    await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender: 'assistant',
      content: text.trim(),
      tokens_used: 0,
    });

    res.json({ ok: true });
  } catch (err: any) {
    // Incluimos el código de Twilio (ej. 63016 = fuera de la ventana de 24hs) para
    // que el panel muestre el motivo real y el dueño sepa qué pasó.
    console.error('[send-manual]', err?.code, err.message);
    const detail = err?.code ? `${err.code}: ${err.message}` : (err.message || 'Error al enviar');
    res.status(500).json({ error: detail });
  }
});

router.post('/appointments/:id/cancel', async (req: any, res: any) => {
  const { id } = req.params;

  try {
    const { data: appt, error } = await supabase
      .from('appointments')
      .select('*, businesses(name, bot_name, bot_emoji, language, phone_whatsapp)')
      .eq('id', id)
      .single();

    if (error || !appt) { res.status(404).json({ error: 'Turno no encontrado' }); return; }

    const authorized = await verifyBusinessOwner(req.headers['authorization'], appt.business_id);
    if (!authorized) { res.status(403).json({ error: 'No autorizado' }); return; }

    if (appt.status === 'cancelled') { res.status(400).json({ error: 'El turno ya está cancelado' }); return; }

    await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', id);

    if (appt.google_event_id) {
      const ownerBiz = await supabase.from('businesses').select('google_refresh_token, google_calendar_id').eq('id', appt.business_id).single();
      if (ownerBiz.data?.google_refresh_token) {
        const { cancelEvent } = require('../services/calendar');
        await cancelEvent(ownerBiz.data, appt.google_event_id);
      }
    }

    const business = appt.businesses;
    const isSpanish = (business?.language || 'es') === 'es';
    const botEmoji = business?.bot_emoji || '\u{1F916}';
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
        process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!,
        business?.phone_whatsapp
      );
    }

    res.json({ ok: true });
  } catch (err: any) {
    console.error('[cancel appointment]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Verificacion Meta/WhatsApp (endpoint temporal, gated por env)
router.post('/voice', async (req: any, res: any) => {
  if (process.env.META_VERIFY_ENABLED !== 'true') { res.status(404).send('Not found'); return; }
  try {
    const twilio = require('twilio');
    const twiml = new twilio.twiml.VoiceResponse();

    if (req.body.RecordingSid) {
      const recordingSid = req.body.RecordingSid;
      const listenUrl = `https://automation-ai-system-production.up.railway.app/api/webhooks/recording/${recordingSid}`;

      const { sendMail } = require('../services/mailer');
      await sendMail({
        to: process.env.META_VERIFY_EMAIL || 'zaza42069zaza69@gmail.com',
        subject: 'Codigo de verificacion Meta WhatsApp',
        html: `<h2>Codigo de verificacion WhatsApp</h2><p><a href="${listenUrl}">Escuchar codigo</a></p><p>SID: ${recordingSid}</p>`,
      });
      twiml.say('Gracias');
    } else {
      twiml.record({
        maxLength: 60,
        playBeep: false,
        action: 'https://automation-ai-system-production.up.railway.app/api/webhooks/voice',
      });
    }

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (err: any) {
    console.error('[voice webhook]', err.message);
    res.status(500).send('Error');
  }
});

router.get('/recording/:sid', async (req: any, res: any) => {
  if (process.env.META_VERIFY_ENABLED !== 'true') { res.status(404).send('Not found'); return; }
  try {
    const { sid } = req.params;
    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const https = require('https');
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${sid}.mp3`;
    https.get(url, { headers: { Authorization: `Basic ${auth}` } }, (proxyRes: any) => {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Disposition', 'inline; filename="codigo.mp3"');
      proxyRes.pipe(res);
    }).on('error', (e: any) => {
      console.error('[recording proxy]', e.message);
      res.status(500).send('Error al obtener grabacion');
    });
  } catch (err: any) {
    console.error('[recording proxy]', err.message);
    res.status(500).send('Error');
  }
});

module.exports = router;
