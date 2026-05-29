export {};
const { supabase } = require('../config/supabase')
const { sendWhatsAppMessage } = require('./twilio')

const ACCOUNT_SID  = process.env.TWILIO_ACCOUNT_SID  || ''
const AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN    || ''
const CHECK_INTERVAL_MS = 5 * 60 * 1000  // cada 5 minutos

/**
 * Busca turnos próximos y manda recordatorios por WhatsApp.
 * - 24h antes: si reminder_24h_sent = false
 * - 1h antes:  si reminder_1h_sent  = false
 */
async function checkAndSendReminders() {
  try {
    const now = new Date()

    // Traer negocios con reminders activos
    const { data: businesses } = await supabase
      .from('businesses')
      .select('id, name, bot_name, phone_whatsapp, reminders_enabled')
      .eq('reminders_enabled', true)
      .eq('is_active', true)

    if (!businesses?.length) return

    for (const biz of businesses) {
      // Ventana 24h: turno entre 23h y 25h desde ahora
      const win24Start = new Date(now.getTime() + 23 * 3600000)
      const win24End   = new Date(now.getTime() + 25 * 3600000)

      // Ventana 1h: turno entre 50min y 70min desde ahora
      const win1hStart = new Date(now.getTime() + 50 * 60000)
      const win1hEnd   = new Date(now.getTime() + 70 * 60000)

      // Pendientes de recordatorio 24h
      const { data: pending24 } = await supabase
        .from('appointments')
        .select('*')
        .eq('business_id', biz.id)
        .eq('reminder_24h_sent', false)
        .filter('appointment_date', 'gte', win24Start.toISOString().split('T')[0])
        .filter('appointment_date', 'lte', win24End.toISOString().split('T')[0])

      for (const appt of pending24 ?? []) {
        if (!appt.client_phone) continue
        const apptDt = new Date(`${appt.appointment_date}T${appt.appointment_time}`)
        if (apptDt < win24Start || apptDt > win24End) continue

        const msg = `Hola ${appt.client_name || 'ahí'} 👋 Te recordamos que tenés un turno *mañana a las ${appt.appointment_time.slice(0, 5)}* en *${biz.name}*. Si necesitás cancelar o reprogramar, avisanos. ¡Hasta mañana!`

        try {
          await sendWhatsAppMessage(appt.client_phone, msg, ACCOUNT_SID, AUTH_TOKEN)
          await supabase.from('appointments').update({ reminder_24h_sent: true }).eq('id', appt.id)
          console.log(`[reminders] 24h enviado → ${appt.client_phone} (appt ${appt.id})`)
        } catch (e: any) {
          console.error(`[reminders] error 24h:`, e.message)
        }
      }

      // Pendientes de recordatorio 1h
      const { data: pending1h } = await supabase
        .from('appointments')
        .select('*')
        .eq('business_id', biz.id)
        .eq('reminder_1h_sent', false)
        .filter('appointment_date', 'gte', win1hStart.toISOString().split('T')[0])
        .filter('appointment_date', 'lte', win1hEnd.toISOString().split('T')[0])

      for (const appt of pending1h ?? []) {
        if (!appt.client_phone) continue
        const apptDt = new Date(`${appt.appointment_date}T${appt.appointment_time}`)
        if (apptDt < win1hStart || apptDt > win1hEnd) continue

        const msg = `Hola ${appt.client_name || 'ahí'} 🕐 Tu turno en *${biz.name}* es en *1 hora* (${appt.appointment_time.slice(0, 5)}). ¡Te esperamos!`

        try {
          await sendWhatsAppMessage(appt.client_phone, msg, ACCOUNT_SID, AUTH_TOKEN)
          await supabase.from('appointments').update({ reminder_1h_sent: true }).eq('id', appt.id)
          console.log(`[reminders] 1h enviado → ${appt.client_phone} (appt ${appt.id})`)
        } catch (e: any) {
          console.error(`[reminders] error 1h:`, e.message)
        }
      }
    }
  } catch (err: any) {
    console.error('[reminders] error general:', err.message)
  }
}

function startRemindersJob() {
  console.log('[reminders] Servicio iniciado — chequeando cada 5 minutos')
  checkAndSendReminders()  // run immediately on start
  setInterval(checkAndSendReminders, CHECK_INTERVAL_MS)
}

module.exports = { startRemindersJob }
