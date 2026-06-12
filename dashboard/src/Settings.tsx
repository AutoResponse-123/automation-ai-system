import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useNotifications } from './hooks/useNotifications'
import { useIsMobile } from './hooks/useIsMobile'
import { useLang } from './i18n'


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
  summary_frequency: string
  max_messages_before_escalation: number
  accent_color: string
  google_calendar_id: string | null
  google_refresh_token: string | null
  reminders_enabled: boolean
  reminder_hours_before: number[]
  mp_access_token: string | null
  sheets_refresh_token: string | null
  sheets_spreadsheet_id: string | null
  appointment_categories: AppointmentCategory[]
  schedule: {
    enabled: boolean
    timezone: string
    hours: Record<string, { open: string; close: string; closed: boolean; breaks?: Array<{ start: string; end: string }> }>
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

type Section = 'personalidad' | 'negocio' | 'escalacion' | 'horarios' | 'notificaciones' | 'apariencia' | 'integraciones' | 'turnos'

interface AppointmentCategory {
  id: string
  name: string
  duration_minutes: number
  color: string
}

export default function Settings({ onSave, businessId, onThemeChange, onFontChange, plan = 'trial' }: {
  onSave?: () => void
  businessId: string | null
  onThemeChange?: (accent?: string, bg?: string) => void
  onFontChange?: (font: string) => void
  plan?: string
}) {
  const isPro = plan === 'pro' || plan === 'enterprise'
  const { lang, setLang } = useLang()
  const uis = (es: string, en: string) => lang === 'en' ? en : es
  const { permission, enabled: notifEnabled, setEnabled: setNotifEnabled, requestPermission, sendNotification, isSupported } = useNotifications()
  const [config, setConfig] = useState<BusinessConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeSection, setActiveSection] = useState<Section>('personalidad')
  const [newKeyword, setNewKeyword] = useState('')
  const [newForbidden, setNewForbidden] = useState('')
  const [newClosing, setNewClosing] = useState('')
  const isMobile = useIsMobile()
  const [showSectionDropdown, setShowSectionDropdown] = useState(false)
  const [bgColor, setBgColor] = useState<string>(() => localStorage.getItem('ar_bg_color') ?? '#07070d')
  const [fontFamily, setFontFamily] = useState<string>(() => localStorage.getItem('ar_font') ?? 'Inter')

  function applyFont(font: string) {
    const existing = document.getElementById('ar-font-link')
    if (existing) existing.remove()
    if (font !== 'Inter') {
      const link = document.createElement('link')
      link.id = 'ar-font-link'
      link.rel = 'stylesheet'
      link.href = `https://fonts.googleapis.com/css2?family=${font.replace(/ /g, '+')}:wght@400;500;600;700&display=swap`
      document.head.appendChild(link)
    }
    setFontFamily(font)
    onFontChange?.(font)
  }
  const [newCatName, setNewCatName] = useState('')
  const [newCatDuration, setNewCatDuration] = useState(30)
  const [newCatColor, setNewCatColor] = useState('#a78bfa')
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string>('')
  const [useAlternateEmail, setUseAlternateEmail] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email)
    })
  }, [])

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
        summary_frequency: data.summary_frequency ?? 'daily',
        max_messages_before_escalation: data.max_messages_before_escalation ?? 10,
        accent_color: data.accent_color ?? '#a78bfa',
        google_calendar_id: data.google_calendar_id ?? null,
        google_refresh_token: data.google_refresh_token ?? null,
        reminders_enabled: data.reminders_enabled ?? false,
        reminder_hours_before: data.reminder_hours_before ?? [24],
        mp_access_token: data.mp_access_token ?? null,
        sheets_refresh_token: data.sheets_refresh_token ?? null,
        sheets_spreadsheet_id: data.sheets_spreadsheet_id ?? null,
        appointment_categories: data.appointment_categories ?? [],
        schedule: data.schedule ?? DEFAULT_SCHEDULE,
      })
    }
    // If saved escalation_email differs from auth email, show alternate email checkbox
    if (data?.escalation_email && data.escalation_email !== '') {
      setUseAlternateEmail(true)
    }
    setLoading(false)
  }

  async function saveConfig() {
    if (!config || !businessId) return
    setSaving(true)
    const { error } = await supabase.from('businesses').update({
      name: config.name,
      type: config.type,
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
      summary_frequency: config.summary_frequency,
      max_messages_before_escalation: config.max_messages_before_escalation,
      accent_color: config.accent_color,
      schedule: config.schedule,
      appointment_categories: config.appointment_categories,
      updated_at: new Date().toISOString(),
    }).eq('id', businessId!)
    setSaving(false)
    if (error) {
      console.error('[settings] Error al guardar config:', error)
      alert(uis('No se pudo guardar la configuración: ', 'Could not save settings: ') + error.message)
      return
    }
    localStorage.setItem('ar_bg_color', bgColor)
    localStorage.setItem('ar_font', fontFamily)
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

  const sectionLabels: Record<Section, [string, string]> = {
    personalidad:   ['Personalidad IA',  'AI Personality'],
    negocio:        ['Mi negocio',       'My Business'],
    escalacion:     ['Escalación',       'Escalation'],
    horarios:       ['Horarios',         'Schedule'],
    notificaciones: ['Notificaciones',   'Notifications'],
    apariencia:     ['Apariencia',       'Appearance'],
    integraciones:  ['Integraciones',    'Integrations'],
    turnos:         ['Turnos',           'Appointments'],
  }
  const sl = (id: Section) => lang === 'en' ? sectionLabels[id][1] : sectionLabels[id][0]

  const sections: { id: Section; icon: string; label: string }[] = [
    { id: 'personalidad',   icon: 'ti-robot',          label: sl('personalidad') },
    { id: 'negocio',        icon: 'ti-building-store', label: sl('negocio') },
    { id: 'escalacion',     icon: 'ti-user-bolt',      label: sl('escalacion') },
    { id: 'horarios',       icon: 'ti-clock',          label: sl('horarios') },
    { id: 'notificaciones', icon: 'ti-bell',           label: sl('notificaciones') },
    { id: 'apariencia',     icon: 'ti-palette',        label: sl('apariencia') },
    { id: 'integraciones',  icon: 'ti-plug',           label: sl('integraciones') },
    { id: 'turnos',         icon: 'ti-calendar-event', label: sl('turnos') },
  ]

  return (
    <div style={s.container} className="settings-shell">
      {/* Sidebar de secciones */}
      {isMobile ? (
        /* Mobile: dropdown selector */
        <div style={{ padding: '10px 14px', borderBottom: '0.5px solid #1e1e2e', position: 'relative' as const }}>
          <button
            onClick={() => setShowSectionDropdown(p => !p)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: '#0d0d14', border: '0.5px solid #2e2e4e', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit' }}
          >
            <i className={`ti ${sections.find(s => s.id === activeSection)?.icon}`} style={{ fontSize: 16, color: '#a78bfa' }} />
            <span style={{ flex: 1, textAlign: 'left' as const, fontWeight: 500 }}>
              {sections.find(s => s.id === activeSection)?.label}
            </span>
            <i className={`ti ti-chevron-${showSectionDropdown ? 'up' : 'down'}`} style={{ fontSize: 14, color: '#4a4a6a' }} />
          </button>
          {showSectionDropdown && (
            <div className="popover-enter" style={{ position: 'absolute' as const, top: '100%', left: 14, right: 14, background: '#0d0d14', border: '0.5px solid #2e2e4e', borderRadius: 10, padding: 6, zIndex: 300, boxShadow: '0 8px 24px rgba(0,0,0,0.7)', marginTop: 4 }}>
              {sections.map(sec => {
                const isActive = activeSection === sec.id
                return (
                  <button key={sec.id} onClick={() => { setActiveSection(sec.id as Section); setShowSectionDropdown(false) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: isActive ? '#16162a' : 'transparent', border: 'none', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', color: isActive ? '#c4b5fd' : '#8080a0', fontSize: 13, fontFamily: 'inherit' }}
                  >
                    <i className={`ti ${sec.icon}`} style={{ fontSize: 15 }} />
                    {sec.label}
                    {isActive && <i className="ti ti-check" style={{ fontSize: 12, marginLeft: 'auto', color: '#a78bfa' }} />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        /* Desktop: sidebar vertical */
        <div style={s.sectNav} className="settings-sidenav">
          <div style={s.sectNavTitle} className="settings-sidenav-title">{lang === 'en' ? 'Settings' : 'Configuración'}</div>
          {sections.map(sec => {
            const isActive = activeSection === sec.id
            return (
              <button key={sec.id} onClick={() => setActiveSection(sec.id)}
                style={{ ...s.sectBtn, ...(isActive ? s.sectBtnActive : {}) }}
                className="settings-sidenav-btn"
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = '#a78bfa' }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = '#7a7a9a' }}
              >
                <i className={`ti ${sec.icon}`} style={{ fontSize: 15, opacity: isActive ? 1 : 0.7 }} aria-hidden="true" />
                {sec.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Contenido */}
      <div style={s.content} className="settings-content">
        <div style={s.contentInner}>

          {/* ── Personalidad ── */}
          {activeSection === 'personalidad' && (
            <div style={s.section}>
              <SectionHeader icon="ti-robot" title={uis('Personalidad del agente IA', 'AI Agent Personality')} subtitle={uis('Definí cómo se presenta y comunica tu bot', 'Define how your bot presents and communicates')} />

              <div style={s.row2}>
                <Field label={uis('Nombre del bot', 'Bot name')}>
                  <input style={s.input} value={config.bot_name} onChange={e => update('bot_name', e.target.value)} placeholder={uis('Ej: Asistente Luna', 'E.g.: Assistant Luna')} />
                </Field>
                <Field label={uis('Emoji del bot', 'Bot emoji')}>
                  <input style={{ ...s.input, fontSize: 24, textAlign: 'center' }} value={config.bot_emoji} onChange={e => update('bot_emoji', e.target.value)} placeholder="🤖" maxLength={2} />
                </Field>
              </div>

              <div style={s.row2}>
                <Field label={uis('Tono de comunicación', 'Communication tone')}>
                  <div style={s.toneGrid}>
                    {TONES.map(t => (
                      <button key={t} onClick={() => update('tone', t)}
                        style={{ ...s.toneBtn, ...(config.tone === t ? s.toneBtnActive : {}) }}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label={uis('Idioma principal', 'Primary language')}>
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

              <Field label={uis('Mensaje de bienvenida', 'Welcome message')}>
                <textarea style={s.textarea} rows={2} value={config.welcome_message}
                  onChange={e => update('welcome_message', e.target.value)}
                  placeholder={uis('Ej: ¡Hola! Soy Luna, tu asistente virtual. ¿En qué puedo ayudarte hoy? 😊', 'E.g.: Hi! I\'m Luna, your virtual assistant. How can I help you today? 😊')} />
              </Field>

              <Field label={uis('Prompt / instrucciones completas', 'Full prompt / instructions')} hint={uis('Acá le explicás al bot cómo debe comportarse, qué puede y no puede decir', 'Tell the bot how to behave, what it can and cannot say')}>
                <textarea style={{ ...s.textarea, minHeight: 140 }} rows={6} value={config.prompt_template}
                  onChange={e => update('prompt_template', e.target.value)}
                  placeholder={uis('Ej: Sos un asistente amigable de una peluquería...', 'E.g.: You are a friendly assistant at a hair salon...')} />
              </Field>

              <Field label={uis('Frases de cierre personalizadas', 'Custom closing phrases')} hint={uis('El bot elegirá una aleatoriamente al cerrar una conversación', 'The bot will pick one randomly when closing a conversation')}>
                <TagInput tags={config.closing_phrases} value={newClosing} onChange={setNewClosing}
                  onAdd={() => addTag('closing_phrases', newClosing, setNewClosing)}
                  onRemove={(i) => removeTag('closing_phrases', i)}
                  placeholder={uis('Ej: ¡Hasta pronto! 👋', 'E.g.: See you soon! 👋')} color="#38bdf8" />
              </Field>

              <Field label={uis('Palabras prohibidas', 'Forbidden words')} hint={uis('El bot nunca usará estas palabras en sus respuestas', 'The bot will never use these words in its responses')}>
                <TagInput tags={config.forbidden_words} value={newForbidden} onChange={setNewForbidden}
                  onAdd={() => addTag('forbidden_words', newForbidden, setNewForbidden)}
                  onRemove={(i) => removeTag('forbidden_words', i)}
                  placeholder={uis('Ej: competencia, caro, problema', 'E.g.: competitor, expensive, problem')} color="#f87171" />
              </Field>
            </div>
          )}

          {/* ── Negocio ── */}
          {activeSection === 'negocio' && (
            <div style={s.section}>
              <SectionHeader icon="ti-building-store" title={uis('Información del negocio', 'Business Information')} subtitle={uis('Esta info se usa para que el bot responda preguntas de tus clientes', 'This info helps the bot answer your clients\' questions')} />

              <div style={s.row2}>
                <Field label={uis('Nombre del negocio', 'Business name')}>
                  <input style={s.input} value={config.name} onChange={e => update('name', e.target.value)} />
                </Field>
                <Field label={uis('Tipo de negocio', 'Business type')}>
                  <input style={s.input} value={config.type} onChange={e => update('type', e.target.value)} placeholder={uis('Ej: peluquería, restaurante, clínica', 'E.g.: salon, restaurant, clinic')} />
                </Field>
              </div>

              <Field label={uis('Descripción del negocio', 'Business description')}>
                <textarea style={s.textarea} rows={3} value={config.business_description}
                  onChange={e => update('business_description', e.target.value)}
                  placeholder={uis('Ej: Somos una peluquería especializada en cortes modernos...', 'E.g.: We are a hair salon specialized in modern cuts...')} />
              </Field>

              <Field label={uis('Servicios que ofrecés', 'Services you offer')}>
                <textarea style={s.textarea} rows={3} value={config.services}
                  onChange={e => update('services', e.target.value)}
                  placeholder={uis('Ej: Corte de cabello, coloración, mechas...', 'E.g.: Haircut, coloring, highlights...')} />
              </Field>

              <Field label={uis('Precios', 'Prices')} hint={uis('El bot puede responder consultas de precios con esta información', 'The bot can answer price inquiries with this information')}>
                <textarea style={s.textarea} rows={3} value={config.prices}
                  onChange={e => update('prices', e.target.value)}
                  placeholder={uis('Ej: Corte mujer $5000, Corte hombre $3000...', 'E.g.: Women\'s cut $50, Men\'s cut $30...')} />
              </Field>

              <div style={s.row2}>
                <Field label={uis('Dirección', 'Address')}>
                  <input style={s.input} value={config.address} onChange={e => update('address', e.target.value)} placeholder={uis('Ej: Av. Santa Fe 1234, CABA', 'E.g.: 123 Main St, City')} />
                </Field>
                <Field label={uis('Sitio web', 'Website')}>
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
              <SectionHeader icon="ti-user-bolt" title={uis('Escalación a humano', 'Human Escalation')} subtitle={uis('Cuándo y cómo el bot deriva la conversación a un agente real', 'When and how the bot transfers the conversation to a human agent')} />

              <Field label={uis('Palabras clave para escalar', 'Keywords to escalate')} hint={uis('Si el cliente escribe alguna de estas palabras, la conversación se escala automáticamente a un humano', 'If the client writes any of these words, the conversation is automatically escalated to a human')}>
                <TagInput tags={config.escalation_keywords} value={newKeyword} onChange={setNewKeyword}
                  onAdd={() => addTag('escalation_keywords', newKeyword, setNewKeyword)}
                  onRemove={(i) => removeTag('escalation_keywords', i)}
                  placeholder={uis('Ej: hablar con alguien, persona, urgente', 'E.g.: speak to someone, human, urgent')} color="#f59e0b" />
              </Field>

              <Field label={uis('Máximo de mensajes antes de escalar', 'Max messages before escalating')} hint={uis('Si la conversación supera este número sin resolverse, se escala automáticamente', 'If the conversation exceeds this number without resolution, it escalates automatically')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input style={{ ...s.input, width: 80 }} type="number" min={1} max={50}
                    value={config.max_messages_before_escalation}
                    onChange={e => update('max_messages_before_escalation', parseInt(e.target.value))} />
                  <span style={{ fontSize: 12, color: '#4a4a6a' }}>{uis('mensajes', 'messages')}</span>
                </div>
              </Field>
            </div>
          )}

          {/* ── Horarios ── */}
          {activeSection === 'horarios' && (
            <div style={s.section}>
              <SectionHeader icon="ti-clock" title={uis('Horarios de atención', 'Business Hours')} subtitle={uis('Fuera de horario el bot responde con un mensaje automático', 'Outside business hours the bot replies with an automatic message')} />

              <Field label="">
                <div style={s.toggleRow}>
                  <div>
                    <div style={{ fontSize: 13, color: '#c4c4d4', fontWeight: 500 }}>{uis('Activar horarios de atención', 'Enable business hours')}</div>
                    <div style={{ fontSize: 11, color: '#4a4a6a', marginTop: 2 }}>{uis('Si está desactivado, el bot responde las 24hs', 'If disabled, the bot responds 24/7')}</div>
                  </div>
                  <div style={{ ...s.toggleTrack, ...(config.schedule?.enabled ? s.toggleTrackOn : {}) }}
                    onClick={() => update('schedule', { ...config.schedule, enabled: !config.schedule?.enabled })}>
                    <div style={{ ...s.toggleThumb, ...(config.schedule?.enabled ? s.toggleThumbOn : {}) }} />
                  </div>
                </div>
              </Field>

              {config.schedule?.enabled && (
                <>
                  <Field label={uis('Zona horaria', 'Timezone')}>
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
                        {/* Fila principal */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            fontSize: 11, fontWeight: 600, minWidth: 64, textAlign: 'center',
                            color: hours.closed ? '#4a4a6a' : '#a78bfa',
                            background: hours.closed ? 'transparent' : '#1a1a2e',
                            border: hours.closed ? '0.5px solid #2e2e4e' : '0.5px solid #a78bfa55',
                            borderRadius: 6, padding: '3px 8px', transition: 'all 0.2s',
                          }}>
                            {day.charAt(0).toUpperCase() + day.slice(1)}
                          </span>
                          <div style={{ ...s.toggleTrackSm, ...(hours.closed ? {} : s.toggleTrackOn) }}
                            onClick={() => update('schedule', { ...config.schedule, hours: { ...config.schedule.hours, [day]: { ...hours, closed: !hours.closed } } })}>
                            <div style={{ ...s.toggleThumbSm, ...(!hours.closed ? s.toggleThumbOn : {}) }} />
                          </div>
                          {!hours.closed ? (
                            <>
                              <input style={s.timeInput} type="time" value={hours.open}
                                onChange={e => update('schedule', { ...config.schedule, hours: { ...config.schedule.hours, [day]: { ...hours, open: e.target.value } } })} />
                              <span style={{ fontSize: 12, color: '#3a3a5a', fontWeight: 600 }}>→</span>
                              <input style={s.timeInput} type="time" value={hours.close}
                                onChange={e => update('schedule', { ...config.schedule, hours: { ...config.schedule.hours, [day]: { ...hours, close: e.target.value } } })} />
                              <button
                                onClick={() => update('schedule', { ...config.schedule, hours: { ...config.schedule.hours, [day]: { ...hours, breaks: [...(hours.breaks ?? []), { start: '13:00', end: '14:00' }] } } })}
                                style={{ marginLeft: 'auto', fontSize: 10, color: '#a78bfa', background: '#12122a', border: '0.5px solid #a78bfa44', borderRadius: 20, padding: '4px 12px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 500 }}>
                                ☕ descanso
                              </button>
                            </>
                          ) : (
                            <span style={{ fontSize: 11, color: '#4a4a6a', marginLeft: 4 }}>Cerrado</span>
                          )}
                        </div>
                        {/* Chips de descanso */}
                        {!hours.closed && (hours.breaks ?? []).length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 82, paddingTop: 2 }}>
                            {(hours.breaks ?? []).map((b, i) => (
                              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#0d0d1e', border: '0.5px solid #2e2e5e', borderRadius: 20, padding: '3px 8px 3px 10px' }}>
                                <span style={{ fontSize: 10 }}>⏸</span>
                                <input style={s.timeInput} type="time" value={b.start}
                                  onChange={e => {
                                    const nb = [...(hours.breaks ?? [])]; nb[i] = { ...nb[i], start: e.target.value };
                                    update('schedule', { ...config.schedule, hours: { ...config.schedule.hours, [day]: { ...hours, breaks: nb } } });
                                  }} />
                                <span style={{ fontSize: 11, color: '#3a3a5a', fontWeight: 600 }}>→</span>
                                <input style={s.timeInput} type="time" value={b.end}
                                  onChange={e => {
                                    const nb = [...(hours.breaks ?? [])]; nb[i] = { ...nb[i], end: e.target.value };
                                    update('schedule', { ...config.schedule, hours: { ...config.schedule.hours, [day]: { ...hours, breaks: nb } } });
                                  }} />
                                <button
                                  onClick={() => {
                                    const nb = (hours.breaks ?? []).filter((_, j) => j !== i);
                                    update('schedule', { ...config.schedule, hours: { ...config.schedule.hours, [day]: { ...hours, breaks: nb } } });
                                  }}
                                  style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '0 2px', fontSize: 14, lineHeight: 1, marginLeft: 2 }}>×</button>
                              </span>
                            ))}
                          </div>
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
              <SectionHeader icon="ti-bell" title={uis('Notificaciones', 'Notifications')} subtitle={uis('Cómo y cuándo te avisamos sobre tu cuenta', 'How and when we notify you about your account')} />

              <Field label={uis('Email para escalaciones', 'Escalation email')} hint={uis('Te mandamos un email cuando el bot derive una conversación a humano', 'We send you an email when the bot transfers a conversation to a human')}>
                <div style={{ fontSize: 12, color: '#8b8baa', marginBottom: 6 }}>
                  {uis('Email de la cuenta:', 'Account email:')} <strong style={{ color: '#c4c4d4' }}>{userEmail || '—'}</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: useAlternateEmail ? 10 : 0 }}>
                  <div
                    style={{ ...s.toggleTrack, ...(useAlternateEmail ? s.toggleTrackOn : {}), width: 32, height: 18, flexShrink: 0 }}
                    onClick={() => {
                      const next = !useAlternateEmail
                      setUseAlternateEmail(next)
                      if (!next) update('escalation_email', '')
                    }}>
                    <div style={{ ...s.toggleThumb, ...(useAlternateEmail ? s.toggleThumbOn : {}) }} />
                  </div>
                  <span style={{ fontSize: 12, color: '#8b8baa' }}>{uis('Usar otro email para notificaciones', 'Use a different email for notifications')}</span>
                </div>
                {useAlternateEmail && (
                  <input style={s.input} type="email" value={config.escalation_email}
                    onChange={e => update('escalation_email', e.target.value)}
                    placeholder="otro@email.com" />
                )}
              </Field>

              <Field label="">
                <div style={s.toggleRow}>
                  <div>
                    <div style={{ fontSize: 13, color: '#c4c4d4', fontWeight: 500 }}>{uis('Resumen por email', 'Email summary')}</div>
                    <div style={{ fontSize: 11, color: '#4a4a6a', marginTop: 2 }}>{uis('Recibí un resumen con las métricas de tu negocio', 'Receive a summary with your business metrics')}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {config.daily_summary && (
                      <select value={config.summary_frequency}
                        onChange={e => update('summary_frequency', e.target.value)}
                        style={{ background: '#0d0d14', border: '0.5px solid #2e2e4e', borderRadius: 6, padding: '4px 8px', color: '#c4c4d4', fontSize: 11, cursor: 'pointer' }}>
                        <option value="daily">{uis('Diario', 'Daily')}</option>
                        <option value="weekly">{uis('Semanal', 'Weekly')}</option>
                      </select>
                    )}
                    <div style={{ ...s.toggleTrack, ...(config.daily_summary ? s.toggleTrackOn : {}) }}
                      onClick={() => update('daily_summary', !config.daily_summary)}>
                      <div style={{ ...s.toggleThumb, ...(config.daily_summary ? s.toggleThumbOn : {}) }} />
                    </div>
                  </div>
                </div>
              </Field>

            </div>
          )}

          {/* ── Apariencia ── */}
          {activeSection === 'apariencia' && (
            <div style={s.section}>
              <SectionHeader icon="ti-palette" title={uis('Apariencia', 'Appearance')} subtitle={uis('Personalizá los colores de tu dashboard — los cambios se aplican en vivo', 'Customize your dashboard colors — changes apply live')} />

              {/* Color de acento */}
              <Field label={uis('Color de acento', 'Accent color')} hint={uis('Afecta botones, íconos activos, badges y acentos en todo el dashboard', 'Affects buttons, active icons, badges and accents throughout the dashboard')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 3 }}>
                  <input type="color" value={config.accent_color}
                    onChange={e => { update('accent_color', e.target.value); onThemeChange?.(e.target.value, bgColor) }}
                    style={{ width: 44, height: 44, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 10, padding: 2 }} />
                  <span style={{ fontSize: 9, color: '#4a4a6a' }}>{uis('click para personalizar', 'click to customize')}</span>
                  </div>
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
              <Field label={uis('Color de fondo', 'Background color')} hint={uis('Cambia el tono base del dashboard — usá colores muy oscuros para mejores resultados', 'Changes the base tone of the dashboard — use very dark colors for best results')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 3 }}>
                  <input type="color" value={bgColor}
                    onChange={e => { setBgColor(e.target.value); onThemeChange?.(config.accent_color, e.target.value) }}
                    style={{ width: 44, height: 44, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 10, padding: 2 }} />
                  <span style={{ fontSize: 9, color: '#4a4a6a' }}>{uis('click para personalizar', 'click to customize')}</span>
                  </div>
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
                  <div style={{ background: 'linear-gradient(135deg, var(--accent-dark), var(--accent))', borderRadius: 8, padding: '6px 14px', fontSize: 12, color: '#fff', fontWeight: 500 }}>{uis('Botón principal', 'Main button')}</div>
                  <div style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-mid)', borderRadius: 8, padding: '6px 14px', fontSize: 12, color: 'var(--accent)' }}>{uis('Badge acento', 'Accent badge')}</div>
                  <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', fontSize: 12, color: '#e2e8f0' }}>{uis('Fondo panel', 'Panel background')}</div>
                </div>
              </div>

              <div style={{ marginTop: 14, padding: '10px 14px', background: '#1a1200', border: '1px solid #3a2500', borderRadius: 8, fontSize: 12, color: '#fde68a' }}>
                <i className="ti ti-info-circle" style={{ marginRight: 6 }} />
                {uis('Los cambios de color se aplican en vivo. Guardá para que persistan al recargar.', 'Color changes apply live. Save to persist them after reload.')}
              </div>

              {/* Fuente */}
              <Field label={uis('Fuente del dashboard', 'Dashboard font')} hint={uis('Se aplica en todo el dashboard — guardá para que persista', 'Applies to the entire dashboard — save to persist')}>
                {(() => {
                  const FONTS = [
                    { id: 'Inter',         desc: uis('Limpia y moderna (por defecto)', 'Clean and modern (default)') },
                    { id: 'DM Sans',       desc: uis('Amigable y redondeada', 'Friendly and rounded') },
                    { id: 'Space Grotesk', desc: uis('Geométrica y técnica', 'Geometric and technical') },
                    { id: 'Outfit',        desc: uis('Minimalista y legible', 'Minimalist and readable') },
                    { id: 'Nunito',        desc: uis('Suave y amigable', 'Soft and friendly') },
                    { id: 'Syne',          desc: uis('Futurista y llamativa', 'Futuristic and bold') },
                  ]
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                      {FONTS.map(f => (
                        <div key={f.id} onClick={() => applyFont(f.id)}
                          style={{
                            background: fontFamily === f.id ? 'var(--accent-dim)' : '#0d0d14',
                            border: `0.5px solid ${fontFamily === f.id ? 'var(--accent)' : '#1e1e2e'}`,
                            borderRadius: 10, padding: '10px 14px', cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}>
                          <div style={{ fontSize: 15, fontWeight: 600, color: fontFamily === f.id ? 'var(--accent)' : '#c4c4d4', fontFamily: `'${f.id}', system-ui, sans-serif`, marginBottom: 3 }}>
                            {f.id}
                          </div>
                          <div style={{ fontSize: 10, color: '#5a5a7a' }}>{f.desc}</div>
                          <div style={{ fontSize: 11, color: fontFamily === f.id ? 'var(--accent)' : '#4a4a6a', fontFamily: `'${f.id}', system-ui, sans-serif`, marginTop: 4 }}>
                            {uis('Hola, ¿cómo estás?', 'Hello, how are you?')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </Field>

              {/* Idioma de la interfaz */}
              <Field label={uis('Idioma de la interfaz', 'Interface language')} hint={uis('Cambia el idioma del dashboard (no afecta al bot)', 'Changes the dashboard language (does not affect the bot)')}>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['es', 'en'] as const).map(l => (
                    <button key={l}
                      onClick={() => setLang(l)}
                      style={{ padding: '6px 18px', borderRadius: 8, border: `1px solid ${lang === l ? 'var(--accent)' : '#2d2d3d'}`, background: lang === l ? 'var(--accent-dim)' : '#1a1a2e', color: lang === l ? 'var(--accent)' : '#6b7280', fontSize: 13, cursor: 'pointer', fontWeight: lang === l ? 600 : 400 }}>
                      {l === 'es' ? '🇦🇷 Español' : '🇺🇸 English'}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          )}

          {/* ── Integraciones ── */}
          {activeSection === 'integraciones' && (
            <div style={s.section}>
              <SectionHeader icon="ti-plug" title={uis('Integraciones', 'Integrations')} subtitle={uis('Conectá servicios externos a tu bot', 'Connect external services to your bot')} />

              {/* Google Calendar */}
              {!isPro ? (
                <div style={{ background: '#0d0d14', border: '0.5px solid #1e1e2e', borderRadius: 10, padding: '14px 16px', marginBottom: 10, opacity: 0.6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <i className="ti ti-calendar" style={{ fontSize: 18, color: '#4285f4' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Google Calendar</div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{uis('Disponible en el plan Pro', 'Available on the Pro plan')}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, background: '#2563eb22', color: '#60a5fa', border: '1px solid #2563eb44', borderRadius: 4, padding: '2px 8px' }}>PRO</span>
                  </div>
                </div>
              ) : (
                <IntegrationCard
                  icon="ti-calendar" iconColor="#4285f4"
                  name="Google Calendar"
                  description={config.google_refresh_token ? uis('El bot puede consultar disponibilidad y agendar turnos', 'The bot can check availability and schedule appointments') : uis('Conectá para que el bot pueda agendar turnos automáticamente', 'Connect so the bot can schedule appointments automatically')}
                  status={config.google_refresh_token ? 'connected' : 'disconnected'}
                  onConnect={async () => {
                    const { data: { session: _s } } = await supabase.auth.getSession()
                    const popup = window.open(`${import.meta.env.VITE_BACKEND_URL}/api/webhooks/calendar/connect/${businessId}?token=${_s?.access_token ?? ''}`, '_blank', 'width=600,height=700')
                    const timer = setInterval(() => { if (popup?.closed) { clearInterval(timer); loadConfig() } }, 1000)
                  }}
                  onDisconnect={async () => {
                    await supabase.from('businesses').update({ google_refresh_token: null, google_calendar_id: null }).eq('id', businessId!)
                    update('google_refresh_token', null); update('google_calendar_id', null)
                  }}
                />
              )}

              {/* Recordatorios automáticos */}
              <div style={{ background: '#0d0d14', border: `0.5px solid ${config.reminders_enabled ? '#2a3a2a' : '#1e1e2e'}`, borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className="ti ti-bell-ringing" style={{ fontSize: 18, color: '#f59e0b' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{uis('Recordatorios automáticos', 'Automatic reminders')}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                      {!config.google_refresh_token ? uis('Requiere Google Calendar conectado', 'Requires Google Calendar connected') : uis('Enviá recordatorios de turno por WhatsApp', 'Send appointment reminders via WhatsApp')}
                    </div>
                  </div>
                  <div style={{ ...s.toggleTrack, ...(config.reminders_enabled ? s.toggleTrackOn : {}), opacity: !config.google_refresh_token ? 0.4 : 1, cursor: !config.google_refresh_token ? 'not-allowed' : 'pointer' }}
                    onClick={async () => {
                      if (!config.google_refresh_token) return
                      const val = !config.reminders_enabled
                      await supabase.from('businesses').update({ reminders_enabled: val }).eq('id', businessId!)
                      update('reminders_enabled', val)
                    }}>
                    <div style={{ ...s.toggleThumb, ...(config.reminders_enabled ? s.toggleThumbOn : {}) }} />
                  </div>
                </div>
                {config.reminders_enabled && config.google_refresh_token && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #1e1e2e' }}>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>
                      {uis('¿Cuándo enviar el recordatorio? Podés elegir más de uno.', 'When to send the reminder? You can pick more than one.')}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {[
                        { label: uis('30 min antes', '30 min before'), value: 0.5, rec: false },
                        { label: uis('1 hora antes', '1 hour before'), value: 1, rec: false },
                        { label: uis('2 horas antes', '2 hours before'), value: 2, rec: false },
                        { label: uis('24 horas antes', '24 hours before'), value: 24, rec: true },
                        { label: uis('48 horas antes', '48 hours before'), value: 48, rec: true },
                      ].map(opt => {
                        const active = (config.reminder_hours_before || []).includes(opt.value)
                        return (
                          <button key={opt.value}
                            style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${active ? '#7c3aed' : opt.rec ? '#4c3a7a' : '#2d2d3d'}`, background: active ? '#3b1f6e' : '#1a1a2e', color: active ? '#c4b5fd' : '#6b7280', fontSize: 12, cursor: 'pointer' }}
                            onClick={async () => {
                              const current = config.reminder_hours_before || []
                              const next = (active ? current.filter((h: number) => h !== opt.value) : [...current, opt.value]).sort((a: number, b: number) => a - b)
                              const { error } = await supabase.from('businesses').update({ reminder_hours_before: next }).eq('id', businessId!)
                              if (error) { alert(uis('No se pudo guardar: ', 'Could not save: ') + error.message); return }
                              update('reminder_hours_before', next)
                            }}>
                            {opt.label}{opt.rec ? ' ★' : ''}
                          </button>
                        )
                      })}
                    </div>
                    <div style={{ fontSize: 10, color: '#5a5a7a', marginTop: 8 }}>
                      {uis('★ Recomendado. El de 24 h es el más efectivo para reducir ausencias.', '★ Recommended. 24 h is the most effective at reducing no-shows.')}
                    </div>
                  </div>
                )}
              </div>

              {/* Mercado Pago */}
              {!isPro ? (
                <div style={{ background: '#0d0d14', border: '0.5px solid #1e1e2e', borderRadius: 10, padding: '14px 16px', marginBottom: 10, opacity: 0.6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <i className="ti ti-brand-mastercard" style={{ fontSize: 18, color: '#00b1ea' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Mercado Pago</div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{uis('Disponible en el plan Pro', 'Available on the Pro plan')}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, background: '#2563eb22', color: '#60a5fa', border: '1px solid #2563eb44', borderRadius: 4, padding: '2px 8px' }}>PRO</span>
                  </div>
                </div>
              ) : (
                <IntegrationCard
                  icon="ti-brand-mastercard" iconColor="#00b1ea"
                  name="Mercado Pago"
                  description={config.mp_access_token ? 'El bot puede generar links de pago automáticamente' : 'Ingresá tu Access Token para que el bot envíe links de cobro'}
                  status={config.mp_access_token ? 'connected' : 'disconnected'}
                  onConnect={async () => {
                    const token = prompt('Pegá tu Mercado Pago Access Token:')
                    if (!token) return
                    await supabase.from('businesses').update({ mp_access_token: token }).eq('id', businessId!)
                    update('mp_access_token', token)
                  }}
                  onDisconnect={async () => {
                    await supabase.from('businesses').update({ mp_access_token: null }).eq('id', businessId!)
                    update('mp_access_token', null)
                  }}
                />
              )}

              {/* Google Sheets */}
              <div style={{ background: '#0d0d14', border: `0.5px solid ${config.sheets_refresh_token ? '#2a3a2a' : '#1e1e2e'}`, borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className="ti ti-table" style={{ fontSize: 18, color: '#34d399' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0' }}>Google Sheets</span>
                      {config.sheets_refresh_token && <span style={{ fontSize: 10, background: '#0a2e14', border: '0.5px solid #1a4a25', color: '#22c55e', borderRadius: 4, padding: '1px 6px' }}>Activo</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#4a4a6a', marginTop: 2 }}>
                      {config.sheets_refresh_token
                        ? config.sheets_spreadsheet_id
                          ? 'Sincronizado — contactos, turnos y conversaciones'
                          : 'Conectado — hacé clic en Exportar para crear la planilla'
                        : 'Exportá contactos, turnos y conversaciones a una planilla'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {config.sheets_refresh_token ? (
                      <>
                        <button
                          onClick={async () => {
                            try {
                              const { data: { session } } = await supabase.auth.getSession()
                              const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/webhooks/sheets/export/${businessId}`, { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token ?? ''}` } })
                              const { url } = await res.json()
                              if (url) window.open(url, '_blank')
                              // update local state with spreadsheet id from url
                              const id = url?.match(/\/d\/([^/]+)/)?.[1]
                              if (id) update('sheets_spreadsheet_id', id)
                            } catch { alert('Error exportando. Intentá de nuevo.') }
                          }}
                          style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: '#16162a', color: '#a78bfa', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Exportar
                        </button>
                        {config.sheets_spreadsheet_id && (
                          <button
                            onClick={() => window.open(`https://docs.google.com/spreadsheets/d/${config.sheets_spreadsheet_id}`, '_blank')}
                            style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: '#0a2e14', color: '#22c55e', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                            Abrir
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            await supabase.from('businesses').update({ sheets_refresh_token: null, sheets_spreadsheet_id: null }).eq('id', businessId!)
                            update('sheets_refresh_token', null); update('sheets_spreadsheet_id', null)
                          }}
                          style={{ padding: '6px 12px', borderRadius: 7, border: '0.5px solid #3e1a1a', background: 'transparent', color: '#f87171', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Desconectar
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          const popup = (async () => { const { data: { session: _ss } } = await supabase.auth.getSession(); window.open(`${import.meta.env.VITE_BACKEND_URL}/api/webhooks/sheets/connect/${businessId}?token=${_ss?.access_token ?? ''}`, '_blank', 'width=600,height=700') })()
                          const timer = setInterval(() => { if (popup?.closed) { clearInterval(timer); loadConfig() } }, 1000)
                        }}
                        style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Conectar
                      </button>
                    )}
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ── Turnos ── */}
          {activeSection === 'turnos' && (
            <div style={s.section}>
              <SectionHeader icon="ti-calendar-event" title={uis('Configuración de turnos', 'Appointment settings')} subtitle={uis('Definí las categorías de servicio y su duración por defecto', 'Define service categories and their default duration')} />

              {/* Lista de categorías */}
              <div style={{ marginBottom: 20 }}>
                {(config.appointment_categories ?? []).length === 0 && (
                  <div style={{ fontSize: 13, color: '#4a4a6a', padding: '16px 0' }}>{uis('No hay categorías todavía. Agregá una abajo.', 'No categories yet. Add one below.')}</div>
                )}
                {(config.appointment_categories ?? []).map((cat) => (
                  <div key={cat.id} style={{ background: '#0d0d14', border: `0.5px solid ${editingCatId === cat.id ? cat.color + '88' : '#1e1e2e'}`, borderRadius: 10, padding: '12px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
                    {editingCatId === cat.id ? (
                      <div style={{ flex: 1, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }}>
                        <input
                          style={{ ...s.input, flex: 1, minWidth: 120 }}
                          value={cat.name}
                          onChange={e => update('appointment_categories', config.appointment_categories.map(c => c.id === cat.id ? { ...c, name: e.target.value } : c))}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            style={{ ...s.input, width: 70 }}
                            type="number" min={5} max={480} step={5}
                            value={cat.duration_minutes}
                            onChange={e => update('appointment_categories', config.appointment_categories.map(c => c.id === cat.id ? { ...c, duration_minutes: parseInt(e.target.value) } : c))}
                          />
                          <span style={{ fontSize: 12, color: '#4a4a6a', whiteSpace: 'nowrap' as const }}>min</span>
                        </div>
                        <input type="color" value={cat.color}
                          onChange={e => update('appointment_categories', config.appointment_categories.map(c => c.id === cat.id ? { ...c, color: e.target.value } : c))}
                          style={{ width: 32, height: 32, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 6, padding: 2 }} />
                        <button onClick={() => setEditingCatId(null)} style={{ ...s.addBtn, fontSize: 12 }}>✓ {uis('Listo', 'Done')}</button>
                      </div>
                    ) : (
                      <>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0' }}>{cat.name}</span>
                          <span style={{ fontSize: 12, color: '#4a4a6a', marginLeft: 10 }}>⏱ {cat.duration_minutes} min</span>
                        </div>
                        <button onClick={() => setEditingCatId(cat.id)} style={{ background: 'none', border: 'none', color: '#6a6a8a', cursor: 'pointer', fontSize: 13, padding: '4px 6px' }}>
                          <i className="ti ti-pencil" />
                        </button>
                        <button onClick={() => update('appointment_categories', config.appointment_categories.filter(c => c.id !== cat.id))}
                          style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 13, padding: '4px 6px' }}>
                          <i className="ti ti-trash" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Agregar categoría */}
              <div style={{ background: '#0d0d14', border: '0.5px solid #2e2e4e', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, color: '#8b8baa', marginBottom: 10, fontWeight: 500 }}>{uis('Nueva categoría', 'New category')}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                  <input
                    style={{ ...s.input, flex: 1, minWidth: 140 }}
                    placeholder={uis('Nombre del servicio (ej: Corte, Consulta)', 'Service name (e.g. Haircut, Consultation)')}
                    value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newCatName.trim()) {
                        update('appointment_categories', [...(config.appointment_categories ?? []), { id: crypto.randomUUID(), name: newCatName.trim(), duration_minutes: newCatDuration, color: newCatColor }])
                        setNewCatName(''); setNewCatDuration(30)
                      }
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      style={{ ...s.input, width: 70 }}
                      type="number" min={5} max={480} step={5}
                      value={newCatDuration}
                      onChange={e => setNewCatDuration(parseInt(e.target.value))}
                    />
                    <span style={{ fontSize: 12, color: '#4a4a6a', whiteSpace: 'nowrap' as const }}>min</span>
                  </div>
                  <input type="color" value={newCatColor} onChange={e => setNewCatColor(e.target.value)}
                    style={{ width: 36, height: 36, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 6, padding: 2 }} />
                  <button
                    onClick={() => {
                      if (!newCatName.trim()) return
                      update('appointment_categories', [...(config.appointment_categories ?? []), { id: crypto.randomUUID(), name: newCatName.trim(), duration_minutes: newCatDuration, color: newCatColor }])
                      setNewCatName(''); setNewCatDuration(30)
                    }}
                    style={s.addBtn}>
                    + {uis('Agregar', 'Add')}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: '#3a3a5a', marginTop: 8 }}>
                  {uis('Las categorías aparecerán como filtros en la sección Turnos y definen la duración por defecto de cada servicio.', 'Categories appear as filters in the Appointments section and define the default duration per service.')}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Save bar */}
        <div style={s.saveBar}>
          <span style={{ fontSize: 12, color: '#4a4a6a' }}>
            {saved ? uis('✅ Guardado correctamente', '✅ Saved successfully') : uis('Los cambios se aplican en la próxima conversación', 'Changes apply from the next conversation')}
          </span>
          <button onClick={saveConfig} disabled={saving} style={s.saveBtn}>
            {saving ? uis('Guardando...', 'Saving...') : uis('Guardar cambios', 'Save changes')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function IntegrationCard({ icon, iconColor, name, description, status, connectLabel = 'Conectar', disconnectLabel = 'Desconectar', onConnect, onDisconnect }: {
  icon: string; iconColor: string; name: string; description: string
  status: 'connected' | 'disconnected' | 'disabled'
  connectLabel?: string; disconnectLabel?: string
  onConnect?: () => void; onDisconnect?: () => void
}) {
  const isConnected = status === 'connected'
  const isDisabled = status === 'disabled'
  return (
    <div style={{ background: '#0d0d14', border: `0.5px solid ${isConnected ? '#2a3a2a' : '#1e1e2e'}`, borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className={`ti ${icon}`} style={{ fontSize: 18, color: iconColor }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0' }}>{name}</span>
            {isConnected && <span style={{ fontSize: 10, background: '#0a2e14', border: '0.5px solid #1a4a25', color: '#22c55e', borderRadius: 4, padding: '1px 6px' }}>Activo</span>}
          </div>
          <div style={{ fontSize: 11, color: isDisabled ? '#2a2a4a' : '#4a4a6a', marginTop: 2 }}>{description}</div>
        </div>
        {!isDisabled && (
          isConnected ? (
            <button onClick={onDisconnect}
              style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 7, border: '0.5px solid #3e1a1a', background: 'transparent', color: '#f87171', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
              {disconnectLabel}
            </button>
          ) : (
            <button onClick={onConnect}
              style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
              {connectLabel}
            </button>
          )
        )}
      </div>
    </div>
  )
}

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
  sectNav: { background: '#0d0d14', borderRight: '0.5px solid #1e1e2e', padding: '16px 8px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto', overflowX: 'hidden' as const },
  sectNavTitle: { fontSize: 8.5, color: '#3a3a5a', textTransform: 'uppercase', letterSpacing: 0, fontWeight: 600, padding: '0 4px', marginBottom: 8, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },
  sectBtn: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 7, border: 'none', background: 'transparent', color: '#7a7a9a', fontSize: 12, fontWeight: 500, cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'color 0.15s, background 0.15s', letterSpacing: '0.01em' },
  sectBtnActive: { background: '#16162a', color: '#c4b5fd' },
  content: { display: 'grid', gridTemplateRows: '1fr auto', overflow: 'hidden' },
  contentInner: { overflowY: 'auto', padding: 24 },
  section: { maxWidth: 680 },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#4a4a6a', fontSize: 13 },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  input: { width: '100%', background: '#0d0d14', border: '0.5px solid #2e2e4e', borderRadius: 8, padding: '8px 10px', color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const },
  textarea: { width: '100%', background: '#0d0d14', border: '0.5px solid #2e2e4e', borderRadius: 8, padding: '8px 10px', color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const, minHeight: 80 },
  select: { width: '100%', background: '#0d0d14', border: '0.5px solid #2e2e4e', borderRadius: 8, padding: '8px 10px', color: '#e2e8f0', fontSize: 13, outline: 'none' },
  toneGrid: { display: 'flex', flexWrap: 'wrap' as const, gap: 6 },
  langGrid: { display: 'flex', gap: 6 },
  toneBtn: { background: '#0d0d14', border: '0.5px solid #2e2e4e', borderRadius: 6, padding: '5px 12px', fontSize: 12, color: '#8b8baa', cursor: 'pointer' },
  toneBtnActive: { background: '#1a1a2e', borderColor: '#a78bfa', color: '#a78bfa' },
  addBtn: { background: '#1a1a2e', border: '0.5px solid #2e2e4e', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#a78bfa', cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0 },
  toggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0d0d14', border: '0.5px solid #1e1e2e', borderRadius: 10, padding: '12px 14px' },
  toggleTrack: { width: 40, height: 22, borderRadius: 11, background: '#2e2e4e', position: 'relative' as const, cursor: 'pointer', transition: 'background 0.25s', flexShrink: 0 },
  toggleTrackOn: { background: '#7c3aed' },
  toggleThumb: { position: 'absolute' as const, top: '50%', transform: 'translateY(-50%)', left: 3, width: 16, height: 16, borderRadius: '50%', background: '#6a6a8a', transition: 'left 0.25s, background 0.25s' },
  toggleThumbOn: { left: 21, background: '#fff' },
  toggleTrackSm: { width: 32, height: 18, borderRadius: 9, background: '#2e2e4e', position: 'relative' as const, cursor: 'pointer', transition: 'background 0.25s', flexShrink: 0 },
  toggleThumbSm: { position: 'absolute' as const, top: 2, left: 2, width: 14, height: 14, borderRadius: '50%', background: '#6a6a8a', transition: 'left 0.25s, background 0.25s' },
  scheduleGrid: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  scheduleRow: { display: 'flex', flexDirection: 'column' as const, gap: 6, background: '#0d0d14', border: '0.5px solid #1e1e2e', borderRadius: 10, padding: '10px 14px' },
  dayLabel: { fontSize: 12, fontWeight: 500, color: '#c4c4d4' },
  timeInput: { background: '#111122', border: '0.5px solid #2e2e4e', borderRadius: 6, padding: '4px 6px', color: '#e2e8f0', fontSize: 12, outline: 'none' },
  saveBar: { borderTop: '0.5px solid #1e1e2e', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0d0d14' },
  saveBtn: { background: '#a78bfa', border: 'none', borderRadius: 8, padding: '8px 20px', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
}
