export {};
const express = require('express');
const { getOrCreateConversation, saveMessage, getConversationHistory, getBusiness, updateConversationStatus } = require('../services/conversation');
const { callClaude } = require('../services/claude');

const router = express.Router();

const BUSINESS_ID = '550e8400-e29b-41d4-a716-446655440001';

function buildSystemPrompt(business: any): string {
  const parts: string[] = [];

  const botName = business.bot_name || 'Asistente';
  const botEmoji = business.bot_emoji || '🤖';
  const tone = business.tone || 'amigable';
  const language = business.language || 'es';

  parts.push(`Sos ${botEmoji} ${botName}, el asistente virtual de ${business.name}.`);
  parts.push(`Tu tono de comunicación es ${tone}. Respondé siempre en ${language === 'es' ? 'español' : language === 'en' ? 'inglés' : 'portugués'}.`);
  parts.push(`Respondé de manera breve y clara. Máximo 2-3 oraciones por respuesta salvo que sea necesario más detalle.`);

  if (business.business_description) {
    parts.push(`\nSobre el negocio: ${business.business_description}`);
  }

  if (business.services) {
    parts.push(`\nServicios que ofrecemos: ${business.services}`);
  }

  if (business.prices) {
    parts.push(`\nPrecios: ${business.prices}`);
  }

  if (business.address) {
    parts.push(`\nDirección: ${business.address}`);
  }

  if (business.website) {
    parts.push(`\nSitio web: ${business.website}`);
  }

  if (business.instagram) {
    parts.push(`\nInstagram: ${business.instagram}`);
  }

  if (business.schedule?.enabled) {
    const schedule = business.schedule;
    const tz = schedule.timezone || 'America/Argentina/Buenos_Aires';
    const now = new Date().toLocaleString('es-AR', { timeZone: tz, weekday: 'long', hour: '2-digit', minute: '2-digit' });
    parts.push(`\nHorario de atención (${tz}): ${Object.entries(schedule.hours || {}).map(([day, h]: any) => h.closed ? `${day}: cerrado` : `${day}: ${h.open} - ${h.close}`).join(', ')}`);
    parts.push(`Ahora es: ${now}`);
  }

  if (business.prompt_template) {
    parts.push(`\nInstrucciones adicionales: ${business.prompt_template}`);
  }

  if (business.forbidden_words?.length > 0) {
    parts.push(`\nNUNCA uses estas palabras: ${business.forbidden_words.join(', ')}`);
  }

  if (business.closing_phrases?.length > 0) {
    const randomClosing = business.closing_phrases[Math.floor(Math.random() * business.closing_phrases.length)];
    parts.push(`\nAl cerrar una conversación, usá esta frase: "${randomClosing}"`);
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

    const messageBody = req.body.Body || '';
    const fromPhone = req.body.From?.replace('whatsapp:', '') || '';

    console.log('Mensaje:', messageBody, 'De:', fromPhone);

    const business = await getBusiness(BUSINESS_ID);
    if (!business) throw new Error('Business not found');

    const { conversationId, contactId } = await getOrCreateConversation(BUSINESS_ID, fromPhone);
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
      const limitMsg = `Gracias por tu paciencia! Para darte una mejor atención, voy a derivarte con uno de nuestros agentes.`;
      await saveMessage(conversationId, 'assistant', limitMsg);
      const twiml = new (require('twilio').twiml.MessagingResponse)();
      twiml.message(limitMsg);
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    // Construir prompt dinámico y llamar a Claude
    const systemPrompt = buildSystemPrompt(business);
    const messages = history.map((msg: any) => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.content,
    }));

    console.log('Llamando a Claude...');
    const { text: assistantMessage, tokens } = await callClaude(messages, systemPrompt, business.max_tokens || 300);
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

module.exports = router;
