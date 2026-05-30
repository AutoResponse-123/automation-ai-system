export {};
const express = require('express');
const { getOrCreateConversation, saveMessage, getConversationHistory, getBusinessByPhone, updateConversationStatus } = require('../services/conversation');
const { callClaude } = require('../services/claude');
const { getAuthUrl, saveTokens } = require('../services/calendar');
const { getSheetsAuthUrl, saveSheetsTokens, exportToSheets } = require('../services/sheets');
const { sendEscalationEmail } = require('../services/email');
const { supabase } = require('../config/supabase');

const router = express.Router();

function buildSystemPrompt(business: any): string {
  const parts: string[] = [];

  const botName = business.bot_name || 'Asistente';
  const botEmoji = business.bot_emoji || '🤖';
  const tone = business.tone || 'amigable';
  const language = business.language || 'es';

  parts.push(`Sos ${botEmoji} ${botName}, el asistente virtual de ${business.name}.`);
  parts.push(`Tu tono de comunicación es ${tone}. Respondé siempre en ${language === 'es' ? 'español' : language === 'en' ? 'inglés' : 'portugués'}.`);
  parts.push(`Respondé de manera breve y clara. Máximo 2-3 oraciones por respuesta salvo que sea necesario más detalle.`);

  if (business.business_description) parts.push(`\nSobre el negocio: ${business.business_description}`);
  if (business.services) parts.push(`\nServicios que ofrecemos: ${business.services}`);
  if (business.prices) parts.push(`\nPrecios: ${business.prices}`);
  if (business.address) parts.push(`\nDirección: ${business.address}`);
  if (business.website) parts.push(`\nSitio web: ${business.website}`);
  if (business.instagram) parts.push(`\nInstagram: ${business.instagram}`);

  if (business.schedule?.enabled) {
    const schedule = business.schedule;
    const tz = schedule.timezone || 'America/Argentina/Buenos_Aires';
    const now = new Date().toLocaleString('es-AR', { timeZone: tz, weekday: 'long', hour: '2-digit', minute: '2-digit' });
    parts.push(`\nHorario de atención (${tz}): ${Object.entries(schedule.hours || {}).map(([day, h]: any) => h.closed ? `${day}: cerrado` : `${day}: ${h.open} - ${h.close}`).join(', ')}`);
    parts.push(`Ahora es: ${now}`);
  }

  if (business.prompt_template) parts.push(`\nInstrucciones adicionales: ${business.prompt_template}`);
  if (business.forbidden_words?.length > 0) parts.push(`\nNUNCA uses estas palabras: ${business.forbidden_words.join(', ')}`);

  if (business.closing_phrases?.length > 0) {
    const randomClosing = business.closing_phrases[Math.floor(Math.random() * business.closing_phrases.length)];
    parts.push(`\nAl cerrar una conversación, usá esta frase: "${randomClosing}"`);
  }

  if (business.google_refresh_token) {
    parts.push(`\nTenés acceso al calendario del negocio. SIEMPRE seguí este flujo para agendar turnos:
1) Preguntá qué fecha prefiere el cliente
2) OBLIGATORIO: llamá get_available_slots para esa fecha ANTES de confirmar cualquier hora
3) Mostrá SOLO los horarios que devuelve la herramienta — no inventes ni sugieras horas
4) Si el cliente pide una hora que NO está en la lista, decile "ese horario no está disponible" y mostrá las opciones disponibles
5) Cuando el cliente elija una hora disponible, pedí su nombre y llamá create_appointment
6) NUNCA confirmes un turno sin haber llamado create_appointment primero. Si no llamaste al tool, NO digas que el turno está agendado.`);
  }

  parts.push(`\nSi no sabés algo, decilo honestamente y ofrecé derivar al equipo humano.`);
  parts.push(`No inventes información sobre precios, disponibilidad o servicios que no se mencionan arriba.`);

  return parts.join('\n');
}

function checkEscalation(message: string, keywords: string[]): boolean {
  if (!keywords?.length) return false;
  const lower = message.toLowerCase();
  return keywords.some((kw: string) => lower.includes(kw.toLowerCase()));
}

function isOutsideHours(schedule: any): boolean {
  if (!schedule?.enabled) return false;
  try {
    const tz = schedule.timezone || 'America/Argentina/Buenos_Aires';
    const now = new Date();
    const dayName = now.toLocaleDateString('es-AR', { timeZone: tz, weekday: 'long' }).toLowerCase();
    const timeStr = now.toLocaleTimeString('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
    const dayConfig = schedule.hours?.[dayName];
    if (!dayConfig) return false;
    if (dayConfig.closed) return true;
    const [curH, curM] = timeStr.split(':').map(Number);
    const [openH, openM] = dayConfig.open.split(':').map(Number);
    const [closeH, closeM] = dayConfig.close.split(':').map(Number);
    const curMins = curH * 60 + curM;
    const openMins = openH * 60 + openM;
    const closeMins = closeH * 60 + closeM;
    return curMins < openMins || curMins > closeMins;
  } catch { return false; }
}

router.post('/whatsapp', async (req: any, res: any) => {
  try {
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

    const { conversationId } = await getOrCreateConversation(business.id, fromPhone);
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
    let systemPrompt = buildSystemPrompt(business);
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

router.get('/calendar/connect/:businessId', (req: any, res: any) => {
  const url = getAuthUrl(req.params.businessId);
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
router.get('/sheets/connect/:businessId', (req: any, res: any) => {
  const url = getSheetsAuthUrl(req.params.businessId);
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

module.exports = router;
