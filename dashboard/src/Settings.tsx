import { useEffect, useState } from 'react'
import { supabase } from './supabase'


interface BusinessConfig {
  id: string
  name: string
  type: string
  bot_name: string
  bot_emoji: string
  tone: string
  language: string
  welcome_message: string
  closing_phrases: string[]
  forbidden_words: string[]
  escalation_keywords: string[]
  business_description: string
  services: string
  prices: string
  address: string
  website: string
  instagram: string
  prompt_template: string
  max_tokens: number
  escalation_email: string
  daily_summary: boolean
  max_messages_before_escalation: number
  accent_color: string
  google_calendar_id: string | null
  google_refresh_token: string | null
  schedule: {
    enabled: boolean
    timezone: string
    hours: Record<string, { open: string; close: string; closed: boolean }>
  }
}

const DEFAULT_SCHEDULE = {
  enabled: false,
  timezone: 'America/Argentina/Buenos_Aires',
  hours: {
    lunes:    { open: '09:00', close: '18:00', closed: false },
    martes:   { open: '09:00', close: '18:00', closed: false },
    miércoles:{ open: '09:00', close: '18:00', closed: false },
    jueves:   { open: '09:00', close: '18:00', closed: false },
    viernes:  { open: '09:00', close: '18:00', closed: false },
    sábado:   { open: '09:00', close: '13:00', closed: false },
    domingo:  { open: '09:00', close: '13:00', closed: true  },
  }
}

const TONES = ['formal', 'amigable', 'divertido', 'neutro', 'profesional']
const LANGUAGES = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
]

type Section = 'personalidad' | 'negocio' | 'escalacion' | 'horarios' | 'notificaciones' | 'apariencia' | 'integraciones'

