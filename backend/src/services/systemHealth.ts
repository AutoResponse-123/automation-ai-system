export {};

const { supabase } = require('../config/supabase');
const cron = require('node-cron');

// ─────────────────────────────────────────────────────────────────────────────
// Salud operativa del sistema. Dos cosas:
//
//  1. Saldo de Twilio. A diferencia de Anthropic y OpenAI, Twilio SÍ expone el
//     saldo real, así que no hay que calcularlo restando recargas.
//
//  2. Latido (heartbeat) de los crons. Cada job avisa acá cuando termina bien.
//     Si un job muere —Railway reinicia y node-cron no arranca, una excepción no
//     capturada mata el schedule— el updated_at deja de moverse y el panel lo ve.
//     Sin esto, un dashboard todo verde puede significar "está todo bien" o
//     "hace tres días que no corre nada". Son estados indistinguibles.
// ─────────────────────────────────────────────────────────────────────────────

/** Cada cuánto corre cada job, en minutos. Lo usa el panel para saber cuándo un latido está vencido. */
const JOB_INTERVALS: Record<string, number> = {
  reminders: 15,
  provider_spend: 1440,
  system_health: 360,
};

/**
 * Marca que un job corrió bien recién.
 * Nunca tira excepción: un fallo al registrar el latido no puede tumbar el job real.
 */
async function heartbeat(job: string, detail: any = {}): Promise<void> {
  try {
    await supabase.from('system_status').upsert({
      key: `cron:${job}`,
      value: { interval_minutes: JOB_INTERVALS[job] ?? null, ...detail },
      status: 'ok',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
  } catch (err: any) {
    console.error(`[systemHealth] no pude registrar el latido de ${job}: ${err.message}`);
  }
}

/**
 * Trae el saldo real de la cuenta de Twilio.
 * GET /2010-04-01/Accounts/{SID}/Balance.json con basic auth (SID:AUTH_TOKEN),
 * las mismas credenciales que ya se usan para mandar mensajes.
 */
async function fetchTwilioBalance(): Promise<{ balance: number; currency: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('Faltan TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN');

  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Balance.json`,
    { headers: { Authorization: `Basic ${auth}` } }
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Twilio HTTP ${res.status} — ${text.slice(0, 200)}`);

  const json = JSON.parse(text);
  // Twilio devuelve el balance como string ("12.3456").
  const balance = parseFloat(json.balance);
  if (!isFinite(balance)) throw new Error(`Balance ilegible: ${text.slice(0, 120)}`);
  return { balance, currency: json.currency || 'USD' };
}

/**
 * Umbrales del saldo de Twilio, en dólares.
 * Van fijos en USD y no en días porque acá no hay serie histórica de consumo:
 * Twilio da el saldo puntual, no el gasto diario. Calibrados para etapa de
 * prueba — subilos cuando crezca el volumen.
 */
const TWILIO_WARN = 5;
const TWILIO_CRITICAL = 2;

async function syncTwilioBalance(dryRun = false): Promise<any> {
  const { balance, currency } = await fetchTwilioBalance();

  const status =
    balance < TWILIO_CRITICAL ? 'critical' :
    balance < TWILIO_WARN ? 'warn' : 'ok';

  if (dryRun) return { dryRun: true, balance, currency, status };

  const { error } = await supabase.from('system_status').upsert({
    key: 'twilio_balance',
    value: { balance, currency, warn_below: TWILIO_WARN, critical_below: TWILIO_CRITICAL },
    status,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });
  if (error) throw new Error(`Supabase upsert: ${error.message}`);

  if (status !== 'ok') {
    await supabase.from('admin_events').insert({
      event_type: 'twilio_balance_low',
      description: `Saldo ${status} en Twilio: ${currency} ${balance.toFixed(2)}`,
      metadata: { balance, currency, status },
    });
  }

  console.log(`[systemHealth] Twilio: ${currency} ${balance.toFixed(2)} (${status})`);
  return { balance, currency, status };
}

function startSystemHealthJob(): void {
  // Cada 6 horas. El saldo de Twilio se mueve despacio y la API tiene rate limit,
  // así que no tiene sentido pegarle más seguido.
  cron.schedule('0 */6 * * *', async () => {
    try {
      await syncTwilioBalance();
      await heartbeat('system_health');
    } catch (err: any) {
      console.error(`[systemHealth] falló: ${err.message}`);
    }
  }, { timezone: 'America/Argentina/Buenos_Aires' });

  // Una corrida al arrancar: deja la fila creada desde el minuto cero. Si no,
  // un job que nunca llega a ejecutarse tampoco deja rastro, y el panel no
  // tendría nada que detectar como vencido.
  syncTwilioBalance().catch((e: any) => console.error(`[systemHealth] arranque: ${e.message}`));
  heartbeat('system_health');

  console.log('[systemHealth] Job iniciado — corre cada 6 h');
}

module.exports = {
  heartbeat,
  fetchTwilioBalance,
  syncTwilioBalance,
  startSystemHealthJob,
  JOB_INTERVALS,
};
