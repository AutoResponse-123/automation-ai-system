export {};
// Tests de la función pura del embudo: resolveStageAdvance solo debe avanzar
// hacia adelante y nunca retroceder.

jest.mock('../config/supabase', () => ({ supabase: {} }));

const { resolveStageAdvance, STAGE_ORDER } = require('../services/pipeline');

describe('resolveStageAdvance', () => {
  it('avanza a la etapa siguiente', () => {
    expect(resolveStageAdvance('nuevo', 'contactado')).toBe('contactado');
    expect(resolveStageAdvance('contactado', 'agendó')).toBe('agendó');
    expect(resolveStageAdvance('agendó', 'atendió')).toBe('atendió');
    expect(resolveStageAdvance('atendió', 'recurrente')).toBe('recurrente');
  });

  it('no retrocede ni repite etapa (devuelve null)', () => {
    expect(resolveStageAdvance('agendó', 'contactado')).toBeNull();
    expect(resolveStageAdvance('recurrente', 'atendió')).toBeNull();
    expect(resolveStageAdvance('contactado', 'contactado')).toBeNull();
  });

  it('trata null/undefined como "nuevo"', () => {
    expect(resolveStageAdvance(null, 'contactado')).toBe('contactado');
    expect(resolveStageAdvance(undefined, 'agendó')).toBe('agendó');
    expect(resolveStageAdvance(null, 'nuevo')).toBeNull();
  });

  it('un lead "perdido" que reengancha vuelve a contactado', () => {
    // 'perdido' no está en el orden → cuenta como índice -1 → cualquier etapa avanza.
    expect(resolveStageAdvance('perdido', 'contactado')).toBe('contactado');
    expect(resolveStageAdvance('perdido', 'atendió')).toBe('atendió');
  });

  it('nunca auto-avanza hacia "perdido" (es manual)', () => {
    expect(resolveStageAdvance('contactado', 'perdido')).toBeNull();
    expect(resolveStageAdvance('nuevo', 'perdido')).toBeNull();
  });

  it('ignora etapas desconocidas como target', () => {
    expect(resolveStageAdvance('nuevo', 'inventada')).toBeNull();
  });

  it('STAGE_ORDER tiene el orden esperado', () => {
    expect(STAGE_ORDER).toEqual(['nuevo', 'contactado', 'agendó', 'atendió', 'recurrente']);
  });
});
