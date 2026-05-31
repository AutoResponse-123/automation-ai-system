export {};
const cron = require('node-cron');
const { supabase } = require('../config/supabase');
const { sendWhatsAppMessage } = require('./twilio');

async function autoCompleteAppointments() {
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().slice(0, 5);

    // Marcar como completed los turnos scheduled cuya fecha+hora ya pasó
    const { data, error } = await supabase
      .from('appointments')
      .update({ status: 'completed' })
      .eq('status', 'scheduled')
      .or(`appointment_date.lt.${today},and(appointment_date.eq.${today},appointment_time.lt.${currentTime}:00)`);

    if (!error && data?.length > 0) {
      console.log(`[reminders] Auto-completados ${data.length} turnos pasados`);
    }
  } catch (err: any) {
    console.error('[autoComplete]', err.message);
  }
}

// Corre cada hora en punto
function startReminderJob() {
  cron.schedule('0 * * * *', async () => {
    console.log('[reminders] Ejecutando chequeo de recordatorios...');
    await sendPendingReminders();
    await autoCompleteAppointments();
  });
  console.log('[reminders] Job iniciado — corre cada hora');
}

async function sendPendingReminders() {
  try {
    const { data: businesses, error } = await supabase
      .from('businesses')
      .select('id, name, bot_name, bot_emoji, language, reminder_hours_before, phone_whatsapp')
      .eq('is_active', true);

    if (error || !businesses?.length) return;

    const now = new Date();

    for (const business of businesses) {
      const hoursConfig: number[] = business.reminder_hours_before || [24];

      for (const hoursBefore of hoursConfig) {
        // Ventana: [ahora+hoursBefore-30min, ahora+hoursBefore+30min]
        const targetTime = new Date(now.getTime() + hoursBefore * 60 * 60 * 1000);
        const windowStart = new Date(targetTime.getTime() - 30 * 60 * 1000);
        const windowEnd = new Date(targetTime.getTime() + 30 * 60 * 1000);

        const windowStartDate = windowStart.toISOString().split('T')[0];
        const windowEndDate = windowEnd.toISOString().split('T')[0];

        const { data: appointments } = await supabase
          .from('appointments')
          .select('id, client_name, client_phone, appointment_date, appointment_time, title')
          .eq('business_id', business.id)
          .eq('reminder_sent', false)
          .gte('appointment_date', windowStartDate)
          .lte('appointment_date', windowEndDate);

        if (!appointments?.length) continue;

        for (const appt of appointments) {
          const apptDateTime = new Date(`${appt.appointment_date}T${String(appt.appointment_time).slice(0,5)}`);
          if (apptDateTime < windowStart || apptDateTime > windowEnd) continue;

          const isSpanish = (business.language || 'es') === 'es';
          const botEmoji = business.bot_emoji || '🤖';
          const timeStr = String(appt.appointment_time).slice(0, 5);
          const dateStr = new Date(appt.appointment_date + 'T12:00:00').toLocaleDateString(
            isSpanish ? 'es-AR' : 'en-US',
            { weekday: 'long', day: 'numeric', month: 'long' }
          );
          const hoursText = hoursBefore < 24
            ? (isSpanish ? `${hoursBefore} horas` : `${hoursBefore} hours`)
            : (isSpanish ? `${hoursBefore / 24} día${hoursBefore / 24 > 1 ? 's' : ''}` : `${hoursBefore / 24} day${hoursBefore / 24 > 1 ? 's' : ''}`);

          const message = isSpanish
            ? `${botEmoji} Hola ${appt.client_name}! Te recordamos que tenés un turno de *${appt.title}* en *${business.name}* el *${dateStr}* a las *${timeStr}*.\n\nSi necesitás cancelar o reprogramar, escribinos. ¡Hasta pronto!`
            : `${botEmoji} Hi ${appt.client_name}! Reminder: you have a *${appt.title}* appointment at *${business.name}* on *${dateStr}* at *${timeStr}*.\n\nTo cancel or reschedule, message us here. See you soon!`;

          try {
            await sendWhatsAppMessage(
              appt.client_phone,
              message,
              process.env.TWILIO_ACCOUNT_SID!,
              process.env.TWILIO_AUTH_TOKEN!
            );
            await supabase.from('appointments').update({ reminder_sent: true }).eq('id', appt.id);
            console.log(`[reminders] ✓ ${appt.client_name} — ${appt.appointment_date} ${timeStr}`);
          } catch (err: any) {
            console.error(`[reminders] Error ${appt.client_phone}:`, err.message);
          }
        }
      }
    }
  } catch (err: any) {
    console.error('[reminders] Error general:', err.message);
  }
}

module.exports = { startReminderJob, startRemindersJob: startReminderJob, sendPendingReminders };
