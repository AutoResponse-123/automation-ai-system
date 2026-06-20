jest.mock('../config/supabase', () => ({ supabase: {} }))
const { transcribeAudio } = require('../services/transcribe')

describe('transcribeAudio (degradación segura)', () => {
  const OLD = process.env.OPENAI_API_KEY
  afterEach(() => { if (OLD === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = OLD })

  it('sin OPENAI_API_KEY devuelve null (fallback)', async () => {
    delete process.env.OPENAI_API_KEY
    expect(await transcribeAudio('https://example.com/a.ogg', 'audio/ogg')).toBeNull()
  })

  it('sin mediaUrl devuelve null aunque haya API key', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    expect(await transcribeAudio('', 'audio/ogg')).toBeNull()
  })
})
