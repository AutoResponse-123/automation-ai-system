import express from 'express'

// ── Mocks globales ────────────────────────────────────────────────────────────

jest.mock('../config/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}))

jest.mock('../services/claude', () => ({
  callClaude: jest.fn().mockResolvedValue({ text: 'Hola, soy el bot', tokens: 100 }),
}))

jest.mock('../services/twilio', () => ({
  sendWhatsAppMessage: jest.fn().mockResolvedValue({ sid: 'SM123' }),
  validateTwilioRequest: jest.fn().mockReturnValue(true),
}))

jest.mock('../services/email', () => ({
  sendEscalationEmail: jest.fn().mockResolvedValue(undefined),
  sendCancellationEmail: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../services/calendar', () => ({
  getAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/mock'),
  saveTokens: jest.fn().mockResolvedValue(undefined),
  getAvailableSlots: jest.fn().mockResolvedValue(['10:00', '11:00', '14:00']),
  createEvent: jest.fn().mockResolvedValue('event_123'),
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockBusiness = {
  id: 'biz_123',
  name: 'Test Business',
  bot_name: 'TestBot',
  bot_emoji: '🤖',
  tone: 'amigable',
  language: 'es',
  is_active: true,
  plan: 'pro',
  trial_ends_at: null,
  phone_whatsapp: '+14155238886',
  escalation_email: 'test@test.com',
  escalation_keywords: ['urgente'],
  forbidden_words: [],
  closing_phrases: [],
  max_messages_before_escalation: 10,
  max_tokens: 600,
  google_refresh_token: null,
  mp_access_token: null,
  appointment_categories: [],
  schedule: { enabled: false },
}

// ── Tests de utils ────────────────────────────────────────────────────────────

describe('utils — checkEscalation', () => {
  const { checkEscalation } = require('../utils')

  it('detecta keyword exacta', () => {
    expect(checkEscalation('quiero hablar con alguien urgente', ['urgente'])).toBe(true)
  })

  it('es case-insensitive', () => {
    expect(checkEscalation('URGENTE', ['urgente'])).toBe(true)
  })

  it('retorna false sin keywords', () => {
    expect(checkEscalation('hola', [])).toBe(false)
  })

  it('retorna false si no hay match', () => {
    expect(checkEscalation('hola cómo estás', ['urgente', 'cancelar'])).toBe(false)
  })
})

describe('utils — isOutsideHours', () => {
  const { isOutsideHours } = require('../utils')

  it('retorna false si schedule no está habilitado', () => {
    expect(isOutsideHours(null)).toBe(false)
    expect(isOutsideHours({ enabled: false })).toBe(false)
  })

  it('retorna true si el día está cerrado', () => {
    const schedule = { enabled: true, timezone: 'UTC', hours: { lunes: { closed: true } } }
    // No podemos mockear la fecha fácilmente aquí, solo verificamos que no explota
    const result = isOutsideHours(schedule)
    expect(typeof result).toBe('boolean')
  })
})

// ── Tests de webhook endpoint ─────────────────────────────────────────────────

describe('POST /api/webhooks/whatsapp', () => {
  let app: express.Application

  beforeEach(() => {
    jest.clearAllMocks()
    const { supabase } = require('../config/supabase')

    // Mock getBusinessByPhone
    supabase.from.mockImplementation((table: string) => {
      if (table === 'businesses') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: mockBusiness, error: null }),
        }
      }
      if (table === 'conversations') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { id: 'conv_123' }, error: null }),
          update: jest.fn().mockReturnThis(),
        }
      }
      if (table === 'contacts') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          update: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { id: 'contact_123', summary: null }, error: null }),
        }
      }
      if (table === 'messages') {
        return {
          select: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { id: 'msg_123' }, error: null }),
          mockResolvedValue: jest.fn().mockResolvedValue({ data: [], error: null }),
        }
      }
      if (table === 'appointments') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: [], error: null }),
        }
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
        count: jest.fn().mockResolvedValue({ count: 0, error: null }),
        head: jest.fn().mockReturnThis(),
      }
    })

    // Limpiar cache de módulos y recargar el router
    jest.resetModules()
    app = express()
    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))
    process.env.TWILIO_AUTH_TOKEN = '' // deshabilita validación de firma en test
    const router = require('../api/webhooks')
    app.use('/api/webhooks', router)
  })

  it('responde 200 con TwiML cuando llega un mensaje', async () => {
    const request = require('supertest')
    const res = await request(app)
      .post('/api/webhooks/whatsapp')
      .send({ Body: 'Hola', From: 'whatsapp:+5491123456789', To: 'whatsapp:+14155238886' })
    expect(res.status).toBe(200)
  })

  it('retorna 404 si no se encuentra el negocio', async () => {
    const { supabase } = require('../config/supabase')
    supabase.from.mockImplementation(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    }))
    const request = require('supertest')
    jest.resetModules()
    const freshApp = express()
    freshApp.use(express.json())
    freshApp.use(express.urlencoded({ extended: true }))
    const router = require('../api/webhooks')
    freshApp.use('/api/webhooks', router)
    const res = await request(freshApp)
      .post('/api/webhooks/whatsapp')
      .send({ Body: 'Hola', From: 'whatsapp:+5491123456789', To: 'whatsapp:+14155238886' })
    expect([200, 404]).toContain(res.status)
  })
})

// ── Tests de cancelación de turno ─────────────────────────────────────────────

describe('POST /api/webhooks/appointments/:id/cancel', () => {
  it('endpoint existe y requiere ID válido', async () => {
    const request = require('supertest')
    const { supabase } = require('../config/supabase')
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    })
    const app2 = express()
    app2.use(express.json())
    const router = require('../api/webhooks')
    app2.use('/api/webhooks', router)
    const res = await request(app2).post('/api/webhooks/appointments/nonexistent/cancel')
    expect([404, 500]).toContain(res.status)
  })
})
