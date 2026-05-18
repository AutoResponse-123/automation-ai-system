import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import webhookRouter from './api/webhooks';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// Webhooks
app.use('/api/webhooks', webhookRouter);

// Start server
app.listen(PORT, () => {
  console.log('Server running on http://localhost:' + PORT);
  console.log('Health check: http://localhost:' + PORT + '/health');
  console.log('Webhook: http://localhost:' + PORT + '/api/webhooks/whatsapp');
});