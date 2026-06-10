export {};

let sentry: any = null;
let initialized = false;

function getSentry() {
  if (initialized) return sentry;
  initialized = true;
  if (process.env.SENTRY_DSN) {
    try {
      sentry = require('@sentry/node');
      sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || 'production' });
      console.log('[logger] Sentry inicializado');
    } catch {
      console.warn('[logger] SENTRY_DSN seteado pero @sentry/node no instalado — corré: npm install @sentry/node');
      sentry = null;
    }
  }
  return sentry;
}

// Reporta un error a Sentry (si está configurado) y siempre lo loguea por consola.
export function captureError(err: any, tag?: string, extra?: any) {
  const s = getSentry();
  if (s) {
    try {
      s.captureException(err instanceof Error ? err : new Error(String(err)), extra ? { extra } : undefined);
    } catch { /* nunca romper por el logger */ }
  }
  console.error(tag ? `[${tag}]` : '[error]', err?.message || err);
}
