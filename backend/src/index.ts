const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const webhookRouter = require('./api/webhooks');
const { startRemindersJob } = require('./services/reminders');

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting: max 300 req/min general, 120 en webhook
const generalLimiter = rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false });
const webhookLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });

app.use(cors());
app.use(generalLimiter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req: any, res: any) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

app.use('/api/webhooks', webhookLimiter, webhookRouter);

app.listen(PORT, () => {
  console.log('Server running on http://localhost:' + PORT);
  console.log('Health check: http://localhost:' + PORT + '/health');
  console.log('Webhook: http://localhost:' + PORT + '/api/webhooks/whatsapp');
  startRemindersJob();
});
