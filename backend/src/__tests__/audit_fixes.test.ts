export {};
// getAvailableSlots: horario overnight + modos de duración (fijo por defecto / por servicio).

const mockFreebusy = jest.fn().mockResolvedValue({ data: { calendars: { primary: { busy: [] } } } });
jest.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: jest.fn().mockImplementation(() => ({ setCredentials: jest.fn(), generateAuthUrl: jest.fn() })) },
    calendar: jest.fn().mockReturnValue({
      freebusy: { query: mockFreebusy },
      events: { insert: jest.fn(), delete: jest.fn() },
    }),
  },
}));
jest.mock('../config/supabase', () => ({ supabase: { from: jest.fn() } }));

const { getAvailableSlots } = require('../services/calendar');

const overnightDays = ['lunes','martes','miércoles','jueves','viernes','sábado','domingo']
  .reduce((acc: any, d: string) => { acc[d] = { open: '20:00', close: '02:00' }; return acc; }, {});

function biz(extraSchedule: any = {}) {
  return {
    google_refresh_token: 'tok',
    google_calendar_id: 'primary',
    schedule: { enabled: true, timezone: 'America/Argentina/Buenos_Aires', hours: overnightDays, ...extraSchedule },
  };
}

describe('getAvailableSlots — overnight (20:00–02:00)', () => {
  it('DEFAULT (duración fija 1h): turnos cada 1 hora → 6 slots', async () => {
    const slots = await getAvailableSlots(biz(), '2030-01-01', 40); // pasa duración, pero en modo fijo se ignora
    expect(slots).toContain('20:00');
    expect(slots).toContain('23:00');
    expect(slots).toContain('00:00');
    expect(slots).toContain('01:00');
    expect(slots).not.toContain('20:20'); // modo fijo: sin grilla de 20
    expect(slots).not.toContain('12:00');
    expect(slots.length).toBe(6);
  });

  it('modo por servicio (grilla 20, servicio 60): respeta la grilla → 16 slots', async () => {
    const slots = await getAvailableSlots(biz({ slot_mode: 'per_service', slot_step: 20 }), '2030-01-01', 60);
    expect(slots).toContain('20:00');
    expect(slots).toContain('20:20');
    expect(slots).toContain('01:00');
    expect(slots).not.toContain('01:20'); // 01:20 + 60 = 02:20 > cierre
    expect(slots.length).toBe(16);
  });

  it('modo por servicio (servicio 40): más horarios, llega a 01:20 → 17 slots', async () => {
    const slots = await getAvailableSlots(biz({ slot_mode: 'per_service', slot_step: 20 }), '2030-01-01', 40);
    expect(slots).toContain('01:20'); // 01:20 + 40 = 02:00
    expect(slots.length).toBe(17);
  });
});
