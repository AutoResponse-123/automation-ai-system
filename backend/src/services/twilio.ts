export {};
const twilio = require('twilio');

function validateTwilioRequest(
  request: any,
  authToken: string
): boolean {
  const twilioSignature = request.headers['x-twilio-signature'] || '';
  const url = process.env.TWILIO_WEBHOOK_URL || '';
  const params = request.body;

  const computed = twilio.webhook.validateRequest(
    authToken,
    twilioSignature,
    url,
    params
  );

  return computed;
}

async function sendWhatsAppMessage(
  to: string,
  message: string,
  accountSid: string,
  authToken: string,
  fromNumber?: string
) {
  const client = twilio(accountSid, authToken);
  const from = fromNumber || process.env.TWILIO_PHONE_NUMBER;

  const result = await client.messages.create({
    from: 'whatsapp:' + from,
    to: 'whatsapp:' + to,
    body: message,
  });

  return result;
}

module.exports = {
  validateTwilioRequest,
  sendWhatsAppMessage,
};