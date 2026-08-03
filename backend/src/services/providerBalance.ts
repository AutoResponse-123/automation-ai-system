export {};

const { supabase } = require('../config/supabase');
const cron = require('node-cron');

// ─────────────────────────────────────────────────────────────────────────────
// Sync del gasto de Anthropic (texto) y OpenAI (audio) hacia provider_spend_daily.
//
// Ninguno de los dos proveedores expone "saldo restante", solo gasto. El saldo
// se calcula en la vista provider_balance como (cargado - gastado), donde
// "cargado" son las recargas que el admin registra a mano en provider_credits.
// ─────────────────────────────────────────────────────────────────────────────

// Cuántos días hacia atrás re-sincronizar en cada corrida. No alcanza con "ayer":
// ambos proveedores corrigen importes con retraso, así que se pisan los últimos N.
const DAYS_TO_SYNC = 3;

// OJO: la Cost API de Anthropic documenta los importes en CENTAVOS (string
// decimal en "lowest units"). OpenAI los devuelve en DÓLARES. Si no se divide,
// el gasto de Anthropic queda inflado 100x y el saldo se vacía solo.
// Verificar con el dry-run antes de confiar en el número.
const ANTHROPIC_AMOUNT_DIVISOR = 100;
const OPENAI_AMOUNT_DIVISOR = 1;

const MAX_PAGES = 20;

type DailySpend = { day: string; amount_usd: number };

function startOfUtcDay(daysAgo: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d;
}

