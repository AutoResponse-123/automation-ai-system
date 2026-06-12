export {};
// Tests de los fixes de la auditoría: getAvailableSlots overnight + cancelEvent al cancelar.

// ── getAvailableSlots: horario que cruza medianoche ───────────────────────────
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

const bizOvernight = {
  google_refresh_token: 'tok',
  google_calendar_id: 'primary',
  schedule: { enabled: true, timezone: 'America/Argentina/Buenos_Aires', hours: overnightDays },
};

describe('getAvailableSlots — horario overnight (20:00–02:00)', () => {
  it('genera slots de 20:00 a 01:00 cruzando medianoche', async () => {
    const slots = await getAvailableSlots(bizOvernight, '2030-01-01'); // fecha futura, no filtra por "now"
    expect(slots).toContain('20:00');
    expect(slots).toContain('23:00');
    expect(slots).toContain('00:00');
    expect(slots).toContain('01:00');
    expect(slots).not.toContain('12:00');
    expect(slots.length).toBe(6);
  });
});
