export {};

// Transcribe una nota de voz de WhatsApp a texto usando OpenAI Whisper.
// Descarga el archivo desde la URL de media de Twilio (protegida por basic auth) y lo
// manda a la API de transcripción. Devuelve el texto, o null si no se pudo (sin API key,
// audio vacío/muy grande, o error) → el caller hace fallback (pedir que escriban).
//
// Costo: Whisper ~US$0.006/min; una nota de voz típica (15-30s) ~US$0.002-0.003.
// Gateado por plan en el webhook (solo Pro/Enterprise/trial).

const MAX_BYTES = 5 * 1024 * 1024; // ~5MB. Nota de voz típica < 1MB; Whisper admite hasta 25MB.

async function transcribeAudio(mediaUrl: string, contentType?: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { console.warn('[transcribe] OPENAI_API_KEY no configurada, omito transcripción'); return null; }
  if (!mediaUrl) return null;

  try {
    // 1) Descargar el audio desde Twilio (media protegida por basic auth).
    const sid = process.env.TWILIO_ACCOUNT_SID || '';
    const token = process.env.TWILIO_AUTH_TOKEN || '';
    const headers: Record<string, string> = {};
    if (sid && token) headers.Authorization = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');

    const audioRes = await fetch(mediaUrl, { headers });
    if (!audioRes.ok) { console.error('[transcribe] descarga falló:', audioRes.status); return null; }
    const buf = Buffer.from(await audioRes.arrayBuffer());
    if (buf.length === 0) return null;
    if (buf.length > MAX_BYTES) { console.warn('[transcribe] audio demasiado grande, omito:', buf.length); return null; }

    // 2) Enviar a Whisper (multipart/form-data).
    const type = contentType || 'audio/ogg';
    const ext = type.includes('mpeg') ? 'mp3'
      : (type.includes('mp4') || type.includes('m4a')) ? 'm4a'
      : type.includes('wav') ? 'wav'
      : type.includes('webm') ? 'webm'
      : 'ogg';
    const form = new FormData();
    form.append('file', new Blob([buf], { type }), `audio.${ext}`);
    form.append('model', 'whisper-1');
    form.append('language', 'es');

    const tr = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey },
      body: form,
    });
    if (!tr.ok) {
      const errTxt = await tr.text().catch(() => '');
      console.error('[transcribe] Whisper falló:', tr.status, errTxt.slice(0, 200));
      return null;
    }
    const json: any = await tr.json();
    const text = String(json?.text || '').trim();
    if (text) console.log('[transcribe] OK:', text.length, 'chars');
    return text || null;
  } catch (err: any) {
    console.error('[transcribe] error:', err?.message || err);
    try { require('./logger').captureError(err, 'transcribeAudio'); } catch {}
    return null;
  }
}

module.exports = { transcribeAudio };
