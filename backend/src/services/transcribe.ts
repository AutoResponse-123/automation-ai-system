export {};

// Transcribe una nota de voz de WhatsApp a texto usando OpenAI (gpt-4o-mini-transcribe).
// Descarga el archivo desde la URL de media de Twilio y lo manda a la API de transcripción.
// Devuelve el texto, o null si no se pudo → el caller hace fallback (pedir que escriban).
// Gateado por plan en el webhook (solo Premium).

const MAX_BYTES = 5 * 1024 * 1024; // ~5MB. Nota de voz típica < 1MB; el modelo admite hasta 25MB.

// Descarga la media de Twilio de forma robusta. Twilio responde con un redirect desde
// api.twilio.com hacia el binario real (otro host/CDN) que NO debe recibir el header de
// autenticación (si se arrastra, el segundo salto falla → era la causa del 404). Por eso
// seguimos el redirect a mano. Además reintentamos ante 404 (la media de WhatsApp puede no
// estar disponible al instante).
async function downloadTwilioMedia(mediaUrl: string): Promise<Buffer | null> {
  const sid = process.env.TWILIO_ACCOUNT_SID || '';
  const token = process.env.TWILIO_AUTH_TOKEN || '';
  const auth = sid && token ? 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64') : '';

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 600 * attempt));

    // 1) Primer salto a Twilio CON auth, sin seguir el redirect automáticamente.
    let res: any = await fetch(mediaUrl, { headers: auth ? { Authorization: auth } : {}, redirect: 'manual' });
    // 2) Si redirige, seguimos al binario SIN arrastrar el header de auth.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (loc) res = await fetch(loc);
    }

    if (res.ok) return Buffer.from(await res.arrayBuffer());

    // 404 puede ser disponibilidad tardía de la media → reintentamos.
    if (res.status === 404 && attempt < 2) {
      console.warn('[transcribe] media 404, reintento', attempt + 1);
      continue;
    }

    console.error('[transcribe] descarga falló:', res.status);
    try {
      require('./logger').captureError(
        new Error(`Twilio media download HTTP ${res.status}`),
        'transcribe_download',
        { status: res.status, mediaUrl: String(mediaUrl).slice(0, 200) }
      );
    } catch { /* nunca romper por el logger */ }
    return null;
  }
  return null;
}

async function transcribeAudio(mediaUrl: string, contentType?: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { console.warn('[transcribe] OPENAI_API_KEY no configurada, omito transcripción'); return null; }
  if (!mediaUrl) return null;

  try {
    const buf = await downloadTwilioMedia(mediaUrl);
    if (!buf || buf.length === 0) return null;
    if (buf.length > MAX_BYTES) { console.warn('[transcribe] audio demasiado grande, omito:', buf.length); return null; }

    const type = contentType || 'audio/ogg';
    const ext = type.includes('mpeg') ? 'mp3'
      : (type.includes('mp4') || type.includes('m4a')) ? 'm4a'
      : type.includes('wav') ? 'wav'
      : type.includes('webm') ? 'webm'
      : 'ogg';
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buf)], { type }), `audio.${ext}`);
    form.append('model', 'gpt-4o-mini-transcribe');
    form.append('language', 'es');

    const tr: any = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey },
      body: form,
    });
    if (!tr.ok) {
      const errTxt = await tr.text().catch(() => '');
      console.error('[transcribe] Whisper falló:', tr.status, errTxt.slice(0, 200));
      try { require('./logger').captureError(new Error(`OpenAI transcription HTTP ${tr.status}`), 'transcribe_openai', { status: tr.status }); } catch {}
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
