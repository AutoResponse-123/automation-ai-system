const mockCaptureError = jest.fn();
jest.mock('../config/supabase', () => ({ supabase: {} }))
jest.mock('../services/logger', () => ({ captureError: mockCaptureError }))
const { transcribeAudio } = require('../services/transcribe')

describe('transcribeAudio (degradación segura)', () => {
  const OLD = process.env.OPENAI_API_KEY
  const OLD_SID = process.env.TWILIO_ACCOUNT_SID
  const OLD_TOK = process.env.TWILIO_AUTH_TOKEN
  const realFetch: any = (global as any).fetch
  afterEach(() => {
    if (OLD === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = OLD
    if (OLD_SID === undefined) delete process.env.TWILIO_ACCOUNT_SID; else process.env.TWILIO_ACCOUNT_SID = OLD_SID
    if (OLD_TOK === undefined) delete process.env.TWILIO_AUTH_TOKEN; else process.env.TWILIO_AUTH_TOKEN = OLD_TOK
    ;(global as any).fetch = realFetch
    mockCaptureError.mockClear()
  })

  it('sin OPENAI_API_KEY devuelve null (fallback)', async () => {
    delete process.env.OPENAI_API_KEY
    expect(await transcribeAudio('https://example.com/a.ogg', 'audio/ogg')).toBeNull()
  })

  it('sin mediaUrl devuelve null aunque haya API key', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    expect(await transcribeAudio('', 'audio/ogg')).toBeNull()
  })

  it('sigue el redirect de Twilio SIN arrastrar el auth y transcribe', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    process.env.TWILIO_ACCOUNT_SID = 'AC_test'
    process.env.TWILIO_AUTH_TOKEN = 'tok_test'
    const calls: any[] = []
    ;(global as any).fetch = jest.fn(async (url: any, opts: any) => {
      calls.push({ url, opts })
      if (calls.length === 1) {
        // api.twilio.com responde un redirect al binario real
        return { status: 307, ok: false, headers: { get: (h: string) => h.toLowerCase() === 'location' ? 'https://media.twiliocdn.com/real' : null } }
      }
      if (calls.length === 2) {
        // binario en el CDN
        return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer }
      }
      // OpenAI
      return { ok: true, json: async () => ({ text: 'hola quiero un turno' }) }
    })

    const result = await transcribeAudio('https://api.twilio.com/2010-04-01/Accounts/AC_test/Messages/MM1/Media/ME1', 'audio/ogg')
    expect(result).toBe('hola quiero un turno')
    // El primer salto (Twilio) lleva auth; el segundo (CDN) NO.
    expect(calls[0].opts?.headers?.Authorization).toBeTruthy()
    expect(calls[1].opts?.headers?.Authorization).toBeUndefined()
  })

  it('descarga fallida (403) reporta a Sentry y devuelve null', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    ;(global as any).fetch = jest.fn(async () => ({ status: 403, ok: false, headers: { get: () => null } }))
    const result = await transcribeAudio('https://api.twilio.com/.../Media/ME1', 'audio/ogg')
    expect(result).toBeNull()
    expect(mockCaptureError).toHaveBeenCalledTimes(1)
    expect(mockCaptureError.mock.calls[0][1]).toBe('transcribe_download')
  })
})
