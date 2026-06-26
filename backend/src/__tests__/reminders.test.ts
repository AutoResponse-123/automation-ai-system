export {};
// Regresión: los recordatorios de turnos de la tarde/noche no deben perderse por el desfasaje
// entre appointment_date (hora LOCAL del negocio) y la ventana de búsqueda calculada en UTC.

const mockSendText = jest.fn().mockResolvedValue({ sid: 'SM_test' });
const mockSendTemplate = jest.fn().mockResolvedValue({ sid: 'SM_tmpl' });
const mockApptUpdate = jest.fn().mockResolvedValue({ error: null });

const APPT = {
  id: 'appt_noche', client_name: 'Martín', client_phone: '+5491156095323',
  appointment_date: '2026-06-26', appointment_time: '21:33:00', title: 'Corte', reminders_sent: [],
};

jest.mock('../config/supabase', () => ({
  supabase: {
    from: jest.fn((table: string) => {
      if (table === 'businesses') {
        const chain: any = {
          select: () => chain,
          eq: () => Promise.resolve({
            data: [{
              id: 'biz_1', name: 'Barbería', bot_emoji: '✂', language: 'es',
              reminder_hours_before: [1], phone_whatsapp: '+5491172443409',
              schedule: { timezone: 'America/Argentina/Buenos_Aires' },
              reminders_enabled: true, plan: 'enterprise',
            }],
            error: null,
          }),
        };
        return chain;
      }
      if (table === 'appointments') {
        let gteDate = '0000-00-00';
        let lteDate = '9999-99-99';
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          gte: (_col: string, v: string) => { gteDate = v; return chain; },
          lte: (_col: string, v: string) => {
            lteDate = v;
            // Simula el filtro real de la DB: el turno aparece solo si su fecha LOCAL cae en el rango.
            const inRange = APPT.appointment_date >= gteDate && APPT.appointment_date <= lteDate;
            return Promise.resolve({ data: inRange ? [APPT] : [], error: null });
          },
          update: () => ({ eq: mockApptUpdate }),
        };
        return chain;
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
    }),
  },
}));

jest.mock('../services/twilio', () => ({
  sendWhatsAppMessage: mockSendText,
  sendWhatsAppTemplate: mockSendTemplate,
}));

jest.mock('../services/calendar', () => ({
  // UTC-3 fijo (AR no usa DST) — suficiente para el test.
  wallTimeToUtc: (date: string, time: string) => new Date(`${date}T${time.slice(0, 5)}:00-03:00`),
}));

const { sendPendingReminders } = require('../services/reminders');

describe('sendPendingReminders — turnos de la noche (timezone)', () => {
  beforeEach(() => { mockSendText.mockClear(); mockSendTemplate.mockClear(); mockApptUpdate.mockClear(); });

  it('envía el recordatorio de 1h aunque la ventana UTC caiga en otro día que la fecha local del turno', async () => {
    // 20:33 en Buenos Aires = 23:33 UTC. "ahora + 1h" = 00:33 UTC del día SIGUIENTE.
    jest.useFakeTimers().setSystemTime(new Date('2026-06-26T23:33:00Z'));
    try {
      await sendPendingReminders();
    } finally {
      jest.useRealTimers();
    }
    expect(mockSendText).toHaveBeenCalledTimes(1);
    expect(mockSendText.mock.calls[0][0]).toBe('+5491156095323');
    expect(mockApptUpdate).toHaveBeenCalledTimes(1);
  });
});