export default function Settings({ onSave, businessId, onThemeChange }: {
  onSave?: () => void
  businessId: string | null
  onThemeChange?: (accent?: string, bg?: string) => void
}) {
  const [config, setConfig] = useState<BusinessConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeSection, setActiveSection] = useState<Section>('personalidad')
  const [newKeyword, setNewKeyword] = useState('')
  const [newForbidden, setNewForbidden] = useState('')
  const [newClosing, setNewClosing] = useState('')
  const [bgColor, setBgColor] = useState<string>(() => localStorage.getItem('ar_bg_color') ?? '#07070d')

  useEffect(() => { if (businessId) loadConfig() }, [businessId])

  async function loadConfig() {
    if (!businessId) return
    setLoading(true)
    const { data } = await supabase.from('businesses').select('*').eq('id', businessId).single()
    if (data) {
      setConfig({
        ...data,
        bot_name: data.bot_name ?? 'Asistente',
        bot_emoji: data.bot_emoji ?? '🤖',
        tone: data.tone ?? 'amigable',
        language: data.language ?? 'es',
        welcome_message: data.welcome_message ?? '',
        closing_phrases: data.closing_phrases ?? [],
        forbidden_words: data.forbidden_words ?? [],
        escalation_keywords: data.escalation_keywords ?? ['humano', 'persona', 'agente'],
        business_description: data.business_description ?? '',
        services: data.services ?? '',
        prices: data.prices ?? '',
        address: data.address ?? '',
        website: data.website ?? '',
        instagram: data.instagram ?? '',
        prompt_template: data.prompt_template ?? '',
        max_tokens: data.max_tokens ?? 300,
        escalation_email: data.escalation_email ?? '',
        daily_summary: data.daily_summary ?? false,
        max_messages_before_escalation: data.max_messages_before_escalation ?? 10,
        accent_color: data.accent_color ?? '#a78bfa',
        google_calendar_id: data.google_calendar_id ?? null,
        google_refresh_token: data.google_refresh_token ?? null,
        schedule: data.schedule ?? DEFAULT_SCHEDULE,
      })
    }
    setLoading(false)
  }

  async function saveConfig() {
    if (!config || !businessId) return
    setSaving(true)
    await supabase.from('businesses').update({
      name: config.name,
      bot_name: config.bot_name,
      bot_emoji: config.bot_emoji,
      tone: config.tone,
      language: config.language,
      welcome_message: config.welcome_message,
      closing_phrases: config.closing_phrases,
      forbidden_words: config.forbidden_words,
      escalation_keywords: config.escalation_keywords,
      business_description: config.business_description,
      services: config.services,
      prices: config.prices,
      address: config.address,
      website: config.website,
      instagram: config.instagram,
      prompt_template: config.prompt_template,
      max_tokens: config.max_tokens,
      escalation_email: config.escalation_email,
      daily_summary: config.daily_summary,
      max_messages_before_escalation: config.max_messages_before_escalation,
      accent_color: config.accent_color,
      schedule: config.schedule,
      updated_at: new Date().toISOString(),
    }).eq('id', businessId!)
    localStorage.setItem('ar_bg_color', bgColor)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    onThemeChange?.(config.accent_color, bgColor)
    onSave?.()
  }

  function update(key: keyof BusinessConfig, value: any) {
    setConfig(prev => prev ? { ...prev, [key]: value } : prev)
  }

  function addTag(key: 'escalation_keywords' | 'forbidden_words' | 'closing_phrases', value: string, setter: (v: string) => void) {
    const trimmed = value.trim().toLowerCase()
    if (!trimmed || !config) return
    if (!(config[key] as string[]).includes(trimmed)) {
      update(key, [...(config[key] as string[]), trimmed])
    }
    setter('')
  }

  function removeTag(key: 'escalation_keywords' | 'forbidden_words' | 'closing_phrases', index: number) {
    if (!config) return
    update(key, (config[key] as string[]).filter((_, i) => i !== index))
  }

  if (!businessId || loading) return <div style={s.loading}>Cargando configuración...</div>
  if (!config) return <div style={s.loading}>No se encontró la configuración</div>

  const sections: { id: Section; icon: string; label: string }[] = [
    { id: 'personalidad',   icon: 'ti-robot',        label: 'Personalidad IA' },
    { id: 'negocio',        icon: 'ti-building-store', label: 'Mi negocio' },
    { id: 'escalacion',     icon: 'ti-user-bolt',    label: 'Escalación' },
    { id: 'horarios',       icon: 'ti-clock',        label: 'Horarios' },
    { id: 'notificaciones', icon: 'ti-bell',         label: 'Notificaciones' },
    { id: 'apariencia',     icon: 'ti-palette',      label: 'Apariencia' },
    { id: 'integraciones',  icon: 'ti-plug',         label: 'Integraciones' },
  ]

  return (
    <div style={s.container}>
      {/* Sidebar de secciones */}
      <div style={s.sectNav}>
        <div style={s.sectNavTitle}>Configuración</div>
        {sections.map(sec => (
          <button key={sec.id} onClick={() => setActiveSection(sec.id)}
            style={{ ...s.sectBtn, ...(activeSection === sec.id ? s.sectBtnActive : {}) }}>
            <i className={`ti ${sec.icon}`} style={{ fontSize: 15 }} aria-hidden="true" />
            {sec.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div style={s.content}>
        <div style={s.contentInner}>

          {/* ── Personalidad ── */}
          {activeSection === 'personalidad' && (
            <div style={s.section}>
              <SectionHeader icon="ti-robot" title="Personalidad del agente IA" subtitle="Definí cómo se presenta y comunica tu bot" />

              <div style={s.row2}>
                <Field label="Nombre del bot">
                  <input style={s.input} value={config.bot_name} onChange={e => update('bot_name', e.target.value)} placeholder="Ej: Asistente Luna" />
                </Field>
                <Field label="Emoji del bot">
                  <input style={{ ...s.input, fontSize: 24, textAlign: 'center' }} value={config.bot_emoji} onChange={e => update('bot_emoji', e.target.value)} placeholder="🤖" maxLength={2} />
                </Field>
              </div>

              <div style={s.row2}>
                <Field label="Tono de comunicación">
                  <div style={s.toneGrid}>
                    {TONES.map(t => (
                      <button key={t} onClick={() => update('tone', t)}
                        style={{ ...s.toneBtn, ...(config.tone === t ? s.toneBtnActive : {}) }}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Idioma principal">
                  <div style={s.langGrid}>
                    {LANGUAGES.map(l => (
                      <button key={l.code} onClick={() => update('language', l.code)}
                        style={{ ...s.toneBtn, ...(config.language === l.code ? s.toneBtnActive : {}) }}>
                        {l.label}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>

              <Field label="Mensaje de bienvenida">
                <textarea style={s.textarea} rows={2} value={config.welcome_message}
                  onChange={e => update('welcome_message', e.target.value)}
                  placeholder="Ej: ¡Hola! Soy Luna, tu asistente virtual. ¿En qué puedo ayudarte hoy? 😊" />
              </Field>

              <Field label="Prompt / instrucciones completas" hint="Acá le explicás al bot cómo debe comportarse, qué puede y no puede decir">
                <textarea style={{ ...s.textarea, minHeight: 140 }} rows={6} value={config.prompt_template}
                  onChange={e => update('prompt_template', e.target.value)}
                  placeholder="Ej: Sos un asistente amigable de una peluquería. Respondés consultas sobre turnos, precios y servicios. Siempre saludás con el nombre del negocio..." />
              </Field>

              <div style={s.row2}>
                <Field label="Máximo de tokens por respuesta" hint="Más tokens = respuestas más largas y costosas">
                  <input style={s.input} type="number" value={config.max_tokens} min={100} max={1000}
                    onChange={e => update('max_tokens', parseInt(e.target.value))} />
                </Field>
                <div />
              </div>

              <Field label="Frases de cierre personalizadas" hint="El bot elegirá una aleatoriamente al cerrar una conversación">
                <TagInput
                  tags={config.closing_phrases}
                  value={newClosing}
                  onChange={setNewClosing}
                  onAdd={() => addTag('closing_phrases', newClosing, setNewClosing)}
                  onRemove={(i) => removeTag('closing_phrases', i)}
                  placeholder="Ej: ¡Hasta pronto! 👋"
                  color="#38bdf8"
                />
              </Field>

              <Field label="Palabras prohibidas" hint="El bot nunca usará estas palabras en sus respuestas">
                <TagInput
                  tags={config.forbidden_words}
                  value={newForbidden}
                  onChange={setNewForbidden}
                  onAdd={() => addTag('forbidden_words', newForbidden, setNewForbidden)}
                  onRemove={(i) => removeTag('forbidden_words', i)}
                  placeholder="Ej: competencia, caro, problema"
                  color="#f87171"
                />
              </Field>
            </div>
          )}

          {/* ── Negocio ── */}
          {activeSection === 'negocio' && (
            <div style={s.section}>
              <SectionHeader icon="ti-building-store" title="Información del negocio" subtitle="Esta info se usa para que el bot responda preguntas de tus clientes" />

              <div style={s.row2}>
                <Field label="Nombre del negocio">
                  <input style={s.input} value={config.name} onChange={e => update('name', e.target.value)} />
                </Field>
                <Field label="Tipo de negocio">
                  <input style={s.input} value={config.type} onChange={e => update('type', e.target.value)} placeholder="Ej: peluquería, restaurante, clínica" />
                </Field>
              </div>

              <Field label="Descripción del negocio">
                <textarea style={s.textarea} rows={3} value={config.business_description}
                  onChange={e => update('business_description', e.target.value)}
                  placeholder="Ej: Somos una peluquería especializada en cortes modernos y coloración. Atendemos desde 2015 en el barrio de Palermo..." />
              </Field>

              <Field label="Servicios que ofrecés">
                <textarea style={s.textarea} rows={3} value={config.services}
                  onChange={e => update('services', e.target.value)}
                  placeholder="Ej: Corte de cabello, coloración, mechas, tratamientos, alisado..." />
              </Field>

              <Field label="Precios" hint="El bot puede responder consultas de precios con esta información">
                <textarea style={s.textarea} rows={3} value={config.prices}
                  onChange={e => update('prices', e.target.value)}
                  placeholder="Ej: Corte mujer $5000, Corte hombre $3000, Coloración desde $8000..." />
              </Field>

              <div style={s.row2}>
                <Field label="Dirección">
                  <input style={s.input} value={config.address} onChange={e => update('address', e.target.value)} placeholder="Ej: Av. Santa Fe 1234, CABA" />
                </Field>
                <Field label="Sitio web">
                  <input style={s.input} value={config.website} onChange={e => update('website', e.target.value)} placeholder="https://..." />
                </Field>
              </div>

              <Field label="Instagram">
                <input style={s.input} value={config.instagram} onChange={e => update('instagram', e.target.value)} placeholder="@tunegocio" />
              </Field>
            </div>
          )}

          {/* ── Escalación ── */}
          {activeSection === 'escalacion' && (
            <div style={s.section}>
              <SectionHeader icon="ti-user-bolt" title="Escalación a humano" subtitle="Cuándo y cómo el bot deriva la conversación a un agente real" />

              <Field label="Palabras clave para escalar" hint="Si el cliente escribe alguna de estas palabras, la conversación se escala automáticamente a un humano">
                <TagInput
                  tags={config.escalation_keywords}
                  value={newKeyword}
                  onChange={setNewKeyword}
                  onAdd={() => addTag('escalation_keywords', newKeyword, setNewKeyword)}
                  onRemove={(i) => removeTag('escalation_keywords', i)}
                  placeholder="Ej: hablar con alguien, persona, urgente"
                  color="#f59e0b"
                />
              </Field>

              <Field label="Máximo de mensajes antes de escalar" hint="Si la conversación supera este número sin resolverse, se escala automáticamente">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input style={{ ...s.input, width: 80 }} type="number" min={1} max={50}
                    value={config.max_messages_before_escalation}
                    onChange={e => update('max_messages_before_escalation', parseInt(e.target.value))} />
                  <span style={{ fontSize: 12, color: '#4a4a6a' }}>mensajes</span>
                </div>
              </Field>
            </div>
          )}

          {/* ── Horarios ── */}
          {activeSection === 'horarios' && (
            <div style={s.section}>
              <SectionHeader icon="ti-clock" title="Horarios de atención" subtitle="Fuera de horario el bot responde con un mensaje automático" />

              <Field label="">
                <div style={s.toggleRow}>
                  <div>
                    <div style={{ fontSize: 13, color: '#c4c4d4', fontWeight: 500 }}>Activar horarios de atención</div>
                    <div style={{ fontSize: 11, color: '#4a4a6a', marginTop: 2 }}>Si está desactivado, el bot responde las 24hs</div>
                  </div>
                  <div style={{ ...s.toggleTrack, ...(config.schedule?.enabled ? s.toggleTrackOn : {}) }}
                    onClick={() => update('schedule', { ...config.schedule, enabled: !config.schedule?.enabled })}>
                    <div style={{ ...s.toggleThumb, ...(config.schedule?.enabled ? s.toggleThumbOn : {}) }} />
                  </div>
                </div>
              </Field>

              {config.schedule?.enabled && (
                <>
                  <Field label="Zona horaria">
                    <select style={s.select} value={config.schedule?.timezone}
                      onChange={e => update('schedule', { ...config.schedule, timezone: e.target.value })}>
                      <option value="America/Argentina/Buenos_Aires">Argentina (GMT-3)</option>
                      <option value="America/Santiago">Chile (GMT-4)</option>
                      <option value="America/Mexico_City">México (GMT-6)</option>
                      <option value="America/Bogota">Colombia (GMT-5)</option>
                      <option value="Europe/Madrid">España (GMT+1)</option>
                    </select>
                  </Field>

                  <div style={s.scheduleGrid}>
                    {Object.entries(config.schedule?.hours ?? {}).map(([day, hours]) => (
                      <div key={day} style={s.scheduleRow}>
                        <div style={{ ...s.dayLabel, ...(hours.closed ? { color: '#4a4a6a' } : {}) }}>
                          {day.charAt(0).toUpperCase() + day.slice(1)}
                        </div>
                        <div style={{ ...s.toggleTrackSm, ...(hours.closed ? {} : s.toggleTrackOn) }}
                          onClick={() => update('schedule', {
                            ...config.schedule,
                            hours: { ...config.schedule.hours, [day]: { ...hours, closed: !hours.closed } }
                          })}>
                          <div style={{ ...s.toggleThumbSm, ...(!hours.closed ? s.toggleThumbOn : {}) }} />
                        </div>
                        {!hours.closed ? (
                          <>
                            <input style={s.timeInput} type="time" value={hours.open}
                              onChange={e => update('schedule', { ...config.schedule, hours: { ...config.schedule.hours, [day]: { ...hours, open: e.target.value } } })} />
                            <span style={{ fontSize: 11, color: '#4a4a6a' }}>a</span>
                            <input style={s.timeInput} type="time" value={hours.close}
                              onChange={e => update('schedule', { ...config.schedule, hours: { ...config.schedule.hours, [day]: { ...hours, close: e.target.value } } })} />
                          </>
                        ) : (
                          <span style={{ fontSize: 12, color: '#4a4a6a', gridColumn: 'span 3' }}>Cerrado</span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Notificaciones ── */}
          {activeSection === 'notificaciones' && (
            <div style={s.section}>
              <SectionHeader icon="ti-bell" title="Notificaciones" subtitle="Cómo y cuándo te avisamos sobre tu cuenta" />

              <Field label="Email para escalaciones" hint="Te mandamos un email cuando el bot derive una conversación a humano">
                <input style={s.input} type="email" value={config.escalation_email}
                  onChange={e => update('escalation_email', e.target.value)}
                  placeholder="tu@email.com" />
              </Field>

              <Field label="">
                <div style={s.toggleRow}>
                  <div>
                    <div style={{ fontSize: 13, color: '#c4c4d4', fontWeight: 500 }}>Resumen diario</div>
                    <div style={{ fontSize: 11, color: '#4a4a6a', marginTop: 2 }}>Recibí un resumen por email con las métricas del día</div>
                  </div>
                  <div style={{ ...s.toggleTrack, ...(config.daily_summary ? s.toggleTrackOn : {}) }}
                    onClick={() => update('daily_summary', !config.daily_summary)}>
                    <div style={{ ...s.toggleThumb, ...(config.daily_summary ? s.toggleThumbOn : {}) }} />
                  </div>
                </div>
              </Field>
            </div>
          )}

          {/* ── Apariencia ── */}
          {activeSection === 'apariencia' && (
            <div style={s.section}>
              <SectionHeader icon="ti-palette" title="Apariencia" subtitle="Personalizá los colores de tu dashboard — los cambios se aplican en vivo" />

              {/* Color de acento */}
              <Field label="Color de acento" hint="Afecta botones, íconos activos, badges y acentos en todo el dashboard">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
                  <input type="color" value={config.accent_color}
                    onChange={e => { update('accent_color', e.target.value); onThemeChange?.(e.target.value, bgColor) }}
                    style={{ width: 44, height: 44, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 10, padding: 2 }} />
                  <input style={{ ...s.input, width: 110, fontFamily: 'monospace', fontSize: 12 }}
                    value={config.accent_color}
                    onChange={e => { update('accent_color', e.target.value); onThemeChange?.(e.target.value, bgColor) }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['#a78bfa','#22c55e','#38bdf8','#f59e0b','#f87171','#e879f9','#fb923c','#34d399'].map(c => (
                      <div key={c} onClick={() => { update('accent_color', c); onThemeChange?.(c, bgColor) }}
                        style={{ width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
                          border: config.accent_color === c ? '2px solid #fff' : '2px solid transparent',
                          boxShadow: config.accent_color === c ? `0 0 8px ${c}88` : 'none',
                          transition: 'all 0.15s' }} />
                    ))}
                  </div>
                </div>
              </Field>

              {/* Color de fondo */}
              <Field label="Color de fondo" hint="Cambia el tono base del dashboard — usá colores muy oscuros para mejores resultados">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
                  <input type="color" value={bgColor}
                    onChange={e => { setBgColor(e.target.value); onThemeChange?.(config.accent_color, e.target.value) }}
                    style={{ width: 44, height: 44, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 10, padding: 2 }} />
                  <input style={{ ...s.input, width: 110, fontFamily: 'monospace', fontSize: 12 }}
                    value={bgColor}
                    onChange={e => { setBgColor(e.target.value); onThemeChange?.(config.accent_color, e.target.value) }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['#07070d','#0a0a0f','#060610','#070d07','#0d0709','#07090d','#0a0808','#08080a'].map(c => (
                      <div key={c} onClick={() => { setBgColor(c); onThemeChange?.(config.accent_color, c) }}
                        style={{ width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
                          border: bgColor === c ? '2px solid #fff' : '1px solid #333',
                          transition: 'all 0.15s' }} />
                    ))}
                  </div>
                </div>
              </Field>

              {/* Preview */}
              <div style={{ marginTop: 8, padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                <div style={{ fontSize: 11, color: '#5a5a7a', marginBottom: 10, fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Preview</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                  <div style={{ background: 'linear-gradient(135deg, var(--accent-dark), var(--accent))', borderRadius: 8, padding: '6px 14px', fontSize: 12, color: '#fff', fontWeight: 500 }}>Botón principal</div>
                  <div style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-mid)', borderRadius: 8, padding: '6px 14px', fontSize: 12, color: 'var(--accent)' }}>Badge acento</div>
                  <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', fontSize: 12, color: '#e2e8f0' }}>Fondo panel</div>
                </div>
              </div>

              <div style={{ marginTop: 14, padding: '10px 14px', background: '#1a1200', border: '1px solid #3a2500', borderRadius: 8, fontSize: 12, color: '#fde68a' }}>
                <i className="ti ti-info-circle" style={{ marginRight: 6 }} />
                Los cambios de color se aplican en vivo. Guardá para que persistan al recargar.
              </div>
            </div>
          )}

          {/* ── Integraciones ── */}
          {activeSection === 'integraciones' && (
            <div style={s.section}>
              <SectionHeader icon="ti-plug" title="Integraciones" subtitle="Conectá servicios externos a tu bot" />
              <div style={{ background: '#0d0d14', border: '0.5px solid #1e1e2e', borderRadius: 10, padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="ti ti-calendar" style={{ fontSize: 18, color: '#4285f4' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0' }}>Google Calendar</div>
                      <div style={{ fontSize: 11, color: '#4a4a6a', marginTop: 2 }}>
                        {config.google_refresh_token ? '✅ Conectado — el bot puede agendar turnos' : 'No conectado — el bot no puede agendar turnos'}
                      </div>
                    </div>
                  </div>
                  {config.google_refresh_token ? (
                    <button
                      onClick={async () => {
                        await supabase.from('businesses').update({ google_refresh_token: null, google_calendar_id: null }).eq('id', businessId!)
                        update('google_refresh_token', null)
                        update('google_calendar_id', null)
                      }}
                      style={{ ...s.addBtn, color: '#f87171', borderColor: '#3e1a1a' }}>
                      Desconectar
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        const popup = window.open(`${import.meta.env.VITE_BACKEND_URL}/api/webhooks/calendar/connect/${businessId}`, '_blank', 'width=600,height=700')
                        const timer = setInterval(() => {
                          if (popup?.closed) {
                            clearInterval(timer)
                            loadConfig()
                          }
                        }, 1000)
                      }}
                      style={s.saveBtn}>
                      Conectar
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Save bar */}
        <div style={s.saveBar}>
          <span style={{ fontSize: 12, color: '#4a4a6a' }}>
            {saved ? '✅ Guardado correctamente' : 'Los cambios se aplican en la próxima conversación'}
          </span>
          <button onClick={saveConfig} disabled={saving} style={s.saveBtn}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <i className={`ti ${icon}`} style={{ fontSize: 16, color: '#a78bfa' }} aria-hidden="true" />
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', margin: 0 }}>{title}</h2>
      </div>
      <p style={{ fontSize: 12, color: '#4a4a6a', margin: 0, paddingLeft: 24 }}>{subtitle}</p>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <div style={{ fontSize: 12, fontWeight: 500, color: '#8b8baa', marginBottom: 6 }}>{label}</div>}
      {hint && <div style={{ fontSize: 11, color: '#4a4a6a', marginBottom: 6 }}>{hint}</div>}
      {children}
    </div>
  )
}

function TagInput({ tags, value, onChange, onAdd, onRemove, placeholder, color }: {
  tags: string[]; value: string; onChange: (v: string) => void
  onAdd: () => void; onRemove: (i: number) => void
  placeholder: string; color: string
}) {
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {tags.map((tag, i) => (
          <span key={i} style={{ background: '#1a1a2e', border: `0.5px solid ${color}44`, borderRadius: 6, padding: '3px 8px', fontSize: 12, color, display: 'flex', alignItems: 'center', gap: 4 }}>
            {tag}
            <button onClick={() => onRemove(i)} style={{ background: 'none', border: 'none', color, cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}>×</button>
          </span>
        ))}
        {tags.length === 0 && <span style={{ fontSize: 12, color: '#4a4a6a' }}>Sin palabras clave todavía</span>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={{ ...s.input, flex: 1 }} value={value} onChange={e => onChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onAdd()}
          placeholder={placeholder} />
        <button onClick={onAdd} style={s.addBtn}>+ Agregar</button>
      </div>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: { display: 'grid', gridTemplateColumns: '200px 1fr', height: '100%', overflow: 'hidden' },
  sectNav: { background: '#0d0d14', borderRight: '0.5px solid #1e1e2e', padding: '16px 8px', display: 'flex', flexDirection: 'column', gap: 2 },
  sectNavTitle: { fontSize: 10, color: '#4a4a6a', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 8px', marginBottom: 8 },
  sectBtn: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', color: '#4a4a6a', fontSize: 12, cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.15s' },
  sectBtnActive: { background: '#1a1a2e', color: '#a78bfa' },
  content: { display: 'grid', gridTemplateRows: '1fr auto', overflow: 'hidden' },
  contentInner: { overflowY: 'auto', padding: 24 },
  section: { maxWidth: 680 },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#4a4a6a', fontSize: 13 },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  input: { width: '100%', background: '#0d0d14', border: '0.5px solid #2e2e4e', borderRadius: 8, padding: '8px 10px', color: '#e2e8f0', fontSize: 13, fontFamily: 'system-ui, sans-serif', outline: 'none', boxSizing: 'border-box' as const },
  textarea: { width: '100%', background: '#0d0d14', border: '0.5px solid #2e2e4e', borderRadius: 8, padding: '8px 10px', color: '#e2e8f0', fontSize: 13, fontFamily: 'system-ui, sans-serif', outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const, minHeight: 80 },
  select: { width: '100%', background: '#0d0d14', border: '0.5px solid #2e2e4e', borderRadius: 8, padding: '8px 10px', color: '#e2e8f0', fontSize: 13, outline: 'none' },
  toneGrid: { display: 'flex', flexWrap: 'wrap' as const, gap: 6 },
  langGrid: { display: 'flex', gap: 6 },
  toneBtn: { background: '#0d0d14', border: '0.5px solid #2e2e4e', borderRadius: 6, padding: '5px 12px', fontSize: 12, color: '#8b8baa', cursor: 'pointer' },
  toneBtnActive: { background: '#1a1a2e', borderColor: '#a78bfa', color: '#a78bfa' },
  addBtn: { background: '#1a1a2e', border: '0.5px solid #2e2e4e', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#a78bfa', cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0 },
  toggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0d0d14', border: '0.5px solid #1e1e2e', borderRadius: 10, padding: '12px 14px' },
  toggleTrack: { width: 40, height: 22, borderRadius: 11, background: '#2e2e4e', position: 'relative' as const, cursor: 'pointer', transition: 'background 0.25s', flexShrink: 0 },
  toggleTrackOn: { background: '#7c3aed' },
  toggleThumb: { position: 'absolute' as const, top: 3, left: 3, width: 16, height: 16, borderRadius: '50%', background: '#6a6a8a', transition: 'left 0.25s, background 0.25s' },
  toggleThumbOn: { left: 21, background: '#fff' },
  toggleTrackSm: { width: 32, height: 18, borderRadius: 9, background: '#2e2e4e', position: 'relative' as const, cursor: 'pointer', transition: 'background 0.25s', flexShrink: 0 },
  toggleThumbSm: { position: 'absolute' as const, top: 2, left: 2, width: 14, height: 14, borderRadius: '50%', background: '#6a6a8a', transition: 'left 0.25s, background 0.25s' },
  scheduleGrid: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  scheduleRow: { display: 'grid', gridTemplateColumns: '90px 40px 90px 20px 90px', alignItems: 'center', gap: 8, background: '#0d0d14', border: '0.5px solid #1e1e2e', borderRadius: 8, padding: '8px 12px' },
  dayLabel: { fontSize: 12, fontWeight: 500, color: '#c4c4d4' },
  timeInput: { background: '#111122', border: '0.5px solid #2e2e4e', borderRadius: 6, padding: '4px 6px', color: '#e2e8f0', fontSize: 12, outline: 'none' },
  saveBar: { borderTop: '0.5px solid #1e1e2e', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0d0d14' },
  saveBtn: { background: '#a78bfa', border: 'none', borderRadius: 8, padding: '8px 20px', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
}
