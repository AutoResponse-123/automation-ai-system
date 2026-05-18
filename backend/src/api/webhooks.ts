import { Router, Request, Response } from 'express';
import { validateTwilioRequest, sendWhatsAppMessage } from '../services/twilio';
import { getOrCreateConversation, saveMessage, getConversationHistory, getBusiness } from '../services/conversation';
import { callClaude } from '../services/claude';

const router = Router();

// POST /api/webhooks/whatsapp
router.post('/whatsapp', async (req: Request, res: Response) => {
  try {
    console.log('Webhook recibido:', req.body);

    // Por ahora, skip validación Twilio (la agregamos después)
    // if (!validateTwilioRequest(req, process.env.TWILIO_AUTH_TOKEN || '')) {
    //   return res.status(403).send('Forbidden');
    // }

    const messageBody = req.body.Body || '';
    const fromPhone = req.body.From?.replace('whatsapp:', '') || '';
    const toPhone = req.body.To?.replace('whatsapp:', '') || '';

    console.log('Mensaje:', messageBody, 'De:', fromPhone, 'A:', toPhone);

    // TODO: Obtener businessId del número de teléfono
    // Por ahora usamos un ID hardcoded para testing
    const businessId = 'test-business-123';

    // Obtener o crear conversación
    const { conversationId } = await getOrCreateConversation(businessId, fromPhone);
    console.log('Conversación:', conversationId);

    // Guardar mensaje del usuario
    await saveMessage(conversationId, 'user', messageBody);
    console.log('Mensaje del usuario guardado');

    // Obtener historial
    const history = await getConversationHistory(conversationId);
    const messages = history.map((msg: any) => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.content,
    }));

    // Obtener business y prompt
    const business = await getBusiness(businessId);
    const systemPrompt = business?.prompt_template || 'Eres un asistente útil. Responde de manera breve y clara.';

    console.log('Llamando a Claude...');
    // Llamar a Claude
    const assistantMessage = await callClaude(messages, systemPrompt);
    console.log('Respuesta Claude:', assistantMessage);

    // Guardar respuesta
    await saveMessage(conversationId, 'assistant', assistantMessage);
    console.log('Respuesta guardada');

    // Responder a Twilio (que devuelva el mensaje)
    const twiml = new (require('twilio').twiml.MessagingResponse)();
    twiml.message(assistantMessage);

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error) {
    console.error('Error en webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;