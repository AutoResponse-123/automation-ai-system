const express = require('express');
const cors = require('cors');
require('dotenv').config();
const webhookRouter = require('./api/webhooks');
const { startRemindersJob } = require('./services/reminders');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req: any, res: any) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

app.use('/api/webhooks', webhookRouter);

app.listen(PORT, () => {
  console.log('Server running on http://localhost:' + PORT);
  console.log('Health check: http://localhost:' + PORT + '/health');
  console.log('Webhook: http://localhost:' + PORT + '/api/webhooks/whatsapp');
  startRemindersJob();
});
