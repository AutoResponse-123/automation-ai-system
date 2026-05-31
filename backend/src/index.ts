const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const webhookRouter = require('./api/webhooks');
const cronRouter = require('./api/cron');
const adminRouter = require('./api/admin');
const { startRemindersJob } = require('./services/reminders');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

const generalLimiter = rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false });
const webhookLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });

app.use(cors());
app.use(generalLimiter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (_req: any, res: any) => { res.redirect(301, 'https://landing-five-tau-86.vercel.app') })

app.get('/health', (_req: any, res: any) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), environment: process.env.NODE_ENV });
});

app.use('/api/webhooks', webhookLimiter, webhookRouter);
app.use('/api/cron', cronRouter);
app.use('/api/admin', adminRouter);

app.listen(PORT, () => {
  console.log('Server running on http://localhost:' + PORT);
  startRemindersJob();
});
