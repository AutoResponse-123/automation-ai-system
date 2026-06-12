const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const webhookRouter = require('./api/webhooks');
const cronRouter = require('./api/cron');
const adminRouter = require('./api/admin');
const contactRouter = require('./api/contact');
const authRouter = require('./api/auth').default;
const { startRemindersJob } = require('./services/reminders');
const { initLogger, errorHandler } = require('./services/logger');

initLogger();

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

// ── CORS restrictivo ──────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://automation-ai-dashboard.vercel.app',
  'https://automation-ai-system.vercel.app',
  'https://automation-ai-admin.vercel.app',
  'https://landing-five-tau-86.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
];

app.use(cors({
  origin: (origin: string | undefined, callback: Function) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('CORS: origen no permitido'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret', 'x-cron-secret'],
}));

// ── Security headers ──────────────────────────────────────────────────────────
app.use((_req: any, res: any, next: any) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ── Rate limiters ─────────────────────────────────────────────────────────────
const generalLimiter = rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false });
const webhookLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
const contactLimiter = rateLimit({
  windowMs: 60_000 * 60, max: 5, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiados intentos. Esperá 1 hora.' }
});
const signupLimiter = rateLimit({
  windowMs: 60_000 * 60, max: 3, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiados registros desde esta IP. Esperá 1 hora.' }
});

app.use(generalLimiter);
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));

app.get('/', (_req: any, res: any) => { res.redirect(301, 'https://landing-five-tau-86.vercel.app') });

app.get('/health', (_req: any, res: any) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), environment: process.env.NODE_ENV });
});

app.use('/api/webhooks', webhookLimiter, webhookRouter);
app.use('/api/cron', cronRouter);
app.use('/api/admin', adminRouter);
app.use('/api/contact', contactLimiter, contactRouter);
app.use('/api/auth', signupLimiter, authRouter);

// ── Manejo global de errores (al final de las rutas) ────────────────────────────
app.use(errorHandler);

app.listen(PORT, () => {
  console.log('Server running on http://localhost:' + PORT);
  startRemindersJob();
});
