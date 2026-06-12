// Tests del fix de timezone en autoCompleteAppointments:
// los turnos se completan según la hora de pared del negocio, no la hora UTC del server.
export {};

const mockIn = jest.fn().mockResolvedValue({ data: null, error: null });
const mockUpdate = jest.fn(() => ({ in: mockIn }));
let selectResult: any = { data: [], error: null };

jest.mock('../config/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          lte: jest.fn(() => Promise.resolve(selectResult)),
        })),
      })),
      update: mockUpdate,
    })),
  },
}));

jest.mock('./../services/twilio', () => ({
  sendWhatsAppMessage: jest.fn(),
  sendWhatsAppTemplate: jest.fn(),
}));

jest.mock('node-cron', () => ({ schedule: jest.fn() }));

const { autoCompleteAppointments } = require('../services/reminders');

const ART = { schedule: { timezone: 'America/Argentina/Buenos_Aires' } };

function isoDateUtc(d: Date) {
  return d.toISOString().split('T')[0];
}

describe('autoCompleteAppointments (tz-aware)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('NO completa un turno de esta noche aunque en UTC ya sea "mañana"', async () => {
    // Simula: son las 00:30 UTC (21:30 ART del día anterior), turno hoy ART a las 23:00.
    jest.useFakeTimers().setSystemTime(new Date('2026-06-13T00:30:00Z'));
    const fechaPared = '2026-06-12'; // todavía es 12-jun en ART
    selectResult = {
      data: [{ id: 'a1', appointment_date: fechaPared, appointment_time: '23:00:00', businesses: ART }],
      error: null,
    };
    await autoCompleteAppointments();
    expect(mockUpdate).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('SÍ completa un turno cuya hora de pared ya pasó', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-13T00:30:00Z')); // 21:30 ART del 12-jun
    selectResult = {
      data: [
        { id: 'a1', appointment_date: '2026-06-12', appointment_time: '20:00:00', businesses: ART }, // pasó (20:00 ART)
        { id: 'a2', appointment_date: '2026-06-12', appointment_time: '23:00:00', businesses: ART }, // no pasó
      ],
      error: null,
    };
    await autoCompleteAppointments();
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'completed' });
    expect(mockIn).toHaveBeenCalledWith('id', ['a1']);
    jest.useRealTimers();
  });

  it('sin turnos candidatos no toca nada', async () => {
    selectResult = { data: [], error: null };
    await autoCompleteAppointments();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('usa ART por defecto si el negocio no tiene timezone', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-13T01:00:00Z')); // 22:00 ART del 12-jun
    selectResult = {
      data: [{ id: 'a1', appointment_date: '2026-06-12', appointment_time: '22:30:00', businesses: { schedule: {} } }],
      error: null,
    };
    await autoCompleteAppointments();
    expect(mockUpdate).not.toHaveBeenCalled(); // 22:30 ART todavía no pasó
    jest.useRealTimers();
  });
});
