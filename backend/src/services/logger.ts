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

// Inicializa Sentry al arrancar y engancha errores globales del proceso.
// Llamar una vez en index.ts.
export function initLogger() {
  getSentry(); // fuerza el init temprano si hay SENTRY_DSN
  process.on('unhandledRejection', (reason: any) => {
    captureError(reason, 'unhandledRejection');
  });
  process.on('uncaughtException', (err: any) => {
    captureError(err, 'uncaughtException');
  });
}

// Middleware de manejo de errores de Express — va al final de las rutas.
export function errorHandler(err: any, _req: any, res: any, _next: any) {
  captureError(err, 'express');
  if (res.headersSent) return;
  res.status(err?.status || 500).json({ error: 'Error interno del servidor' });
}
