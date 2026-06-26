export {};
// Verifica que al cancelar/reprogramar un turno se borra el evento de Google Calendar (cancelEvent).

const mockCreate = jest.fn();
const mockCancelEvent = jest.fn().mockResolvedValue(true);
const appt = { id: 'a1', google_event_id: 'evt_1', title: 'Corte', appointment_date: '2030-01-01', appointment_time: '14:00:00', client_name: 'Juan' };

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ messages: { create: mockCreate } })),
}));

jest.mock('../config/supabase', () => {
  const chain: any = {
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({ data: [{ id: 'a1', google_event_id: 'evt_1', title: 'Corte', appointment_date: '2030-01-01', appointment_time: '14:00:00', client_name: 'Juan' }] }),
  };
  return { supabase: { from: jest.fn(() => chain) } };
});

jest.mock('../services/calendar', () => ({
  getAvailableSlots: jest.fn(),
  createEvent: jest.fn(),
  isSlotFree: jest.fn(),
  cancelEvent: mockCancelEvent,
  resolveSlot: jest.fn((_b: any, m?: number) => ({ mode: 'fixed', duration: m || 60, step: 60, buffer: 0 })),
  isInvalidGrant: jest.fn(() => false),
  clearCalendarToken: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/mercadopago', () => ({ createPaymentLink: jest.fn() }));
jest.mock('../services/email', () => ({ sendCancellationEmail: jest.fn() }));

const { callClaude } = require('../services/claude');

const business = { id: 'biz_1', name: 'Barbería', plan: 'pro', google_refresh_token: 'tok', mp_access_token: null, escalation_email: 'x@y.com', bot_name: 'Bot' };

beforeEach(() => { mockCreate.mockReset(); mockCancelEvent.mockClear(); });

it('cancel_appointment borra el evento de Google Calendar', async () => {
  mockCreate
    .mockResolvedValueOnce({
      stop_reason: 'tool_use', usage: { output_tokens: 10 },
      content: [{ type: 'tool_use', id: 'tu_1', name: 'cancel_appointment', input: { reason: 'no puedo ir' } }],
    })
    .mockResolvedValueOnce({
      stop_reason: 'end_turn', usage: { output_tokens: 10 },
      content: [{ type: 'text', text: 'Listo, cancelé tu turno.' }],
    });

  const res = await callClaude([{ role: 'user', content: 'cancelá mi turno' }], 'sys', 300, business, '+5491100000000');

  expect(mockCancelEvent).toHaveBeenCalledTimes(1);
  expect(mockCancelEvent).toHaveBeenCalledWith(business, 'evt_1');
  expect(res.text).toContain('cancelé');
});
