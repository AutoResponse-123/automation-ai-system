require('dotenv').config({ path: './backend/.env' });

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken  = process.env.TWILIO_AUTH_TOKEN;
const toNumber   = process.env.TWILIO_PHONE_NUMBER; // +15855012647

if (!accountSid || !authToken || !toNumber) {
  console.error('Falta TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN o TWILIO_PHONE_NUMBER en backend/.env');
  process.exit(1);
}

const https = require('https');

function fetchMessages() {
  // Solo mensajes de los últimos 15 minutos
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json?To=${encodeURIComponent(toNumber)}&DateSent>=${encodeURIComponent(since)}&PageSize=10`;

  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      auth: `${accountSid}:${authToken}`,
      headers: { 'Accept': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
  });
}

let lastSeenSid = null;
let attempts = 0;
const MAX_ATTEMPTS = 30; // 5 minutos máximo

async function poll() {
  attempts++;
  if (attempts > MAX_ATTEMPTS) {
    console.log('\n⏱  Tiempo agotado (5 min). Si Meta no mandó el código, pedí reenvío y volvé a correr el script.');
    process.exit(0);
  }

  try {
    const json = await fetchMessages();
    const msgs = (json.messages || []).filter(m => m.direction === 'inbound');

    if (msgs.length > 0) {
      const latest = msgs[0];
      if (latest.sid !== lastSeenSid) {
        lastSeenSid = latest.sid;
        console.log('\n✅ SMS RECIBIDO:\n');
        console.log(`   De:      ${latest.from}`);
        console.log(`   Hora:    ${latest.date_sent}`);
        console.log(`   Mensaje: ${latest.body}`);
        console.log('\n👆 Ese es tu código. Ingresalo en Meta antes de que expire.\n');
        process.exit(0);
      }
    }

    process.stdout.write(`\r⏳ Esperando OTP... (intento ${attempts}/${MAX_ATTEMPTS})`);
  } catch (err) {
    console.error('\nError:', err.message);
  }

  setTimeout(poll, 10000);
}

console.log(`\n🔍 Escuchando SMS entrantes en ${toNumber}...`);
console.log('   Ahora dale "Siguiente" en Meta para que mande el OTP.\n');
poll();
