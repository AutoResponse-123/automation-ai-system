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
  mp_payment_link: string | null
  sheets_refresh_token: string | null
  sheets_spreadsheet_id: string | null
  menu_content_sid: string | null
  appointment_categories: AppointmentCategory[]
  conversation_tags: ConversationTag[]
  schedule: {
    enabled: boolean
    timezone: string
    slot_mode?: 'fixed' | 'per_service'
    fixed_duration?: number
    buffer_minutes?: number
    slot_step?: number
    appointments_enabled?: boolean
    label?: string
    last_slot_starts_at_close?: boolean
    session_timeout_hours?: number
    escalation_keyword_enabled?: boolean
    escalation_limit_enabled?: boolean
    escalation_on_error?: boolean
    escalation_bot_decides?: boolean
    escalation_auto_resume_hours?: number
    hours: Record<string, { open: string; close: string; closed: boolean; breaks?: Array<{ start: string; end: string }> }>
    blocked_dates?: string[]
  }
}

const DEFAULT_SCHEDULE = {
  enabled: false,
  timezone: 'America/Argentina/Buenos_Aires',
  slot_mode: 'fixed',
  fixed_duration: 60,
  buffer_minutes: 0,
  appointments_enabled: true,
  label: '',
  last_slot_starts_at_close: false,
  session_timeout_hours: 6,
  escalation_keyword_enabled: true,
  escalation_limit_enabled: true,
  escalation_on_error: true,
  escalation_bot_decides: true,
  escalation_auto_resume_hours: 0,
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

type Section = 'personalidad' | 'negocio' | 'escalacion' | 'horarios' | 'notificaciones' | 'apariencia' | 'integraciones' | 'etiquetas' | 'turnos'

interface AppointmentCategory {
  id: string
  name: string
  duration_minutes: number
  color: string
}

interface ConversationTag {
  id: string
  label: string
  color: string
}

// Etiquetas por defecto (las mismas que trae el Inbox). El dueño puede editarlas.
const DEFAULT_TAGS: ConversationTag[] = [
  { id: 'venta',       label: 'Venta',       color: '#22a7f0' },
  { id: 'soporte',     label: 'Soporte',     color: '#38bdf8' },
  { id: 'urgente',     label: 'Urgente',     color: '#f87171' },
  { id: 'turno',       label: 'Turno',       color: '#1585c7' },
  { id: 'consulta',    label: 'Consulta',    color: '#f59e0b' },
  { id: 'seguimiento', label: 'Seguimiento', color: '#fb923c' },
  { id: 'reclamo',     label: 'Reclamo',     color: '#e879f9' },
  { id: 'resuelto',    label: 'Resuelto',    color: '#4fc3f7' },
]

export default function Settings({ onSave, businessId, onThemeChange, onFontChange, plan = 'trial' }: {
  onSave?: () => void
  businessId: string | null
  onThemeChange?: (accent?: string, bg?: string) => void
  onFontChange?: (font: string) => void
  plan?: string
}) {
  // Features Pro habilitadas para Pro, Enterprise y el trial (para que prueben). Basic no.
  const isPro = plan === 'pro' || plan === 'enterprise' || plan === 'trial'
  const { lang, setLang } = useLang()
  const uis = (es: string, en: string) => lang === 'en' ? en : es
  useNotifications()
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
  const [fixedDurCustom, setFixedDurCustom] = useState(false)
  const [bufferCustom, setBufferCustom] = useState(false)
  const [sessionTimeoutCustom, setSessionTimeoutCustom] = useState(false)
  const [autoResumeCustom, setAutoResumeCustom] = useState(false)
  const [newReminderQty, setNewReminderQty] = useState('')
  const [newReminderUnit, setNewReminderUnit] = useState('min')
  const [bgColor, setBgColor] = useState<string>(() => localStorage.getItem('ar_bg_color') ?? 'var(--bg-base)')
  const [fontFamily, setFontFamily] = useState<string>(() => localStorage.getItem('ar_font') ?? 'Bricolage Grotesque')

  // Prueba de resumen por email
  const [testingSummary, setTestingSummary] = useState(false)
  const [summaryTestMsg, setSummaryTestMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // Builder del menú de botones del bot
  const [menuBody, setMenuBody] = useState('¿En qué te puedo ayudar?')
  const [menuButtons, setMenuButtons] = useState<string[]>(['Agendar turno', 'Ver servicios', 'Hablar con alguien'])
  const [menuSaving, setMenuSaving] = useState(false)
  const [menuMsg, setMenuMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // Feriados / vacaciones: agrega un día suelto o un rango de fechas.
  const [vacFrom, setVacFrom] = useState('')
  const [vacTo, setVacTo] = useState('')

  function addBlockedDates() {
    if (!vacFrom || !config) return
    const to = vacTo && vacTo >= vacFrom ? vacTo : vacFrom
    const dates: string[] = []
    const cur = new Date(vacFrom + 'T00:00:00Z')
    const end = new Date(to + 'T00:00:00Z')
    while (cur <= end && dates.length < 366) {
      dates.push(cur.toISOString().slice(0, 10))
      cur.setUTCDate(cur.getUTCDate() + 1)
    }
    const existing: string[] = config.schedule?.blocked_dates || []
    const merged = Array.from(new Set([...existing, ...dates])).sort()
    update('schedule', { ...config.schedule, blocked_dates: merged })
    setVacFrom(''); setVacTo('')
  }

  async function saveMenu() {
    setMenuMsg(null)
    const btns = menuButtons.map(b => b.trim()).filter(Boolean)
    if (!menuBody.trim()) { setMenuMsg({ kind: 'err', text: 'Escribí el mensaje del menú.' }); return }
    if (btns.length === 0) { setMenuMsg({ kind: 'err', text: 'Agregá al menos un botón.' }); return }
    setMenuSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/broadcasts/menu`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ businessId, body: menuBody.trim(), buttons: btns }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Error al crear el menú')
      update('menu_content_sid', j.sid)
      setMenuMsg({ kind: 'ok', text: '¡Menú creado! El bot ya puede mostrar estos botones.' })
    } catch (e: any) {
      setMenuMsg({ kind: 'err', text: e.message })
    } finally {
      setMenuSaving(false)
    }
  }

  async function deactivateMenu() {
    setMenuMsg(null)
    setMenuSaving(true)
    try {
      const { error } = await supabase.from('businesses').update({ menu_content_sid: null }).eq('id', businessId)
      if (error) throw error
      update('menu_content_sid', null)
      setMenuMsg({ kind: 'ok', text: 'Menú desactivado. El bot ya no muestra botones.' })
    } catch (e: any) {
      setMenuMsg({ kind: 'err', text: 'No se pudo desactivar.' })
    } finally {
      setMenuSaving(false)
    }
  }

  function applyFont(font: string) {
    const existing = document.getElementById('ar-font-link')
    if (existing) existing.remove()
    if (font !== 'Inter' && font !== 'Bricolage Grotesque') {
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
  const [newCatColor, setNewCatColor] = useState('#1585c7')
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [newTagLabel, setNewTagLabel] = useState('')
  const [newTagColor, setNewTagColor] = useState('#22a7f0')
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
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
        accent_color: data.accent_color ?? '#1585c7',
        google_calendar_id: data.google_calendar_id ?? null,
        google_refresh_token: data.google_refresh_token ?? null,
        reminders_enabled: data.reminders_enabled ?? false,
        reminder_hours_before: data.reminder_hours_before ?? [24],
        mp_access_token: data.mp_access_token ?? null,
        mp_payment_link: data.mp_payment_link ?? null,
        sheets_refresh_token: data.sheets_refresh_token ?? null,
        sheets_spreadsheet_id: data.sheets_spreadsheet_id ?? null,
        appointment_categories: data.appointment_categories ?? [],
        conversation_tags: (data.conversation_tags?.length ? data.conversation_tags : DEFAULT_TAGS),
        schedule: data.schedule ?? DEFAULT_SCHEDULE,
        menu_content_sid: data.menu_content_sid ?? null,
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
      conversation_tags: config.conversation_tags,
      menu_content_sid: config.menu_content_sid,
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

  // Envía un resumen de prueba al instante (usa el login, no el secreto del cron).
  async function sendTestSummary() {
    setSummaryTestMsg(null)
    setTestingSummary(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/notifications/test-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ period: config?.summary_frequency ?? 'daily' }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'No se pudo enviar')
      setSummaryTestMsg({ kind: 'ok', text: uis(`Resumen enviado a ${j.sentTo}. Revisá el correo (mirá spam la primera vez).`, `Summary sent to ${j.sentTo}. Check your inbox (spam the first time).`) })
    } catch (e: any) {
      setSummaryTestMsg({ kind: 'err', text: e.message })
    } finally {
      setTestingSummary(false)
    }
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
    etiquetas:      ['Etiquetas',        'Labels'],
    turnos:         [config.schedule?.label?.trim() || 'Turnos', config.schedule?.label?.trim() || 'Appointments'],
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
    { id: 'etiquetas',      icon: 'ti-tag',            label: sl('etiquetas') },
    { id: 'turnos',         icon: 'ti-calendar-event', label: sl('turnos') },
  ]

  return (
    <div style={s.container} className="settings-shell">
      {/* Sidebar de secciones */}
      {isMobile ? (
        /* Mobile: dropdown selector */
        <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--border-mid)', position: 'relative' as const }}>
          <button
            onClick={() => setShowSectionDropdown(p => !p)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'var(--bg-card)', border: '0.5px solid var(--border-mid)', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit' }}
          >
            <i className={`ti ${sections.find(s => s.id === activeSection)?.icon}`} style={{ fontSize: 16, color: '#1585c7' }} />
            <span style={{ flex: 1, textAlign: 'left' as const, fontWeight: 500 }}>
              {sections.find(s => s.id === activeSection)?.label}
            </span>
            <i className={`ti ti-chevron-${showSectionDropdown ? 'up' : 'down'}`} style={{ fontSize: 14, color: 'var(--text-3)' }} />
          </button>
          {showSectionDropdown && (
            <div className="popover-enter" style={{ position: 'absolute' as const, top: '100%', left: 14, right: 14, background: 'var(--bg-card)', border: '0.5px solid var(--border-mid)', borderRadius: 10, padding: 6, zIndex: 300, boxShadow: '0 8px 24px rgba(0,0,0,0.7)', marginTop: 4 }}>
              {sections.map(sec => {
                const isActive = activeSection === sec.id
                return (
                  <button key={sec.id} onClick={() => { setActiveSection(sec.id as Section); setShowSectionDropdown(false) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: isActive ? 'var(--border)' : 'transparent', border: 'none', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', color: isActive ? '#3aa9e5' : 'var(--text-2)', fontSize: 13, fontFamily: 'inherit' }}
                  >
                    <i className={`ti ${sec.icon}`} style={{ fontSize: 15 }} />
                    {sec.label}
                    {isActive && <i className="ti ti-check" style={{ fontSize: 12, marginLeft: 'auto', color: '#1585c7' }} />}
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
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = '#1585c7' }}
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
                  placeholder={uis('Ej: ¡Hasta pronto! 👋', 'E.g.: See you soon! 👋')} color="#1585c7" />
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

              <Field label="">
                <div style={s.toggleRow}>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{uis('Derivar por palabras clave', 'Hand off on keywords')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{uis('Derivar a un humano cuando el cliente escribe alguna de las palabras de abajo.', 'Hand off when the client writes one of the keywords below.')}</div>
                  </div>
                  <div style={{ ...s.toggleTrack, ...((config.schedule?.escalation_keyword_enabled !== false) ? s.toggleTrackOn : {}) }}
                    onClick={() => update('schedule', { ...config.schedule, escalation_keyword_enabled: !(config.schedule?.escalation_keyword_enabled !== false) })}>
                    <div style={{ ...s.toggleThumb, ...((config.schedule?.escalation_keyword_enabled !== false) ? s.toggleThumbOn : {}) }} />
                  </div>
                </div>
              </Field>

{(config.schedule?.escalation_keyword_enabled !== false) && (
              <Field label={uis('Palabras clave para escalar', 'Keywords to escalate')} hint={uis('Si el cliente escribe alguna de estas palabras, la conversación se escala automáticamente a un humano', 'If the client writes any of these words, the conversation is automatically escalated to a human')}>
                <TagInput tags={config.escalation_keywords} value={newKeyword} onChange={setNewKeyword}
                  onAdd={() => addTag('escalation_keywords', newKeyword, setNewKeyword)}
                  onRemove={(i) => removeTag('escalation_keywords', i)}
                  placeholder={uis('Ej: hablar con alguien, persona, urgente', 'E.g.: speak to someone, human, urgent')} color="#f59e0b" />
              </Field>
              )}

              <Field label="">
                <div style={s.toggleRow}>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{uis('Derivar por cantidad de mensajes', 'Hand off by message count')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{uis('Derivar si la conversación supera el máximo de abajo sin resolverse.', 'Hand off if the chat exceeds the max below without resolution.')}</div>
                  </div>
                  <div style={{ ...s.toggleTrack, ...((config.schedule?.escalation_limit_enabled !== false) ? s.toggleTrackOn : {}) }}
                    onClick={() => update('schedule', { ...config.schedule, escalation_limit_enabled: !(config.schedule?.escalation_limit_enabled !== false) })}>
                    <div style={{ ...s.toggleThumb, ...((config.schedule?.escalation_limit_enabled !== false) ? s.toggleThumbOn : {}) }} />
                  </div>
                </div>
              </Field>

{(config.schedule?.escalation_limit_enabled !== false) && (
              <Field label={uis('Máximo de mensajes antes de escalar', 'Max messages before escalating')} hint={uis('Si la conversación supera este número sin resolverse, se escala automáticamente', 'If the conversation exceeds this number without resolution, it escalates automatically')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input style={{ ...s.input, width: 80 }} type="number" min={1} max={50}
                    value={config.max_messages_before_escalation}
                    onChange={e => update('max_messages_before_escalation', parseInt(e.target.value))} />
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{uis('mensajes', 'messages')}</span>
                </div>
              </Field>
              )}

              {/* Derivar ante error técnico */}
              <Field label="">
                <div style={s.toggleRow}>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{uis('Derivar a un humano ante un error técnico', 'Hand off to a human on technical error')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{uis('Si el bot tiene un error, deja de responder y avisa al equipo en vez de seguir solo.', 'If the bot errors, it stops and notifies the team instead of continuing alone.')}</div>
                  </div>
                  <div style={{ ...s.toggleTrack, ...((config.schedule?.escalation_on_error !== false) ? s.toggleTrackOn : {}) }}
                    onClick={() => update('schedule', { ...config.schedule, escalation_on_error: !(config.schedule?.escalation_on_error !== false) })}>
                    <div style={{ ...s.toggleThumb, ...((config.schedule?.escalation_on_error !== false) ? s.toggleThumbOn : {}) }} />
                  </div>
                </div>
              </Field>

              {/* El bot puede derivar por su cuenta */}
              <Field label="">
                <div style={s.toggleRow}>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{uis('Permitir que el bot derive cuando no puede ayudar', 'Let the bot hand off when it cannot help')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{uis('El bot puede pasar la conversación a una persona si no puede resolverla o si el cliente lo pide.', 'The bot can pass the chat to a person if it cannot solve it or the client asks.')}</div>
                  </div>
                  <div style={{ ...s.toggleTrack, ...((config.schedule?.escalation_bot_decides !== false) ? s.toggleTrackOn : {}) }}
                    onClick={() => update('schedule', { ...config.schedule, escalation_bot_decides: !(config.schedule?.escalation_bot_decides !== false) })}>
                    <div style={{ ...s.toggleThumb, ...((config.schedule?.escalation_bot_decides !== false) ? s.toggleThumbOn : {}) }} />
                  </div>
                </div>
              </Field>

              <Field label={uis('Reactivar la IA automáticamente tras derivar', 'Auto-resume AI after handoff')} hint={uis('Al derivar, la IA queda en pausa y atiende un humano. Por defecto la reactiva el dueño desde el panel; acá podés hacer que vuelva sola tras un tiempo sin actividad.', 'After a handoff the AI is paused and a human takes over. By default a human resumes it; here you can make it auto-resume after some inactivity.')}>
                {(() => {
                  const RES_PRESETS = [1, 3, 6, 12, 24]
                  const cur = config.schedule?.escalation_auto_resume_hours ?? 0
                  const isCustom = autoResumeCustom || (cur !== 0 && !RES_PRESETS.includes(cur))
                  return (<>
                    <select style={{ ...s.select, maxWidth: 280 }} value={cur === 0 ? '0' : (isCustom ? 'custom' : String(cur))}
                      onChange={e => {
                        if (e.target.value === 'custom') { setAutoResumeCustom(true) }
                        else { setAutoResumeCustom(false); update('schedule', { ...config.schedule, escalation_auto_resume_hours: Number(e.target.value) }) }
                      }}>
                      <option value="0">{uis('Solo manual (recomendado)', 'Manual only (recommended)')}</option>
                      <option value={1}>{uis('Tras 1 hora', 'After 1 hour')}</option>
                      <option value={3}>{uis('Tras 3 horas', 'After 3 hours')}</option>
                      <option value={6}>{uis('Tras 6 horas', 'After 6 hours')}</option>
                      <option value={12}>{uis('Tras 12 horas', 'After 12 hours')}</option>
                      <option value={24}>{uis('Tras 24 horas', 'After 24 hours')}</option>
                      <option value="custom">{uis('Personalizado', 'Custom')}</option>
                    </select>
                    {isCustom && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                        <input style={{ ...s.input, width: 90 }} type="number" min={1} max={720} step={1}
                          value={cur}
                          onChange={e => update('schedule', { ...config.schedule, escalation_auto_resume_hours: Math.max(1, Number(e.target.value) || 1) })} />
                        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{uis('horas', 'hours')}</span>
                      </div>
                    )}
                  </>)
                })()}
              </Field>

              <Field label={uis('Reiniciar la conversación tras inactividad', 'Reset conversation after inactivity')} hint={uis('Si un cliente vuelve a escribir después de este tiempo, el bot arranca una conversación nueva y no arrastra contexto viejo (fechas, horarios ofrecidos, etc.). El historial y el resumen del cliente se mantienen.', 'If a client writes again after this time, the bot starts a fresh conversation and does not carry old context. The client history/summary is kept.')}>
                {(() => {
                  const PRESETS = [1, 3, 6, 12, 24, 48]
                  const cur = config.schedule?.session_timeout_hours ?? 6
                  const isCustom = sessionTimeoutCustom || (cur !== 0 && !PRESETS.includes(cur))
                  return (<>
                    <select style={{ ...s.select, maxWidth: 260 }} value={cur === 0 ? '0' : (isCustom ? 'custom' : String(cur))}
                      onChange={e => {
                        if (e.target.value === 'custom') { setSessionTimeoutCustom(true) }
                        else { setSessionTimeoutCustom(false); update('schedule', { ...config.schedule, session_timeout_hours: Number(e.target.value) }) }
                      }}>
                      <option value="0">{uis('Nunca reiniciar', 'Never reset')}</option>
                      <option value={1}>{uis('1 hora', '1 hour')}</option>
                      <option value={3}>{uis('3 horas', '3 hours')}</option>
                      <option value={6}>{uis('6 horas (recomendado)', '6 hours (recommended)')}</option>
                      <option value={12}>{uis('12 horas', '12 hours')}</option>
                      <option value={24}>{uis('24 horas', '24 hours')}</option>
                      <option value={48}>{uis('48 horas', '48 hours')}</option>
                      <option value="custom">{uis('Personalizado', 'Custom')}</option>
                    </select>
                    {isCustom && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                        <input style={{ ...s.input, width: 90 }} type="number" min={1} max={720} step={1}
                          value={cur}
                          onChange={e => update('schedule', { ...config.schedule, session_timeout_hours: Math.max(1, Number(e.target.value) || 1) })} />
                        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{uis('horas', 'hours')}</span>
                      </div>
                    )}
                  </>)
                })()}
              </Field>
            </div>
          )}

          {/* ── Horarios ── */}
          {activeSection === 'horarios' && (
            <div style={s.section}>
              <SectionHeader icon="ti-clock" title={uis('Horarios de atención', 'Business Hours')} subtitle={uis('Definí los horarios en los que el bot puede agendar turnos', 'Set the hours when the bot can schedule appointments')} />

              <Field label="">
                <div style={s.toggleRow}>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{uis('Avisar cuando estás fuera de horario', 'Notify when outside business hours')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{uis('Si está activado, el bot avisa "fuera de horario" en vez de atender. Dejalo desactivado para atender 24hs — los horarios de abajo definen los turnos igual.', 'If enabled, the bot replies "outside hours" instead of helping. Leave it off to attend 24/7 — the hours below still define bookings.')}</div>
                  </div>
                  <div style={{ ...s.toggleTrack, ...(config.schedule?.enabled ? s.toggleTrackOn : {}) }}
                    onClick={() => update('schedule', { ...config.schedule, enabled: !config.schedule?.enabled })}>
                    <div style={{ ...s.toggleThumb, ...(config.schedule?.enabled ? s.toggleThumbOn : {}) }} />
                  </div>
                </div>
              </Field>

              {(
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

                  <Field label={uis('Feriados / vacaciones', 'Holidays / time off')} hint={uis('Días sueltos (feriados) o un rango (vacaciones) en los que no se atiende. El bot no ofrece ni agenda turnos esos días.', 'Single days (holidays) or a range (time off) with no service. The bot will not offer or book appointments on those days.')}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{uis('Desde', 'From')}</span>
                        <input type="date" style={{ ...s.input, maxWidth: 170 }} value={vacFrom} onChange={e => setVacFrom(e.target.value)} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{uis('Hasta (opcional)', 'To (optional)')}</span>
                        <input type="date" style={{ ...s.input, maxWidth: 170 }} value={vacTo} min={vacFrom} onChange={e => setVacTo(e.target.value)} />
                      </div>
                      <button type="button" onClick={addBlockedDates} disabled={!vacFrom}
                        style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 500, cursor: vacFrom ? 'pointer' : 'default', fontFamily: 'inherit', opacity: vacFrom ? 1 : 0.5 }}>
                        {uis('Agregar', 'Add')}
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                      {(config.schedule?.blocked_dates || []).length === 0 && (
                        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{uis('No hay días cerrados cargados.', 'No closed days yet.')}</span>
                      )}
                      {(config.schedule?.blocked_dates || []).map((d: string) => (
                        <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--accent-dim)', color: 'var(--accent)', border: '0.5px solid var(--accent)', borderRadius: 20, padding: '4px 6px 4px 11px', fontSize: 12 }}>
                          {new Date(d + 'T12:00:00').toLocaleDateString(uis('es-AR', 'en-US'), { weekday: 'short', day: 'numeric', month: 'short' })}
                          <button
                            type="button"
                            onClick={() => update('schedule', { ...config.schedule, blocked_dates: (config.schedule?.blocked_dates || []).filter((x: string) => x !== d) })}
                            style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 14, display: 'flex', padding: 0 }}
                            aria-label="Quitar"
                          >
                            <i className="ti ti-x" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </Field>

                  <Field label={uis('Tiempo entre turnos (buffer)', 'Time between appointments (buffer)')}>
                    {(() => {
                      const PRESETS = [0, 5, 10, 15, 20, 30]
                      const cur = config.schedule?.buffer_minutes ?? 0
                      const isCustom = bufferCustom || !PRESETS.includes(cur)
                      return (<>
                        <select style={s.select} value={isCustom ? 'custom' : String(cur)}
                          onChange={e => {
                            if (e.target.value === 'custom') { setBufferCustom(true) }
                            else { setBufferCustom(false); update('schedule', { ...config.schedule, buffer_minutes: Number(e.target.value) }) }
                          }}>
                          <option value={0}>{uis('Sin tiempo entre turnos', 'No gap between appointments')}</option>
                          <option value={5}>{uis('5 minutos', '5 minutes')}</option>
                          <option value={10}>{uis('10 minutos', '10 minutes')}</option>
                          <option value={15}>{uis('15 minutos', '15 minutes')}</option>
                          <option value={20}>{uis('20 minutos', '20 minutes')}</option>
                          <option value={30}>{uis('30 minutos', '30 minutes')}</option>
                          <option value="custom">{uis('Personalizado', 'Custom')}</option>
                        </select>
                        {isCustom && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                            <input style={{ ...s.input, width: 90 }} type="number" min={0} max={240} step={5}
                              value={cur}
                              onChange={e => update('schedule', { ...config.schedule, buffer_minutes: Math.max(0, Number(e.target.value) || 0) })} />
                            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>min</span>
                          </div>
                        )}
                      </>)
                    })()}
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
                      {uis('Hueco libre que se deja entre un turno y el siguiente (para limpiar, demoras, etc.). La duracion de cada turno la define cada servicio en la seccion Turnos.', 'Free gap left between one appointment and the next.')}
                    </div>
                  </Field>

                  <Field label="">
                    <div style={s.toggleRow}>
                      <div>
                        <div style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{uis('El último turno puede arrancar a la hora de cierre', 'Last appointment can start at closing time')}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{uis('Activado: a la hora de cierre arranca el último turno y termina después (ideal barbería/peluquería). Desactivado: el último turno debe terminar antes del cierre.', 'On: the last appointment starts at closing time and finishes afterwards (ideal for barbers/salons). Off: the last appointment must end before closing.')}</div>
                      </div>
                      <div style={{ ...s.toggleTrack, ...(config.schedule?.last_slot_starts_at_close ? s.toggleTrackOn : {}) }}
                        onClick={() => update('schedule', { ...config.schedule, last_slot_starts_at_close: !config.schedule?.last_slot_starts_at_close })}>
                        <div style={{ ...s.toggleThumb, ...(config.schedule?.last_slot_starts_at_close ? s.toggleThumbOn : {}) }} />
                      </div>
                    </div>
                  </Field>

                  <div style={s.scheduleGrid}>
                    {Object.entries(config.schedule?.hours ?? {}).map(([day, hours]) => (
                      <div key={day} style={s.scheduleRow}>
                        {/* Fila principal */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            fontSize: 11, fontWeight: 600, minWidth: 64, textAlign: 'center',
                            color: hours.closed ? 'var(--text-3)' : '#1585c7',
                            background: hours.closed ? 'transparent' : 'var(--bg-card)',
                            border: hours.closed ? '0.5px solid var(--border-mid)' : '0.5px solid #1585c755',
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
                              <span style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 600 }}>→</span>
                              <input style={s.timeInput} type="time" value={hours.close}
                                onChange={e => update('schedule', { ...config.schedule, hours: { ...config.schedule.hours, [day]: { ...hours, close: e.target.value } } })} />
                              <button
                                onClick={() => update('schedule', { ...config.schedule, hours: { ...config.schedule.hours, [day]: { ...hours, breaks: [...(hours.breaks ?? []), { start: '13:00', end: '14:00' }] } } })}
                                style={{ marginLeft: 'auto', fontSize: 10, color: '#1585c7', background: '#12122a', border: '0.5px solid #1585c744', borderRadius: 20, padding: '4px 12px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 500 }}>
                                ☕ descanso
                              </button>
                            </>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4 }}>Cerrado</span>
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
                                <span style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600 }}>→</span>
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
                                  style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: '0 2px', fontSize: 14, lineHeight: 1, marginLeft: 2 }}>×</button>
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
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>
                  {uis('Email de la cuenta:', 'Account email:')} <strong style={{ color: 'var(--text-1)' }}>{userEmail || '—'}</strong>
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
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{uis('Usar otro email para notificaciones', 'Use a different email for notifications')}</span>
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
                    <div style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{uis('Resumen por email', 'Email summary')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{uis('Recibí un resumen con las métricas de tu negocio', 'Receive a summary with your business metrics')}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {config.daily_summary && (
                      <select value={config.summary_frequency}
                        onChange={e => update('summary_frequency', e.target.value)}
                        style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border-mid)', borderRadius: 6, padding: '4px 8px', color: 'var(--text-1)', fontSize: 11, cursor: 'pointer' }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                  <button type="button" onClick={sendTestSummary} disabled={testingSummary}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border-mid)', background: 'transparent', color: 'var(--text-1)', fontSize: 12, cursor: testingSummary ? 'default' : 'pointer', fontFamily: 'inherit', opacity: testingSummary ? 0.6 : 1 }}>
                    <i className="ti ti-mail-forward" style={{ fontSize: 14 }} />
                    {testingSummary ? uis('Enviando…', 'Sending…') : uis('Enviar resumen de prueba', 'Send test summary')}
                  </button>
                  {summaryTestMsg && (
                    <span style={{ fontSize: 12, color: summaryTestMsg.kind === 'ok' ? 'var(--accent)' : '#dc2626' }}>{summaryTestMsg.text}</span>
                  )}
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
                  <span style={{ fontSize: 9, color: 'var(--text-3)' }}>{uis('click para personalizar', 'click to customize')}</span>
                  </div>
                  <input style={{ ...s.input, width: 110, fontFamily: 'monospace', fontSize: 12 }}
                    value={config.accent_color}
                    onChange={e => { update('accent_color', e.target.value); onThemeChange?.(e.target.value, bgColor) }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['#1585c7','#22a7f0','#38bdf8','#f59e0b','#f87171','#e879f9','#fb923c','#4fc3f7'].map(c => (
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
                  <span style={{ fontSize: 9, color: 'var(--text-3)' }}>{uis('click para personalizar', 'click to customize')}</span>
                  </div>
                  <input style={{ ...s.input, width: 110, fontFamily: 'monospace', fontSize: 12 }}
                    value={bgColor}
                    onChange={e => { setBgColor(e.target.value); onThemeChange?.(config.accent_color, e.target.value) }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['var(--bg-base)','#0a0a0f','#060610','#070d07','#0d0709','#07090d','#0a0808','#08080a'].map(c => (
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
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10, fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Preview</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                  <div style={{ background: 'linear-gradient(135deg, var(--accent-dark), var(--accent))', borderRadius: 8, padding: '6px 14px', fontSize: 12, color: '#fff', fontWeight: 500 }}>{uis('Botón principal', 'Main button')}</div>
                  <div style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-mid)', borderRadius: 8, padding: '6px 14px', fontSize: 12, color: 'var(--accent)' }}>{uis('Badge acento', 'Accent badge')}</div>
                  <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', fontSize: 12, color: 'var(--text-1)' }}>{uis('Fondo panel', 'Panel background')}</div>
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
                            background: fontFamily === f.id ? 'var(--accent-dim)' : 'var(--bg-card)',
                            border: `0.5px solid ${fontFamily === f.id ? 'var(--accent)' : 'var(--border-mid)'}`,
                            borderRadius: 10, padding: '10px 14px', cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}>
                          <div style={{ fontSize: 15, fontWeight: 600, color: fontFamily === f.id ? 'var(--accent)' : 'var(--text-1)', fontFamily: `'${f.id}', system-ui, sans-serif`, marginBottom: 3 }}>
                            {f.id}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{f.desc}</div>
                          <div style={{ fontSize: 11, color: fontFamily === f.id ? 'var(--accent)' : 'var(--text-3)', fontFamily: `'${f.id}', system-ui, sans-serif`, marginTop: 4 }}>
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
                      style={{ padding: '6px 18px', borderRadius: 8, border: `1px solid ${lang === l ? 'var(--accent)' : '#2d2d3d'}`, background: lang === l ? 'var(--accent-dim)' : 'var(--bg-card)', color: lang === l ? 'var(--accent)' : 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontWeight: lang === l ? 600 : 400 }}>
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

              {/* Menú de botones (WhatsApp quick reply) — builder */}
              <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border-mid)', borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className="ti ti-layout-grid" style={{ fontSize: 18, color: 'var(--accent)' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{uis('Menú de botones', 'Quick-reply menu')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{uis('Botones tocables que el bot puede ofrecer en el chat. Escribilos acá y los creamos por vos.', 'Tappable buttons the bot can offer in chat. Write them here and we create them for you.')}</div>
                  </div>
                  {config.menu_content_sid && <span style={{ fontSize: 10, fontWeight: 700, background: '#1585c722', color: '#3aa9e5', border: '1px solid #1585c744', borderRadius: 4, padding: '2px 8px' }}>{uis('ACTIVO', 'ACTIVE')}</span>}
                </div>

                <label style={{ fontSize: 11, color: 'var(--text-3)' }}>{uis('Mensaje del menú', 'Menu message')}</label>
                <input
                  style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-input)', border: '0.5px solid var(--border-mid)', borderRadius: 8, padding: '9px 11px', color: 'var(--text-1)', fontSize: 13, outline: 'none', fontFamily: 'inherit', marginBottom: 8 }}
                  value={menuBody}
                  onChange={e => setMenuBody(e.target.value)}
                  placeholder="¿En qué te puedo ayudar?"
                />

                <label style={{ fontSize: 11, color: 'var(--text-3)' }}>{uis('Botones (hasta 3)', 'Buttons (up to 3)')}</label>
                {menuButtons.map((b, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <input
                      style={{ flex: 1, boxSizing: 'border-box', background: 'var(--bg-input)', border: '0.5px solid var(--border-mid)', borderRadius: 8, padding: '8px 11px', color: 'var(--text-1)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                      value={b}
                      maxLength={20}
                      onChange={e => setMenuButtons(arr => arr.map((x, j) => j === i ? e.target.value : x))}
                      placeholder={`Botón ${i + 1}`}
                    />
                    {menuButtons.length > 1 && (
                      <button type="button" onClick={() => setMenuButtons(arr => arr.filter((_, j) => j !== i))} style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 16 }} aria-label="Quitar">
                        <i className="ti ti-x" />
                      </button>
                    )}
                  </div>
                ))}
                {menuButtons.length < 3 && (
                  <button type="button" onClick={() => setMenuButtons(arr => [...arr, ''])} style={{ background: 'transparent', border: '0.5px dashed var(--border-mid)', color: 'var(--text-2)', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8 }}>
                    <i className="ti ti-plus" style={{ fontSize: 12 }} /> {uis('Agregar botón', 'Add button')}
                  </button>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                  <button type="button" onClick={saveMenu} disabled={menuSaving} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {menuSaving ? uis('Creando…', 'Creating…') : (config.menu_content_sid ? uis('Actualizar menú', 'Update menu') : uis('Crear menú', 'Create menu'))}
                  </button>
                  {config.menu_content_sid && (
                    <button type="button" onClick={deactivateMenu} disabled={menuSaving} style={{ background: 'transparent', color: 'var(--text-2)', border: '0.5px solid var(--border-mid)', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {uis('Desactivar', 'Turn off')}
                    </button>
                  )}
                  {menuMsg && <span style={{ fontSize: 12, color: menuMsg.kind === 'ok' ? '#1585c7' : '#dc2626' }}>{menuMsg.text}</span>}
                </div>
              </div>

              {/* Google Calendar */}
              {!isPro ? (
                <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border-mid)', borderRadius: 10, padding: '14px 16px', marginBottom: 10, opacity: 0.6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <i className="ti ti-calendar" style={{ fontSize: 18, color: '#4285f4' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Google Calendar</div>
                      <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{uis('Disponible en el plan Pro', 'Available on the Pro plan')}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, background: '#1585c722', color: '#3aa9e5', border: '1px solid #1585c744', borderRadius: 4, padding: '2px 8px' }}>PRO</span>
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
                    const nr = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/webhooks/connect-token/${businessId}`, { method: 'POST', headers: { Authorization: `Bearer ${_s?.access_token ?? ''}` } })
                    const { nonce } = await nr.json()
                    const popup = window.open(`${import.meta.env.VITE_BACKEND_URL}/api/webhooks/calendar/connect/${businessId}?nonce=${nonce}`, '_blank', 'width=600,height=700')
                    const timer = setInterval(() => { if (popup?.closed) { clearInterval(timer); loadConfig() } }, 1000)
                  }}
                  onDisconnect={async () => {
                    await supabase.from('businesses').update({ google_refresh_token: null, google_calendar_id: null }).eq('id', businessId!)
                    update('google_refresh_token', null); update('google_calendar_id', null)
                  }}
                />
              )}

              {/* Recordatorios automáticos */}
              <div style={{ background: 'var(--bg-card)', border: `0.5px solid ${config.reminders_enabled ? '#2a3a2a' : 'var(--border-mid)'}`, borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className="ti ti-bell-ringing" style={{ fontSize: 18, color: '#f59e0b' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{uis('Recordatorios automáticos', 'Automatic reminders')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
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
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-mid)' }}>
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
                            style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${active ? '#226B43' : opt.rec ? '#2f5e47' : '#2d2d3d'}`, background: active ? '#1e3b2c' : 'var(--bg-card)', color: active ? '#3aa9e5' : 'var(--text-2)', fontSize: 12, cursor: 'pointer' }}
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
                    {(config.reminder_hours_before || []).filter((h: number) => ![0.5, 1, 2, 24, 48].includes(h)).length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                        {(config.reminder_hours_before || []).filter((h: number) => ![0.5, 1, 2, 24, 48].includes(h)).map((h: number) => {
                          const mins = Math.round(h * 60)
                          const lbl = mins % 60 === 0 ? `${mins / 60} h antes` : `${mins} min antes`
                          return (
                            <span key={h} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 8px 5px 12px', borderRadius: 6, border: '1px solid #226B43', background: '#1e3b2c', color: '#3aa9e5', fontSize: 12 }}>
                              {lbl}
                              <button onClick={async () => {
                                const next = (config.reminder_hours_before || []).filter((x: number) => x !== h)
                                const { error } = await supabase.from('businesses').update({ reminder_hours_before: next }).eq('id', businessId!)
                                if (error) { alert(uis('No se pudo guardar: ', 'Could not save: ') + error.message); return }
                                update('reminder_hours_before', next)
                              }} style={{ background: 'none', border: 'none', color: '#3aa9e5', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                            </span>
                          )
                        })}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{uis('Personalizado:', 'Custom:')}</span>
                      <input type="number" min={1} max={1000} value={newReminderQty} onChange={e => setNewReminderQty(e.target.value)} style={{ ...s.input, width: 90 }} placeholder={uis('Ej: 45', 'E.g. 45')} />
                      <select value={newReminderUnit} onChange={e => setNewReminderUnit(e.target.value)} style={{ ...s.select, maxWidth: 130 }}>
                        <option value="min">{uis('minutos', 'minutes')}</option>
                        <option value="hours">{uis('horas', 'hours')}</option>
                      </select>
                      <button style={s.addBtn} onClick={async () => {
                        const qty = Number(newReminderQty)
                        if (!qty || qty <= 0) return
                        const h = newReminderUnit === 'min' ? Math.round((qty / 60) * 1000) / 1000 : qty
                        const current = config.reminder_hours_before || []
                        if (current.includes(h)) { setNewReminderQty(''); return }
                        const next = [...current, h].sort((a: number, b: number) => a - b)
                        const { error } = await supabase.from('businesses').update({ reminder_hours_before: next }).eq('id', businessId!)
                        if (error) { alert(uis('No se pudo guardar: ', 'Could not save: ') + error.message); return }
                        update('reminder_hours_before', next)
                        setNewReminderQty('')
                      }}>+ {uis('Agregar', 'Add')}</button>
                    </div>

                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 8 }}>
                      {uis('★ Recomendado. El de 24 h es el más efectivo para reducir ausencias.', '★ Recommended. 24 h is the most effective at reducing no-shows.')}
                    </div>
                  </div>
                )}
              </div>

              {/* Mercado Pago */}
              {!isPro ? (
                <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border-mid)', borderRadius: 10, padding: '14px 16px', marginBottom: 10, opacity: 0.6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <i className="ti ti-brand-mastercard" style={{ fontSize: 18, color: '#00b1ea' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Mercado Pago</div>
                      <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{uis('Disponible en el plan Pro', 'Available on the Pro plan')}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, background: '#1585c722', color: '#3aa9e5', border: '1px solid #1585c744', borderRadius: 4, padding: '2px 8px' }}>PRO</span>
                  </div>
                </div>
              ) : (
                <IntegrationCard
                  icon="ti-brand-mastercard" iconColor="#00b1ea"
                  name="Mercado Pago"
                  description={config.mp_payment_link ? 'El bot comparte tu alias/link de cobro cuando un cliente quiere pagar' : 'Pegá tu alias o link de cobro de Mercado Pago para que el bot lo comparta'}
                  status={config.mp_payment_link ? 'connected' : 'disconnected'}
                  onConnect={async () => {
                    const link = prompt('Pegá tu alias o link de cobro de Mercado Pago (ej: tualias.mp o https://mpago.la/xxxx):')
                    if (!link?.trim()) return
                    const { error } = await supabase.from('businesses').update({ mp_payment_link: link.trim() }).eq('id', businessId!)
                    if (error) { alert('No se pudo guardar: ' + error.message); return }
                    update('mp_payment_link', link.trim())
                  }}
                  onDisconnect={async () => {
                    await supabase.from('businesses').update({ mp_payment_link: null }).eq('id', businessId!)
                    update('mp_payment_link', null)
                  }}
                />
              )}

              {/* Google Sheets */}
              <div style={{ background: 'var(--bg-card)', border: `0.5px solid ${config.sheets_refresh_token ? '#2a3a2a' : 'var(--border-mid)'}`, borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className="ti ti-table" style={{ fontSize: 18, color: '#4fc3f7' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>Google Sheets</span>
                      {config.sheets_refresh_token && <span style={{ fontSize: 10, background: '#0a2e14', border: '0.5px solid #1a4a25', color: '#22a7f0', borderRadius: 4, padding: '1px 6px' }}>Activo</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
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
                          style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: 'var(--border)', color: '#1585c7', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Exportar
                        </button>
                        {config.sheets_spreadsheet_id && (
                          <button
                            onClick={() => window.open(`https://docs.google.com/spreadsheets/d/${config.sheets_spreadsheet_id}`, '_blank')}
                            style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: '#0a2e14', color: '#22a7f0', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
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
                        onClick={async () => {
                          const { data: { session: _ss } } = await supabase.auth.getSession()
                          const nr = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/webhooks/connect-token/${businessId}`, { method: 'POST', headers: { Authorization: `Bearer ${_ss?.access_token ?? ''}` } })
                          const { nonce } = await nr.json()
                          const popup = window.open(`${import.meta.env.VITE_BACKEND_URL}/api/webhooks/sheets/connect/${businessId}?nonce=${nonce}`, '_blank', 'width=600,height=700')
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
              <SectionHeader icon="ti-calendar-event" title={uis('Configuración de turnos', 'Appointment settings')} subtitle={uis('Elegí cómo se calculan los horarios y definí tus servicios', 'Choose how slots are calculated and define your services')} />

              {/* Activar / desactivar agenda */}
              <div style={{ background: 'var(--bg-card)', border: `0.5px solid ${(config.schedule?.appointments_enabled !== false) ? 'var(--accent)' : 'var(--border-mid)'}`, borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{uis('Activar agenda de turnos', 'Enable scheduling')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{uis('Si lo desactivás, el bot no ofrece agendar y se oculta del panel. Útil si usás el Pro por otros beneficios.', 'If you turn this off, the bot will not offer scheduling and it is hidden from the dashboard.')}</div>
                  </div>
                  <div style={{ ...s.toggleTrack, ...((config.schedule?.appointments_enabled !== false) ? s.toggleTrackOn : {}) }}
                    onClick={() => update('schedule', { ...config.schedule, appointments_enabled: !(config.schedule?.appointments_enabled !== false) })}>
                    <div style={{ ...s.toggleThumb, ...((config.schedule?.appointments_enabled !== false) ? s.toggleThumbOn : {}) }} />
                  </div>
                </div>
              </div>

              {(config.schedule?.appointments_enabled !== false) && (<>

              {/* Nombre personalizado de la sección */}
              <div style={{ marginBottom: 20 }}>
                <Field label={uis('¿Cómo querés llamar a esta sección?', 'What do you want to call this section?')}>
                  <input style={{ ...s.input, maxWidth: 280 }}
                    placeholder={uis('Turnos (ej: Reservas, Sesiones, Retiros…)', 'Appointments (e.g. Bookings, Sessions…)')}
                    value={config.schedule?.label ?? ''}
                    onChange={e => update('schedule', { ...config.schedule, label: e.target.value })} />
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>{uis('Aparece en el panel y lo usa el bot al hablar con los clientes. Vacío = "Turnos".', 'Shown in the dashboard and used by the bot. Empty = "Appointments".')}</div>
                </Field>
              </div>

              {/* ── Modo de turnos ── */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>{uis('Modo de turnos', 'Scheduling mode')}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>{uis('Por defecto todos los turnos duran lo mismo. Activá "por servicio" para que cada uno dure lo suyo.', 'By default every appointment lasts the same. Switch to per-service so each uses its own length.')}</div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div onClick={() => update('schedule', { ...config.schedule, slot_mode: 'fixed' })}
                    style={{ cursor: 'pointer', background: 'var(--bg-card)', borderRadius: 12, padding: '14px 16px', transition: 'border-color 0.15s',
                      border: `1.5px solid ${(config.schedule?.slot_mode ?? 'fixed') === 'fixed' ? 'var(--accent)' : 'var(--border-mid)'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <i className="ti ti-clock-hour-4" style={{ fontSize: 18, color: 'var(--accent)' }} aria-hidden="true" />
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{uis('Duración fija', 'Fixed duration')}</span>
                      {(config.schedule?.slot_mode ?? 'fixed') === 'fixed' && <i className="ti ti-check" style={{ fontSize: 16, color: 'var(--accent)', marginLeft: 'auto' }} aria-hidden="true" />}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>{uis('Todos los turnos duran lo mismo.', 'Every appointment lasts the same.')}</div>
                  </div>

                  <div onClick={() => update('schedule', { ...config.schedule, slot_mode: 'per_service' })}
                    style={{ cursor: 'pointer', background: 'var(--bg-card)', borderRadius: 12, padding: '14px 16px', transition: 'border-color 0.15s',
                      border: `1.5px solid ${config.schedule?.slot_mode === 'per_service' ? 'var(--accent)' : 'var(--border-mid)'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <i className="ti ti-layout-list" style={{ fontSize: 18, color: 'var(--accent)' }} aria-hidden="true" />
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{uis('Duración por servicio', 'Per-service duration')}</span>
                      {config.schedule?.slot_mode === 'per_service' && <i className="ti ti-check" style={{ fontSize: 16, color: 'var(--accent)', marginLeft: 'auto' }} aria-hidden="true" />}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>{uis('Cada servicio dura lo suyo y se aprovecha mejor la agenda.', 'Each service uses its own length and fills the day better.')}</div>
                  </div>
                </div>

                {(config.schedule?.slot_mode ?? 'fixed') === 'fixed' && (
                  <div style={{ marginTop: 14 }}>
                    <Field label={uis('Duración de cada turno', 'Length of each appointment')}>
                      {(() => {
                        const PRESETS = [15, 20, 30, 45, 60, 90, 120]
                        const cur = config.schedule?.fixed_duration ?? 60
                        const isCustom = fixedDurCustom || !PRESETS.includes(cur)
                        return (<>
                          <select style={{ ...s.select, maxWidth: 220 }} value={isCustom ? 'custom' : String(cur)}
                            onChange={e => {
                              if (e.target.value === 'custom') { setFixedDurCustom(true) }
                              else { setFixedDurCustom(false); update('schedule', { ...config.schedule, fixed_duration: Number(e.target.value) }) }
                            }}>
                            <option value={15}>15 min</option>
                            <option value={20}>20 min</option>
                            <option value={30}>30 min</option>
                            <option value={45}>45 min</option>
                            <option value={60}>{uis('1 hora', '1 hour')}</option>
                            <option value={90}>{uis('1 hora 30 min', '1h 30m')}</option>
                            <option value={120}>{uis('2 horas', '2 hours')}</option>
                            <option value="custom">{uis('Personalizada', 'Custom')}</option>
                          </select>
                          {isCustom && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                              <input style={{ ...s.input, width: 90 }} type="number" min={5} max={1440} step={5}
                                value={cur}
                                onChange={e => update('schedule', { ...config.schedule, fixed_duration: Math.max(5, Number(e.target.value) || 5) })} />
                              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>min</span>
                            </div>
                          )}
                        </>)
                      })()}
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>{uis('Todos los turnos tendrán esta duración, sin importar el servicio.', 'Every appointment uses this length, regardless of service.')}</div>
                    </Field>
                  </div>
                )}

                {config.schedule?.slot_mode === 'per_service' && (
                  <div style={{ marginTop: 14 }}>
                    <Field label={uis('Cada cuánto pueden empezar los turnos', 'How often appointments can start')}>
                      <select style={{ ...s.select, maxWidth: 260 }} value={config.schedule?.slot_step ?? 20}
                        onChange={e => update('schedule', { ...config.schedule, slot_step: Number(e.target.value) })}>
                        <option value={10}>{uis('Cada 10 minutos', 'Every 10 minutes')}</option>
                        <option value={15}>{uis('Cada 15 minutos', 'Every 15 minutes')}</option>
                        <option value={20}>{uis('Cada 20 minutos (recomendado)', 'Every 20 minutes (recommended)')}</option>
                        <option value={30}>{uis('Cada 30 minutos', 'Every 30 minutes')}</option>
                        <option value={60}>{uis('Cada 1 hora', 'Every hour')}</option>
                      </select>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>{uis('Los horarios ofrecidos arrancan en estos intervalos. Con 20 min calzan servicios de 20, 40 y 60.', 'Offered times start at these intervals. 20 min fits 20/40/60-minute services.')}</div>
                    </Field>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 8, padding: '10px 12px', background: 'var(--accent-dim)', borderRadius: 8, display: 'flex', gap: 8 }}>
                      <i className="ti ti-info-circle" style={{ fontSize: 16, color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
                      <span>{uis('La duración de cada servicio la configurás en la lista de abajo.', 'Set each service duration in the list below.')}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Lista de categorías */}
              <div style={{ marginBottom: 20 }}>
                {(config.appointment_categories ?? []).length === 0 && (
                  <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '16px 0' }}>{uis('No hay categorías todavía. Agregá una abajo.', 'No categories yet. Add one below.')}</div>
                )}
                {(config.appointment_categories ?? []).map((cat) => (
                  <div key={cat.id} style={{ background: 'var(--bg-card)', border: `0.5px solid ${editingCatId === cat.id ? cat.color + '88' : 'var(--border-mid)'}`, borderRadius: 10, padding: '12px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
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
                          <span style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' as const }}>min</span>
                        </div>
                        <input type="color" value={cat.color}
                          onChange={e => update('appointment_categories', config.appointment_categories.map(c => c.id === cat.id ? { ...c, color: e.target.value } : c))}
                          style={{ width: 32, height: 32, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 6, padding: 2 }} />
                        <button onClick={() => setEditingCatId(null)} style={{ ...s.addBtn, fontSize: 12 }}>✓ {uis('Listo', 'Done')}</button>
                      </div>
                    ) : (
                      <>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{cat.name}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 10 }}>⏱ {cat.duration_minutes} min</span>
                        </div>
                        <button onClick={() => setEditingCatId(cat.id)} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, padding: '4px 6px' }}>
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
              <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border-mid)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10, fontWeight: 500 }}>{uis('Nueva categoría', 'New category')}</div>
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
                    <span style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' as const }}>min</span>
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
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8 }}>
                  {uis('Las categorías aparecerán como filtros en la sección Turnos y definen la duración por defecto de cada servicio.', 'Categories appear as filters in the Appointments section and define the default duration per service.')}
                </div>
              </div>
            </>)}
            </div>
          )}

          {activeSection === 'etiquetas' && (
            <div style={s.section}>
              <SectionHeader icon="ti-tag" title={uis('Etiquetas', 'Labels')} subtitle={uis('Personalizá las etiquetas para clasificar y filtrar tus conversaciones en el Inbox', 'Customize the labels used to tag and filter conversations in the Inbox')} />

              {/* Lista de etiquetas */}
              <div style={{ marginBottom: 20 }}>
                {(config.conversation_tags ?? []).length === 0 && (
                  <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '16px 0' }}>{uis('No hay etiquetas todavía. Agregá una abajo.', 'No labels yet. Add one below.')}</div>
                )}
                {(config.conversation_tags ?? []).map((tag) => (
                  <div key={tag.id} style={{ background: 'var(--bg-card)', border: `0.5px solid ${editingTagId === tag.id ? tag.color + '88' : 'var(--border-mid)'}`, borderRadius: 10, padding: '12px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
                    {editingTagId === tag.id ? (
                      <div style={{ flex: 1, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }}>
                        <input
                          style={{ ...s.input, flex: 1, minWidth: 120 }}
                          value={tag.label}
                          onChange={e => update('conversation_tags', config.conversation_tags.map(t => t.id === tag.id ? { ...t, label: e.target.value } : t))}
                        />
                        <input type="color" value={tag.color}
                          onChange={e => update('conversation_tags', config.conversation_tags.map(t => t.id === tag.id ? { ...t, color: e.target.value } : t))}
                          style={{ width: 32, height: 32, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 6, padding: 2 }} />
                        <button onClick={() => setEditingTagId(null)} style={{ ...s.addBtn, fontSize: 12 }}>✓ {uis('Listo', 'Done')}</button>
                      </div>
                    ) : (
                      <>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{tag.label}</span>
                        </div>
                        <button onClick={() => setEditingTagId(tag.id)} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, padding: '4px 6px' }}>
                          <i className="ti ti-pencil" />
                        </button>
                        <button onClick={() => update('conversation_tags', config.conversation_tags.filter(t => t.id !== tag.id))}
                          style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 13, padding: '4px 6px' }}>
                          <i className="ti ti-trash" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Agregar etiqueta */}
              <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border-mid)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10, fontWeight: 500 }}>{uis('Nueva etiqueta', 'New label')}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                  <input
                    style={{ ...s.input, flex: 1, minWidth: 140 }}
                    placeholder={uis('Nombre (ej: Venta, Reclamo)', 'Name (e.g. Sale, Complaint)')}
                    value={newTagLabel}
                    onChange={e => setNewTagLabel(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newTagLabel.trim()) {
                        update('conversation_tags', [...(config.conversation_tags ?? []), { id: crypto.randomUUID(), label: newTagLabel.trim(), color: newTagColor }])
                        setNewTagLabel('')
                      }
                    }}
                  />
                  <input type="color" value={newTagColor} onChange={e => setNewTagColor(e.target.value)}
                    style={{ width: 36, height: 36, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 6, padding: 2 }} />
                  <button
                    onClick={() => {
                      if (!newTagLabel.trim()) return
                      update('conversation_tags', [...(config.conversation_tags ?? []), { id: crypto.randomUUID(), label: newTagLabel.trim(), color: newTagColor }])
                      setNewTagLabel('')
                    }}
                    style={s.addBtn}>
                    + {uis('Agregar', 'Add')}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8 }}>
                  {uis('Las etiquetas aparecen en el Inbox para clasificar y filtrar conversaciones. Si renombrás una, las conversaciones ya etiquetadas conservan el nombre anterior.', 'Labels appear in the Inbox to tag and filter conversations. If you rename one, already-tagged conversations keep the old name.')}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Save bar */}
        <div style={s.saveBar}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
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
    <div style={{ background: 'var(--bg-card)', border: `0.5px solid ${isConnected ? '#2a3a2a' : 'var(--border-mid)'}`, borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className={`ti ${icon}`} style={{ fontSize: 18, color: iconColor }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{name}</span>
            {isConnected && <span style={{ fontSize: 10, background: '#0a2e14', border: '0.5px solid #1a4a25', color: '#22a7f0', borderRadius: 4, padding: '1px 6px' }}>Activo</span>}
          </div>
          <div style={{ fontSize: 11, color: isDisabled ? '#2a2a4a' : 'var(--text-3)', marginTop: 2 }}>{description}</div>
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
        <i className={`ti ${icon}`} style={{ fontSize: 16, color: '#1585c7' }} aria-hidden="true" />
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{title}</h2>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, paddingLeft: 24 }}>{subtitle}</p>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6 }}>{label}</div>}
      {hint && <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6 }}>{hint}</div>}
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
          <span key={i} style={{ background: 'var(--bg-card)', border: `0.5px solid ${color}44`, borderRadius: 6, padding: '3px 8px', fontSize: 12, color, display: 'flex', alignItems: 'center', gap: 4 }}>
            {tag}
            <button onClick={() => onRemove(i)} style={{ background: 'none', border: 'none', color, cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}>×</button>
          </span>
        ))}
        {tags.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Sin palabras clave todavía</span>}
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
  sectNav: { background: 'var(--bg-card)', borderRight: '0.5px solid var(--border-mid)', padding: '16px 8px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto', overflowX: 'hidden' as const },
  sectNavTitle: { fontSize: 8.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0, fontWeight: 600, padding: '0 4px', marginBottom: 8, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },
  sectBtn: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 7, border: 'none', background: 'transparent', color: '#7a7a9a', fontSize: 12, fontWeight: 500, cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'color 0.15s, background 0.15s', letterSpacing: '0.01em' },
  sectBtnActive: { background: 'var(--border)', color: '#3aa9e5' },
  content: { display: 'grid', gridTemplateRows: '1fr auto', overflow: 'hidden' },
  contentInner: { overflowY: 'auto', padding: 24 },
  section: { maxWidth: 680 },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-3)', fontSize: 13 },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  input: { width: '100%', background: 'var(--bg-card)', border: '0.5px solid var(--border-mid)', borderRadius: 8, padding: '8px 10px', color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const },
  textarea: { width: '100%', background: 'var(--bg-card)', border: '0.5px solid var(--border-mid)', borderRadius: 8, padding: '8px 10px', color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const, minHeight: 80 },
  select: { width: '100%', background: 'var(--bg-card)', border: '0.5px solid var(--border-mid)', borderRadius: 8, padding: '8px 10px', color: 'var(--text-1)', fontSize: 13, outline: 'none' },
  toneGrid: { display: 'flex', flexWrap: 'wrap' as const, gap: 6 },
  langGrid: { display: 'flex', gap: 6 },
  toneBtn: { background: 'var(--bg-card)', border: '0.5px solid var(--border-mid)', borderRadius: 6, padding: '5px 12px', fontSize: 12, color: 'var(--text-2)', cursor: 'pointer' },
  toneBtnActive: { background: 'var(--bg-card)', borderColor: '#1585c7', color: '#1585c7' },
  addBtn: { background: 'var(--bg-card)', border: '0.5px solid var(--border-mid)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#1585c7', cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0 },
  toggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-card)', border: '0.5px solid var(--border-mid)', borderRadius: 10, padding: '12px 14px' },
  toggleTrack: { width: 40, height: 22, borderRadius: 11, background: 'var(--border-mid)', position: 'relative' as const, cursor: 'pointer', transition: 'background 0.25s', flexShrink: 0 },
  toggleTrackOn: { background: '#226B43' },
  toggleThumb: { position: 'absolute' as const, top: '50%', transform: 'translateY(-50%)', left: 3, width: 16, height: 16, borderRadius: '50%', background: 'var(--text-2)', transition: 'left 0.25s, background 0.25s' },
  toggleThumbOn: { left: 21, background: '#fff' },
  toggleTrackSm: { width: 32, height: 18, borderRadius: 9, background: 'var(--border-mid)', position: 'relative' as const, cursor: 'pointer', transition: 'background 0.25s', flexShrink: 0 },
  toggleThumbSm: { position: 'absolute' as const, top: 2, left: 2, width: 14, height: 14, borderRadius: '50%', background: 'var(--text-2)', transition: 'left 0.25s, background 0.25s' },
  scheduleGrid: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  scheduleRow: { display: 'flex', flexDirection: 'column' as const, gap: 6, background: 'var(--bg-card)', border: '0.5px solid var(--border-mid)', borderRadius: 10, padding: '10px 14px' },
  dayLabel: { fontSize: 12, fontWeight: 500, color: 'var(--text-1)' },
  timeInput: { background: 'var(--bg-input)', border: '0.5px solid var(--border-mid)', borderRadius: 6, padding: '4px 6px', color: 'var(--text-1)', fontSize: 12, outline: 'none' },
  saveBar: { borderTop: '0.5px solid var(--border-mid)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-card)' },
  saveBtn: { background: '#1585c7', border: 'none', borderRadius: 8, padding: '8px 20px', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
}
