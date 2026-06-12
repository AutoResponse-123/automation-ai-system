// Tests del loop de tool-use de callClaude — foco en create_appointment en conversación nueva.

const mockCreate = jest.fn()
const mockApptInsert = jest.fn().mockResolvedValue({ error: null })

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}))

jest.mock('../config/supabase', () => ({
  supabase: {
    from: jest.fn((table: string) => {
      if (table === 'contacts') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: { id: 'contact_1' }, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'appointments') {
        return { insert: mockApptInsert }
      }
      return {}
    }),
  },
}))

jest.mock('../services/calendar', () => ({
  getAvailableSlots: jest.fn().mockResolvedValue(['14:00', '15:00']),
  createEvent: jest.fn().mockResolvedValue('event_123'),
  isSlotFree: jest.fn().mockResolvedValue(true),
}))

jest.mock('../services/mercadopago', () => ({ createPaymentLink: jest.fn() }))
jest.mock('../services/email', () => ({ sendCancellationEmail: jest.fn() }))

const { callClaude } = require('../services/claude')

const business = {
  id: 'biz_1',
  name: 'Barbería Centro',
  google_refresh_token: 'tok',
  mp_access_token: null,
  appointment_categories: [],
}

beforeEach(() => {
  mockCreate.mockReset()
  mockApptInsert.mockClear()
  const { isSlotFree } = require('../services/calendar')
  isSlotFree.mockResolvedValue(true)
})

describe('callClaude — create_appointment en conversación nueva', () => {
  it('agenda el turno y aplica el piso de 1000 tokens aunque el negocio tenga 300', async () => {
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        usage: { output_tokens: 20 },
        content: [
          {
            type: 'tool_use',
            id: 'tu_1',
            name: 'create_appointment',
            input: { title: 'Corte', date: '2026-06-20', time: '14:00', client_name: 'Juan', duration_minutes: 30 },
          },
        ],
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        usage: { output_tokens: 30 },
        content: [{ type: 'text', text: 'Listo Juan, tu turno quedó confirmado.' }],
      })

    const res = await callClaude(
      [{ role: 'user', content: 'Quiero un corte el 20 a las 14, soy Juan' }],
      'system',
      300, // max_tokens bajo del negocio
      business,
      '+5491100000000'
    )

    // El turno se insertó en appointments
    expect(mockApptInsert).toHaveBeenCalledTimes(1)
    const inserted = mockApptInsert.mock.calls[0][0]
    expect(inserted).toMatchObject({
      business_id: 'biz_1',
      title: 'Corte',
      appointment_date: '2026-06-20',
      appointment_time: '14:00:00',
      client_name: 'Juan',
      client_phone: '+5491100000000',
    })

    // El piso de 1000 tokens se aplicó (no quedó en 300) — este es el "fix min tokens"
    expect(mockCreate.mock.calls[0][0].max_tokens).toBeGreaterThanOrEqual(1000)

    // Respuesta final y suma de tokens
    expect(res.text).toContain('confirmado')
    expect(res.tokens).toBe(50)
  })

  it('NO agenda si el slot ya está ocupado', async () => {
    const { isSlotFree } = require('../services/calendar')
    isSlotFree.mockResolvedValueOnce(false)

    mockCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        usage: { output_tokens: 10 },
        content: [
          {
            type: 'tool_use',
            id: 'tu_2',
            name: 'create_appointment',
            input: { title: 'Corte', date: '2026-06-20', time: '14:00', client_name: 'Juan' },
          },
        ],
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        usage: { output_tokens: 10 },
        content: [{ type: 'text', text: 'Ese horario ya no está disponible, ¿querés otro?' }],
      })

    const res = await callClaude(
      [{ role: 'user', content: 'Corte el 20 a las 14' }],
      'system',
      300,
      business,
      '+5491100000000'
    )

    expect(mockApptInsert).not.toHaveBeenCalled()
    expect(res.text).toContain('disponible')
  })

  it('sin calendar ni MP no manda tools y respeta el max_tokens del negocio', async () => {
    mockCreate.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      usage: { output_tokens: 15 },
      content: [{ type: 'text', text: 'Hola! ¿En qué te ayudo?' }],
    })

    const bizSinIntegraciones = { id: 'biz_2', name: 'Negocio', google_refresh_token: null, mp_access_token: null }
    await callClaude([{ role: 'user', content: 'Hola' }], 'system', 300, bizSinIntegraciones, '+5491100000000')

    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.tools).toBeUndefined()
    expect(callArgs.max_tokens).toBe(300)
  })
})
