// ── Mocks globales — deben estar ANTES de cualquier require ───────────────────

const mockBusiness = {
  id: 'biz_123', name: 'Test Business', bot_name: 'TestBot', bot_emoji: '🤖',
  tone: 'amigable', language: 'es', is_active: true, plan: 'pro',
  trial_ends_at: null, phone_whatsapp: '+14155238886', escalation_email: 'test@test.com',
  escalation_keywords: ['urgente'], forbidden_words: [], closing_phrases: [],
  max_messages_before_escalation: 10, max_tokens: 600, google_refresh_token: null,
  mp_access_token: null, appointment_categories: [], schedule: { enabled: false },
}

const mockSupabaseChain = (returnData: any = null) => {
  const chain: any = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    in: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: returnData, error: returnData ? null : { message: 'not found' } }),
    head: jest.fn().mockReturnThis(),
  }
  chain.count = jest.fn().mockResolvedValue({ count: 0, error: null })
  return chain
}

jest.mock('../config/supabase', () => ({
  supabase: {
    from: jest.fn((table: string) => {
      if (table === 'businesses') {
        const c = mockSupabaseChain(mockBusiness)
        // getBusinessByPhone ahora usa .in(...).limit(1) y lee un array
        c.limit = jest.fn().mockResolvedValue({ data: [mockBusiness], error: null })
        return c
      }
      if (table === 'contacts') return mockSupabaseChain({ id: 'contact_123', summary: null })
      if (table === 'conversations') return {
        ...mockSupabaseChain({ id: 'conv_123' }),
        insert: jest.fn().mockReturnThis(),
      }
      if (table === 'messages') return {
        ...mockSupabaseChain(null),
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
        single: jest.fn().mockResolvedValue({ data: { id: 'msg_1' }, error: null }),
      }
      if (table === 'appointments') return {
        ...mockSupabaseChain(null),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      }
      return mockSupabaseChain(null)
    }),
    channel: jest.fn().mockReturnValue({ on: jest.fn().mockReturnThis(), subscribe: jest.fn() }),
  },
}))

jest.mock('../services/claude', () => ({
  callClaude: jest.fn().mockResolvedValue({ text: 'Hola, soy el bot', tokens: 100 }),
}))

jest.mock('../services/twilio', () => ({
  sendWhatsAppMessage: jest.fn().mockResolvedValue({ sid: 'SM123' }),
}))

jest.mock('../services/email', () => ({
  sendEscalationEmail: jest.fn().mockResolvedValue(undefined),
  sendCancellationEmail: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../services/calendar', () => ({
  getAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/mock'),
  saveTokens: jest.fn().mockResolvedValue(undefined),
  getAvailableSlots: jest.fn().mockResolvedValue(['10:00', '11:00']),
  createEvent: jest.fn().mockResolvedValue('event_123'),
}))

jest.mock('../services/sheets', () => ({
  getSheetsAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/mock'),
  saveSheetsTokens: jest.fn().mockResolvedValue(undefined),
  exportToSheets: jest.fn().mockResolvedValue('https://sheets.google.com/mock'),
}))

jest.mock('../services/summary', () => ({
  sendDailySummaries: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../services/mercadopago', () => ({
  createPaymentLink: jest.fn().mockResolvedValue({ url: 'https://mp.com/pay/123' }),
}))

jest.mock('twilio', () => {
  const mock: any = jest.fn().mockReturnValue({
    messages: { create: jest.fn().mockResolvedValue({ sid: 'SM123' }) },
  })
  mock.twiml = { MessagingResponse: jest.fn().mockImplementation(() => ({
    message: jest.fn(),
    toString: jest.fn().mockReturnValue('<Response><Message>ok</Message></Response>'),
  })) }
  mock.validateRequest = jest.fn().mockReturnValue(true)
  return mock
})

jest.mock('resend', () => ({ Resend: jest.fn().mockImplementation(() => ({
  emails: { send: jest.fn().mockResolvedValue({ id: 'email_123' }) },
})) }))

// ── Setup de la app ───────────────────────────────────────────────────────────

import express from 'express'
import request from 'supertest'

process.env.TWILIO_AUTH_TOKEN = 'test_token' // token presente; validateRequest está mockeado a true

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
const webhookRouter = require('../api/webhooks')
app.use('/api/webhooks', webhookRouter)

// ── Tests de utils ────────────────────────────────────────────────────────────

describe('checkEscalation', () => {
  const { checkEscalation } = require('../utils')
  it('detecta keyword exacta', () => expect(checkEscalation('quiero hablar urgente', ['urgente'])).toBe(true))
  it('es case-insensitive', () => expect(checkEscalation('URGENTE', ['urgente'])).toBe(true))
  it('retorna false sin keywords', () => expect(checkEscalation('hola', [])).toBe(false))
  it('retorna false sin match', () => expect(checkEscalation('hola cómo estás', ['cancelar'])).toBe(false))
})

describe('isOutsideHours', () => {
  const { isOutsideHours } = require('../utils')
  it('retorna false si no está habilitado', () => expect(isOutsideHours(null)).toBe(false))
  it('retorna false si enabled=false', () => expect(isOutsideHours({ enabled: false })).toBe(false))
  it('retorna boolean sin explotar', () => {
    const result = isOutsideHours({ enabled: true, timezone: 'UTC', hours: {} })
    expect(typeof result).toBe('boolean')
  })
})

describe('buildSystemPrompt', () => {
  const { buildSystemPrompt } = require('../utils')
  const biz = { name: 'Test', bot_name: 'Bot', bot_emoji: '🤖', tone: 'amigable', language: 'es' }
  it('incluye nombre del bot', () => expect(buildSystemPrompt(biz)).toContain('Bot'))
  it('incluye summary si se pasa', () => expect(buildSystemPrompt(biz, 'cliente VIP')).toContain('cliente VIP'))
  it('no incluye historial si no hay summary', () => expect(buildSystemPrompt(biz)).not.toContain('Historial'))
  it('incluye Calendar si hay token', () => expect(buildSystemPrompt({ ...biz, google_refresh_token: 'tok' })).toContain('get_available_slots'))
})

// ── Tests de webhook ──────────────────────────────────────────────────────────

describe('POST /api/webhooks/whatsapp', () => {
  it('responde 200 con mensaje del bot', async () => {
    const res = await request(app)
      .post('/api/webhooks/whatsapp')
      .send({ Body: 'Hola', From: 'whatsapp:+5491123456789', To: 'whatsapp:+14155238886' })
    expect(res.status).toBe(200)
  })

  it('ignora mensajes vacíos (delivery receipts)', async () => {
    const res = await request(app)
      .post('/api/webhooks/whatsapp')
      .send({ Body: '', From: 'whatsapp:+5491123456789', To: 'whatsapp:+14155238886', NumMedia: '0' })
    expect(res.status).toBe(200)
  })
})

describe('POST /api/webhooks/appointments/:id/cancel', () => {
  it('retorna 404 si el turno no existe', async () => {
    const { supabase } = require('../config/supabase')
    supabase.from.mockReturnValueOnce(mockSupabaseChain(null))
    const res = await request(app).post('/api/webhooks/appointments/nonexistent/cancel')
    expect([404, 500]).toContain(res.status)
  })
})

describe('POST /api/webhooks/send-manual', () => {
  it('retorna 400 si faltan campos', async () => {
    const res = await request(app).post('/api/webhooks/send-manual').send({})
    expect(res.status).toBe(400)
  })
})
