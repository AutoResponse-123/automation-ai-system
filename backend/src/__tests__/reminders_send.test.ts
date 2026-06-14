// Tests de sendPendingReminders:
//  - usa plantilla aprobada (sendWhatsAppTemplate) si hay SID configurado
//  - cae a texto libre (sendWhatsAppMessage) si no hay SID
//  - respeta la ventana de ±30min alrededor de las N horas previas
//  - no reenvía si ya se mandó ese recordatorio (reminders_sent)
//  - usa la plantilla EN para negocios en inglés
export {};

let mockBusinesses: any[] = [];
let mockAppointments: any[] = [];
const mockUpdateEq = jest.fn().mockResolvedValue({ data: null, error: null });
const mockUpdate = jest.fn(() => ({ eq: mockUpdateEq }));

jest.mock('../config/supabase', () => ({
  supabase: {
    from: jest.fn((table: string) => {
      if (table === 'businesses') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({ data: mockBusinesses, error: null })),
          })),
        };
      }
      // appointments
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              gte: jest.fn(() => ({
                lte: jest.fn(() => Promise.resolve({ data: mockAppointments, error: null })),
              })),
            })),
          })),
        })),
        update: mockUpdate,
      };
    }),
  },
}));

const mockSendTemplate = jest.fn().mockResolvedValue({ sid: 'SMtemplate' });
const mockSendMessage = jest.fn().mockResolvedValue({ sid: 'SMtext' });
jest.mock('../services/twilio', () => ({
  sendWhatsAppMessage: (...a: any[]) => mockSendMessage(...a),
  sendWhatsAppTemplate: (...a: any[]) => mockSendTemplate(...a),
}));

jest.mock('node-cron', () => ({ schedule: jest.fn() }));

const { sendPendingReminders } = require('../services/reminders');

const ART = { timezone: 'America/Argentina/Buenos_Aires' };

function makeBusiness(over: any = {}) {
  return {
    id: 'biz_1', name: 'Peluquería Melón', bot_name: 'Wasso', bot_emoji: '🤖',
    language: 'es', reminder_hours_before: [24], phone_whatsapp: '+5491172443409',
    reminders_enabled: true, schedule: ART, ...over,
  };
}

// Turno cuya hora de pared (ART) cae justo 24hs después del "now" fijado abajo.
function makeAppt(over: any = {}) {
  return {
    id: 'appt_1', client_name: 'Juan', client_phone: '+5491111111111',
    appointment_date: '2026-06-13', appointment_time: '09:00:00',
    title: 'Corte', reminders_sent: [], ...over,
  };
}

describe('sendPendingReminders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBusinesses = [];
    mockAppointments = [];
    process.env.TWILIO_ACCOUNT_SID = 'AC_test';
    process.env.TWILIO_AUTH_TOKEN = 'token_test';
    delete process.env.TWILIO_REMINDER_TEMPLATE_ES;
    delete process.env.TWILIO_REMINDER_TEMPLATE_EN;
    // now = 09:00 ART (12:00 UTC) del 12-jun; +24hs => 09:00 ART del 13-jun
    jest.useFakeTimers().setSystemTime(new Date('2026-06-12T12:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('usa la plantilla ES con las variables correctas si hay SID', async () => {
    process.env.TWILIO_REMINDER_TEMPLATE_ES = 'HXtest_es';
    mockBusinesses = [makeBusiness()];
    mockAppointments = [makeAppt()];

    await sendPendingReminders();

    expect(mockSendTemplate).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).not.toHaveBeenCalled();
    const call = mockSendTemplate.mock.calls[0];
    expect(call[0]).toBe('+5491111111111');        // to
    expect(call[1]).toBe('HXtest_es');             // contentSid
    expect(call[2]['1']).toBe('Juan');             // var 1: nombre
    expect(call[2]['2']).toBe('Corte');            // var 2: título
    expect(call[2]['3']).toBe('Peluquería Melón'); // var 3: negocio
    expect(call[2]['5']).toBe('09:00');            // var 5: hora
    expect(call[5]).toBe('+5491172443409');        // from del negocio
  });

  it('cae a texto libre si no hay SID de plantilla', async () => {
    mockBusinesses = [makeBusiness()];
    mockAppointments = [makeAppt()];

    await sendPendingReminders();

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendTemplate).not.toHaveBeenCalled();
    expect(mockSendMessage.mock.calls[0][1]).toContain('Corte'); // el body menciona el turno
  });

  it('marca reminders_sent tras enviar', async () => {
    mockBusinesses = [makeBusiness()];
    mockAppointments = [makeAppt()];

    await sendPendingReminders();

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ reminder_sent: true, reminders_sent: [24] })
    );
  });

  it('NO reenvía si ya se mandó ese recordatorio', async () => {
    mockBusinesses = [makeBusiness()];
    mockAppointments = [makeAppt({ reminders_sent: [24] })];

    await sendPendingReminders();

    expect(mockSendTemplate).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('NO envía si el turno cae fuera de la ventana de ±30min', async () => {
    mockBusinesses = [makeBusiness()];
    // 20:00 ART (23:00 UTC) del 13-jun: muy lejos de la ventana ~12:00 UTC
    mockAppointments = [makeAppt({ appointment_time: '20:00:00' })];

    await sendPendingReminders();

    expect(mockSendTemplate).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('usa la plantilla EN para negocios en inglés', async () => {
    process.env.TWILIO_REMINDER_TEMPLATE_EN = 'HXtest_en';
    mockBusinesses = [makeBusiness({ language: 'en' })];
    mockAppointments = [makeAppt()];

    await sendPendingReminders();

    expect(mockSendTemplate).toHaveBeenCalledTimes(1);
    expect(mockSendTemplate.mock.calls[0][1]).toBe('HXtest_en');
  });
});
