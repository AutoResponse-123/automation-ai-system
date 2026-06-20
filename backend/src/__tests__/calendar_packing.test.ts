jest.mock('../config/supabase', () => ({ supabase: {} }))
const { packFreeStarts } = require('../services/calendar')

// Trabajamos en UTC para que la hora "de pared" == hora UTC y la aritmética sea clara.
const DAY = '2026-06-18'
const ms = (hhmm: string) => new Date(`${DAY}T${hhmm}:00Z`).getTime()
// Convierte resultados (ms) de vuelta a "HH:MM" UTC para asserts legibles.
const hhmm = (t: number) => new Date(t).toISOString().slice(11, 16)
const fmt = (arr: number[]) => arr.map(hhmm)

// "now" muy en el pasado para no filtrar slots por el chequeo de "ya pasó".
const PAST = ms('00:00')

describe('packFreeStarts — empaquetado dinámico de turnos', () => {
  it('día vacío, paso 20, duración 40: arranca en apertura y avanza de a 20', () => {
    const starts = packFreeStarts({
      dayStartMs: ms('14:00'), dayEndMs: ms('16:00'),
      durationMs: 40 * 60000, stepMs: 20 * 60000, bufferMs: 0,
      busy: [], breaks: [], nowMs: PAST,
    })
    // 14:00(→14:40), 14:20(→15:00), 14:40(→15:20), 15:00(→15:40), 15:20(→16:00)
    expect(fmt(starts)).toEqual(['14:00', '14:20', '14:40', '15:00', '15:20'])
  })

  it('tras un turno de 60min (14:00-15:00) el próximo arranque es 15:00, no 15:20', () => {
    const starts = packFreeStarts({
      dayStartMs: ms('14:00'), dayEndMs: ms('18:00'),
      durationMs: 40 * 60000, stepMs: 20 * 60000, bufferMs: 0,
      busy: [{ start: ms('14:00'), end: ms('15:00') }], breaks: [], nowMs: PAST,
    })
    expect(fmt(starts)[0]).toBe('15:00')
  })

  it('hueco de 40min (15:20-16:00) con barba de 20min → entran dos (15:20 y 15:40)', () => {
    const starts = packFreeStarts({
      dayStartMs: ms('14:00'), dayEndMs: ms('18:00'),
      durationMs: 20 * 60000, stepMs: 20 * 60000, bufferMs: 0,
      busy: [
        { start: ms('14:00'), end: ms('15:00') }, // corte+barba 60
        { start: ms('15:00'), end: ms('15:20') }, // barba 20
        { start: ms('16:00'), end: ms('17:00') }, // próximo turno
      ],
      breaks: [], nowMs: PAST,
    })
    // El hueco relevante es 15:20-16:00 → 15:20 y 15:40. Después de 17:00 sigue abierto.
    expect(fmt(starts)).toEqual(['15:20', '15:40', '17:00', '17:20', '17:40'])
  })

  it('mismo hueco de 40min con corte de 40min → entra solo uno (15:20)', () => {
    const starts = packFreeStarts({
      dayStartMs: ms('14:00'), dayEndMs: ms('16:00'),
      durationMs: 40 * 60000, stepMs: 20 * 60000, bufferMs: 0,
      busy: [
        { start: ms('14:00'), end: ms('15:00') },
        { start: ms('15:00'), end: ms('15:20') },
      ],
      breaks: [], nowMs: PAST,
    })
    // Hueco 15:20-16:00 (cierre): 15:20(→16:00) entra; 15:40(→16:20) no.
    expect(fmt(starts)).toEqual(['15:20'])
  })

  it('respeta el buffer entre turnos a ambos lados', () => {
    const starts = packFreeStarts({
      dayStartMs: ms('14:00'), dayEndMs: ms('18:00'),
      durationMs: 30 * 60000, stepMs: 30 * 60000, bufferMs: 10 * 60000,
      busy: [{ start: ms('14:00'), end: ms('15:00') }], breaks: [], nowMs: PAST,
    })
    // El turno termina 15:00 + buffer 10 → el hueco arranca 15:10.
    expect(fmt(starts)[0]).toBe('15:10')
  })

  it('no ofrece slots dentro de un descanso (break)', () => {
    const starts = packFreeStarts({
      dayStartMs: ms('14:00'), dayEndMs: ms('17:00'),
      durationMs: 60 * 60000, stepMs: 60 * 60000, bufferMs: 0,
      busy: [], breaks: [{ start: ms('15:00'), end: ms('16:00') }], nowMs: PAST,
    })
    // 14:00(→15:00) entra; 15:00-16:00 es descanso; 16:00(→17:00) entra.
    expect(fmt(starts)).toEqual(['14:00', '16:00'])
  })

  it('filtra los arranques que ya pasaron (now)', () => {
    const starts = packFreeStarts({
      dayStartMs: ms('14:00'), dayEndMs: ms('16:00'),
      durationMs: 40 * 60000, stepMs: 20 * 60000, bufferMs: 0,
      busy: [], breaks: [], nowMs: ms('14:30'),
    })
    // Solo arranques > 14:30.
    expect(fmt(starts)).toEqual(['14:40', '15:00', '15:20'])
  })

  it('modo fijo (paso = duración) sin huecos: grilla consecutiva clásica', () => {
    const starts = packFreeStarts({
      dayStartMs: ms('09:00'), dayEndMs: ms('12:00'),
      durationMs: 60 * 60000, stepMs: 60 * 60000, bufferMs: 0,
      busy: [], breaks: [], nowMs: PAST,
    })
    expect(fmt(starts)).toEqual(['09:00', '10:00', '11:00'])

  })

  it('cierre clásico (barbería 13-20, turnos 60min): último arranque 19:00', () => {
    const starts = packFreeStarts({
      dayStartMs: ms('13:00'), dayEndMs: ms('20:00'),
      durationMs: 60 * 60000, stepMs: 60 * 60000, bufferMs: 0,
      busy: [], breaks: [], nowMs: PAST,
    })
    const arr = fmt(starts)
    expect(arr[arr.length - 1]).toBe('19:00')
  })

  it('cierre "arranca al cierre" (dayEnd extendido por la duración): último arranque 20:00', () => {
    const starts = packFreeStarts({
      dayStartMs: ms('13:00'), dayEndMs: ms('21:00'),
      durationMs: 60 * 60000, stepMs: 60 * 60000, bufferMs: 0,
      busy: [], breaks: [], nowMs: PAST,
    })
    const arr = fmt(starts)
    expect(arr[arr.length - 1]).toBe('20:00')
  })
})
