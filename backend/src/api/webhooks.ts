export {};
const express = require('express');
const { validateTwilioRequest, sendWhatsAppMessage } = require('../services/twilio');
const { getOrCreateConversation, saveMessage, getConversationHistory, getBusiness } = require('../services/conversation');
const { callClaude } = require('../services/claude');

const router = express.Router();

router.post('/whatsapp', async (req: any, res: any) => {
  try {
    console.log('Webhook recibido:', req.body);

    const messageBody = req.body.Body || '';
    const fromPhone = req.body.From?.replace('whatsapp:', '') || '';
    const toPhone = req.body.To?.replace('whatsapp:', '') || '';

    console.log('Mensaje:', messageBody, 'De:', fromPhone, 'A:', toPhone);

    const businessId = '550e8400-e29b-41d4-a716-446655440001';

    const { conversationId } = await getOrCreateConversation(businessId, fromPhone);
    console.log('Conversación:', conversationId);

    await saveMessage(conversationId, 'user', messageBody);
    console.log('Mensaje del usuario guardado');

    const history = await getConversationHistory(conversationId);
    const messages = history.map((msg: any) => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.content,
    }));

    const business = await getBusiness(businessId);
    const systemPrompt = business?.prompt_template || 'Eres un asistente útil. Responde de manera breve y clara.';

    console.log('Llamando a Claude...');
    const assistantMessage = await callClaude(messages, systemPrompt);
    console.log('Respuesta Claude:', assistantMessage);

    await saveMessage(conversationId, 'assistant', assistantMessage);
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