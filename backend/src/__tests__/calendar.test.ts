jest.mock('../config/supabase', () => ({ supabase: {} }))
const { wallTimeToUtc } = require('../services/calendar')

describe('wallTimeToUtc (fix de timezone)', () => {
  it('ART (UTC-3): 09:00 de pared -> 12:00 UTC', () => {
    expect(wallTimeToUtc('2026-06-15', '09:00', 'America/Argentina/Buenos_Aires').toISOString())
      .toBe('2026-06-15T12:00:00.000Z')
  })
  it('UTC se mantiene igual', () => {
    expect(wallTimeToUtc('2026-06-15', '09:00', 'UTC').toISOString())
      .toBe('2026-06-15T09:00:00.000Z')
  })
  it('medianoche ART -> 03:00 UTC mismo día', () => {
    expect(wallTimeToUtc('2026-06-15', '00:00', 'America/Argentina/Buenos_Aires').toISOString())
      .toBe('2026-06-15T03:00:00.000Z')
  })
  it('zona con DST (Madrid en junio = UTC+2): 12:00 -> 10:00 UTC', () => {
    expect(wallTimeToUtc('2026-06-15', '12:00', 'Europe/Madrid').toISOString())
      .toBe('2026-06-15T10:00:00.000Z')
  })
})
