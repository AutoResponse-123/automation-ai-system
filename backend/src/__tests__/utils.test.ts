import { buildSystemPrompt, checkEscalation, isOutsideHours } from '../utils';

// ─── checkEscalation ──────────────────────────────────────────────────────────

describe('checkEscalation', () => {
  it('devuelve false si no hay keywords', () => {
    expect(checkEscalation('quiero hablar con un humano', [])).toBe(false);
    expect(checkEscalation('quiero hablar con un humano', null as any)).toBe(false);
  });

  it('devuelve true si el mensaje contiene una keyword', () => {
    expect(checkEscalation('quiero hablar con un humano', ['humano', 'urgente'])).toBe(true);
  });

  it('es case-insensitive', () => {
    expect(checkEscalation('URGENTE necesito ayuda', ['urgente'])).toBe(true);
  });

  it('devuelve false si no hay coincidencia', () => {
    expect(checkEscalation('hola buenas tardes', ['urgente', 'cancelar'])).toBe(false);
  });
});

// ─── isOutsideHours ───────────────────────────────────────────────────────────

describe('isOutsideHours', () => {
  it('devuelve false si schedule no está habilitado', () => {
    expect(isOutsideHours(null)).toBe(false);
    expect(isOutsideHours({ enabled: false })).toBe(false);
  });

  it('devuelve true si el día está cerrado', () => {
    // Mock de fecha: lunes
    const realDate = global.Date;
    const mockDate = new Date('2024-01-15T12:00:00Z'); // lunes
    jest.spyOn(global, 'Date').mockImplementation((...args: any[]) =>
      args.length ? new realDate(...(args as [any])) : mockDate
    );

    const schedule = {
      enabled: true,
      timezone: 'UTC',
      hours: { lunes: { closed: true } },
    };
    expect(isOutsideHours(schedule)).toBe(true);
    jest.restoreAllMocks();
  });

  it('devuelve false si no hay config para el día', () => {
    const realDate = global.Date;
    const mockDate = new Date('2024-01-15T12:00:00Z');
    jest.spyOn(global, 'Date').mockImplementation((...args: any[]) =>
      args.length ? new realDate(...(args as [any])) : mockDate
    );

    const schedule = {
      enabled: true,
      timezone: 'UTC',
      hours: {}, // sin config para el día
    };
    expect(isOutsideHours(schedule)).toBe(false);
    jest.restoreAllMocks();
  });
});

// ─── buildSystemPrompt ────────────────────────────────────────────────────────

describe('buildSystemPrompt', () => {
  const baseBusiness = {
    name: 'Peluquería Test',
    bot_name: 'PeluBot',
    bot_emoji: '✂️',
    tone: 'amigable',
    language: 'es',
  };

  it('incluye nombre del bot y del negocio', () => {
    const prompt = buildSystemPrompt(baseBusiness);
    expect(prompt).toContain('PeluBot');
    expect(prompt).toContain('Peluquería Test');
  });

  it('incluye descripción si está presente', () => {
    const prompt = buildSystemPrompt({ ...baseBusiness, business_description: 'Somos la mejor peluquería' });
    expect(prompt).toContain('Somos la mejor peluquería');
  });

  it('incluye el historial del cliente si se pasa contactSummary', () => {
    const prompt = buildSystemPrompt(baseBusiness, 'El cliente prefiere corte a navaja los sábados');
    expect(prompt).toContain('El cliente prefiere corte a navaja los sábados');
    expect(prompt).toContain('Historial de este cliente');
  });

  it('NO incluye sección de historial si no hay summary', () => {
    const prompt = buildSystemPrompt(baseBusiness);
    expect(prompt).not.toContain('Historial de este cliente');
  });

  it('incluye palabras prohibidas si están configuradas', () => {
    const prompt = buildSystemPrompt({ ...baseBusiness, forbidden_words: ['competencia', 'barato'] });
    expect(prompt).toContain('competencia');
    expect(prompt).toContain('barato');
  });

  it('incluye instrucciones de Calendar si hay google_refresh_token', () => {
    const prompt = buildSystemPrompt({ ...baseBusiness, google_refresh_token: 'token123' });
    expect(prompt).toContain('get_available_slots');
    expect(prompt).toContain('create_appointment');
  });

  it('NO incluye instrucciones de Calendar si no hay token', () => {
    const prompt = buildSystemPrompt(baseBusiness);
    expect(prompt).not.toContain('get_available_slots');
  });

  it('incluye categorías si están configuradas', () => {
    const prompt = buildSystemPrompt({
      ...baseBusiness,
      appointment_categories: [{ name: 'Corte', duration_minutes: 30 }],
    });
    expect(prompt).toContain('Corte');
    expect(prompt).toContain('30 min');
  });
});
