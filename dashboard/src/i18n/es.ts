export const es = {
  // Nav
  nav_activity: 'Actividad',
  nav_analytics: 'Analytics',
  nav_contacts: 'Contactos',
  nav_appointments: 'Turnos',
  nav_settings: 'Config',

  // Login
  login_title: 'Iniciar sesión',
  login_email: 'Email',
  login_password: 'Contraseña',
  login_btn: 'Entrar',
  login_error: 'Email o contraseña incorrectos',

  // Activity
  activity_title: 'Actividad',
  activity_conversations: 'Conversaciones',
  activity_all: 'Todas',
  activity_active: 'Activas',
  activity_pending: 'Pendientes',
  activity_resolved: 'Resueltas',
  activity_search: 'Buscar conversación...',
  activity_ai_enabled: 'IA activada',
  activity_ai_disabled: 'IA desactivada',
  activity_no_messages: 'Sin mensajes',
  activity_type_message: 'Escribí un mensaje...',
  activity_send: 'Enviar',
  activity_resolve: 'Resolver',
  activity_reopen: 'Reabrir',
  activity_empty: 'No hay conversaciones',

  // Analytics
  analytics_title: 'Analytics',
  analytics_messages: 'Mensajes',
  analytics_conversations: 'Conversaciones',
  analytics_avg_response: 'Respuesta promedio',
  analytics_escalations: 'Escalaciones',
  analytics_peak_hour: 'Hora pico',
  analytics_by_category: 'Turnos por categoría',
  analytics_escalation_rate: 'Tasa de escalación',
  analytics_period_7: 'Últimos 7 días',
  analytics_period_30: 'Últimos 30 días',
  analytics_period_90: 'Últimos 90 días',

  // Contacts
  contacts_title: 'Contactos',
  contacts_search: 'Buscar contacto...',
  contacts_interactions: 'interacciones',
  contacts_empty: 'No hay contactos',
  contacts_name: 'Nombre',
  contacts_phone: 'Teléfono',
  contacts_edit_name: 'Editar nombre',

  // Appointments
  appointments_title: 'Turnos',
  appointments_search: 'Buscar turno...',
  appointments_all_categories: 'Todas las categorías',
  appointments_date: 'Fecha',
  appointments_time: 'Hora',
  appointments_client: 'Cliente',
  appointments_service: 'Servicio',
  appointments_category: 'Categoría',
  appointments_empty: 'No hay turnos',
  appointments_reminder_sent: 'Recordatorio enviado',
  appointments_reminder_pending: 'Recordatorio pendiente',

  // Settings
  settings_title: 'Configuración',
  settings_save: 'Guardar cambios',
  settings_saved: '¡Guardado!',
  settings_bot: 'Bot',
  settings_business: 'Negocio',
  settings_schedule: 'Horarios',
  settings_escalation: 'Escalación',
  settings_integrations: 'Integraciones',
  settings_categories: 'Categorías',
  settings_language: 'Idioma de la interfaz',
  settings_language_es: 'Español',
  settings_language_en: 'English',

  // Common
  loading: 'Cargando...',
  error: 'Error',
  cancel: 'Cancelar',
  save: 'Guardar',
  delete: 'Eliminar',
  edit: 'Editar',
  add: 'Agregar',
  close: 'Cerrar',
  yes: 'Sí',
  no: 'No',
  minutes: 'min',
}

export type TranslationKey = keyof typeof es