function toUtcDay(value: any): string | null {
  if (value == null) return null;
  // OpenAI manda unix seconds; Anthropic manda ISO.
  const d = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Lee un importe tolerando number | "12.34" | { value: 12.34 }. */
function readAmount(raw: any): number {
  if (raw == null) return 0;
  if (typeof raw === 'number') return isFinite(raw) ? raw : 0;
  if (typeof raw === 'string') { const n = parseFloat(raw); return isFinite(n) ? n : 0; }
  if (typeof raw === 'object') return readAmount(raw.value ?? raw.amount);
  return 0;
}

/**
 * Recorre los buckets de una respuesta paginada y los colapsa en gasto por día.
 * Sirve para ambos proveedores porque los dos usan la forma
 * { data: [{ <campo de fecha>, results: [...] }], has_more, next_page }.
 */
function collapseBuckets(
  buckets: any[],
  dayField: string,
  divisor: number,
  acc: Map<string, number>
): void {
  for (const bucket of buckets || []) {
    const day = toUtcDay(bucket?.[dayField] ?? bucket?.start_time ?? bucket?.starting_at);
    if (!day) continue;
    let total = 0;
    for (const r of bucket?.results || []) total += readAmount(r?.amount ?? r?.cost);
    acc.set(day, (acc.get(day) || 0) + total / divisor);
  }
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<any> {
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${text.slice(0, 300)}`);
  try { return JSON.parse(text); }
  catch { throw new Error(`Respuesta no-JSON: ${text.slice(0, 300)}`); }
}

// ── Anthropic ────────────────────────────────────────────────────────────────
async function fetchAnthropicSpend(days: number): Promise<{ spend: DailySpend[]; raw: any }> {
  const key = process.env.ANTHROPIC_ADMIN_KEY;
  if (!key) throw new Error('Falta ANTHROPIC_ADMIN_KEY');

  const startingAt = startOfUtcDay(days).toISOString();
  // "ahora", nunca el futuro: pedirle a la Cost API un ending_at posterior al
  // momento actual devuelve HTTP 500 en vez de un error descriptivo.
  const endingAt = new Date().toISOString();
  const headers = {
    'anthropic-version': '2023-06-01',
    'x-api-key': key,
    'User-Agent': 'Wasso-BillingMonitor/1.0',
  };

  const acc = new Map<string, number>();
  let page: string | null = null;
  let firstPage: any = null;

  for (let i = 0; i < MAX_PAGES; i++) {
    const url = new URL('https://api.anthropic.com/v1/organizations/cost_report');
    url.searchParams.set('starting_at', startingAt);
    url.searchParams.set('ending_at', endingAt);
    if (page) url.searchParams.set('page', page);

    const json: any = await fetchJson(url.toString(), headers);
    if (!firstPage) firstPage = json;
    collapseBuckets(json?.data, 'starting_at', ANTHROPIC_AMOUNT_DIVISOR, acc);

    if (!json?.has_more || !json?.next_page) break;
    page = json.next_page;
  }

  return { spend: mapToSpend(acc), raw: firstPage };
}

// ── OpenAI ───────────────────────────────────────────────────────────────────
async function fetchOpenAISpend(days: number): Promise<{ spend: DailySpend[]; raw: any }> {
  const key = process.env.OPENAI_ADMIN_KEY;
  if (!key) throw new Error('Falta OPENAI_ADMIN_KEY');

  const startTime = Math.floor(startOfUtcDay(days).getTime() / 1000);
  // Sin end_time, OpenAI devuelve buckets hacia adelante e incluye días futuros.
  const endTime = Math.floor(Date.now() / 1000);
  const headers = {
    Authorization: `Bearer ${key}`,
    'User-Agent': 'Wasso-BillingMonitor/1.0',
  };

  const acc = new Map<string, number>();
  let page: string | null = null;
  let firstPage: any = null;

  for (let i = 0; i < MAX_PAGES; i++) {
    const url = new URL('https://api.openai.com/v1/organization/costs');
    url.searchParams.set('start_time', String(startTime));
    url.searchParams.set('end_time', String(endTime));
    url.searchParams.set('bucket_width', '1d');
    url.searchParams.set('limit', '31');
    if (page) url.searchParams.set('page', page);

    const json: any = await fetchJson(url.toString(), headers);
    if (!firstPage) firstPage = json;
    collapseBuckets(json?.data, 'start_time', OPENAI_AMOUNT_DIVISOR, acc);

    if (!json?.has_more || !json?.next_page) break;
    page = json.next_page;
  }

  return { spend: mapToSpend(acc), raw: firstPage };
}

function mapToSpend(acc: Map<string, number>): DailySpend[] {
  return Array.from(acc.entries())
    .map(([day, amount]) => ({ day, amount_usd: Math.max(0, Number(amount.toFixed(4))) }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

// ── Persistencia ─────────────────────────────────────────────────────────────
async function upsertSpend(provider: string, spend: DailySpend[]): Promise<number> {
  if (!spend.length) return 0;
  const rows = spend.map((s) => ({
    provider,
    day: s.day,
    amount_usd: s.amount_usd,
    synced_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from('provider_spend_daily')
    .upsert(rows, { onConflict: 'provider,day' });
  if (error) throw new Error(`Supabase upsert: ${error.message}`);
  return rows.length;
}

/**
 * Sincroniza ambos proveedores. No corta si uno falla: interesa más tener el
 * dato de uno que perder los dos por un 401.
 *
 * @param dryRun devuelve lo que traería y la respuesta cruda, sin escribir.
 */
async function syncProviderSpend(dryRun = false, days = DAYS_TO_SYNC): Promise<any> {
  // Ambas APIs topean en 31 buckets diarios.
  const window = Math.max(1, Math.min(31, days));
  const out: any = { dryRun, days: window, providers: {} };

  const jobs: Array<[string, () => Promise<{ spend: DailySpend[]; raw: any }>]> = [
    ['anthropic', () => fetchAnthropicSpend(window)],
    ['openai', () => fetchOpenAISpend(window)],
  ];

  for (const [provider, fetcher] of jobs) {
    try {
      const { spend, raw } = await fetcher();
      const total = spend.reduce((s, x) => s + x.amount_usd, 0);

      if (dryRun) {
        out.providers[provider] = { ok: true, spend, total_usd: total, raw_sample: raw };
      } else {
        const written = await upsertSpend(provider, spend);
        out.providers[provider] = { ok: true, days: written, total_usd: Number(total.toFixed(4)) };
        console.log(`[providerBalance] ${provider}: ${written} días, US$${total.toFixed(4)}`);
      }
    } catch (err: any) {
      out.providers[provider] = { ok: false, error: err.message };
      console.error(`[providerBalance] ${provider} falló: ${err.message}`);
    }
  }

  if (!dryRun) {
    const { data } = await supabase.from('provider_balance').select('*');
    out.balance = data;
    for (const row of data || []) {
      if (row.level === 'critical' || row.level === 'warn') {
        await supabase.from('admin_events').insert({
          event_type: 'provider_balance_low',
          description: `Saldo ${row.level} en ${row.provider}: US$${row.remaining_usd}` +
            (row.days_left != null ? ` (~${row.days_left} días)` : ''),
          metadata: row,
        });
      }
    }
  }

  return out;
}

function startProviderBalanceJob(): void {
  // 08:00 ART. El timezone va explícito: Railway corre en UTC y sin esto
  // el job saldría a las 5 de la mañana.
  cron.schedule('0 8 * * *', async () => {
    console.log('[providerBalance] Sincronizando gasto de proveedores...');
    await syncProviderSpend();
    const { heartbeat } = require('./systemHealth');
    await heartbeat('provider_spend');
  }, { timezone: 'America/Argentina/Buenos_Aires' });
  require('./systemHealth').heartbeat('provider_spend');
  console.log('[providerBalance] Job iniciado — corre 08:00 ART');
}

module.exports = {
  startProviderBalanceJob,
  syncProviderSpend,
  fetchAnthropicSpend,
  fetchOpenAISpend,
  readAmount,
  collapseBuckets,
};
