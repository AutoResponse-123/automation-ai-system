export {};
const cron = require('node-cron');
const { supabase } = require('../config/supabase');
const { sendWhatsAppMessage, sendWhatsAppTemplate } = require('./twilio');
const { wallTimeToUtc } = require('./calendar');

async function autoCompleteAppointments() {
  try {
    const now = new Date();
    // Cota superior amplia: cualquier turno con fecha de pared <= mañana (UTC) es candidato.
    // El filtro fino se hace abajo convirtiendo a UTC con la TZ real de cada negocio.
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('appointments')
      .select('id, appointment_date, appointment_time, businesses(schedule)')
      .eq('status', 'scheduled')
      .lte('appointment_date', tomorrow);

    if (error || !data?.length) return;

    const toComplete = data
      .filter((appt: any) => {
        const tz = appt.businesses?.schedule?.timezone || 'America/Argentina/Buenos_Aires';
        const startUtc = wallTimeToUtc(appt.appointment_date, String(appt.appointment_time).slice(0, 5), tz);
        return startUtc.getTime() < now.getTime();
      })
      .map((appt: any) => appt.id);

    if (toComplete.length) {
      await supabase.from('appointments').update({ status: 'completed' }).in('id', toComplete);
      console.log(`[reminders] Auto-completados ${toComplete.length} turnos pasados`);
    }
  } catch (err: any) {
    console.error('[autoComplete]', err.message);
  }
}

function startReminderJob() {
  // Cada 15 min para soportar recordatorios sub-hora (30 min / 1 h) con precisión.
  // El dedup por reminders_sent evita reenvíos dentro de la ventana de ±30 min.
  cron.schedule('*/15 * * * *', async () => {
    console.log('[reminders] Ejecutando chequeo de recordatorios...');
    await sendPendingReminders();
    await autoCompleteAppointments();
  });
  console.log('[reminders] Job iniciado — corre cada 15 min');
}

async function sendPendingReminders() {
  try {
    const { data: businesses, error } = await supabase
      .from('businesses')
      .select('id, name, bot_name, bot_emoji, language, reminder_hours_before, phone_whatsapp, schedule')
      .eq('is_active', true);

    if (error || !businesses?.length) return;

    const now = new Date();

    for (const business of businesses) {
      const hoursConfig: number[] = business.reminder_hours_before || [24];
      const tz = business.schedule?.timezone || 'America/Argentina/Buenos_Aires';

      for (const hoursBefore of hoursConfig) {
        const targetTime = new Date(now.getTime() + hoursBefore * 60 * 60 * 1000);
        // Ventana ±10 min: con el cron cada 15 min nunca se pierde un turno
        // y el recordatorio sale cerca de la hora pedida (clave para 30 min / 1 h).
        const windowStart = new Date(targetTime.getTime() - 10 * 60 * 1000);
        const windowEnd = new Date(targetTime.getTime() + 10 * 60 * 1000);

        const windowStartDate = windowStart.toISOString().split('T')[0];
        const windowEndDate = windowEnd.toISOString().split('T')[0];

        const { data: appointments } = await supabase
          .from('appointments')
          .select('id, client_name, client_phone, appointment_date, appointment_time, title, reminders_sent')
          .eq('business_id', business.id)
          .eq('status', 'scheduled')
          .gte('appointment_date', windowStartDate)
          .lte('appointment_date', windowEndDate);

        if (!appointments?.length) continue;

        for (const appt of appointments) {
          const alreadySent: number[] = appt.reminders_sent || [];
          if (alreadySent.includes(hoursBefore)) continue;

          const apptDateTime = wallTimeToUtc(appt.appointment_date, String(appt.appointment_time).slice(0, 5), tz);
          if (apptDateTime < windowStart || apptDateTime > windowEnd) continue;

          const isSpanish = (business.language || 'es') === 'es';
          const botEmoji = business.bot_emoji || '\u{1F916}';
          const timeStr = String(appt.appointment_time).slice(0, 5);
          const dateStr = new Date(appt.appointment_date + 'T12:00:00').toLocaleDateString(
            isSpanish ? 'es-AR' : 'en-US',
            { weekday: 'long', day: 'numeric', month: 'long' }
          );

          const message = isSpanish
            ? `${botEmoji} Hola ${appt.client_name}! Te recordamos que tenés un turno de *${appt.title}* en *${business.name}* el *${dateStr}* a las *${timeStr}*.\n\nSi necesitás cancelar o reprogramar, escribinos. ¡Hasta pronto!`
            : `${botEmoji} Hi ${appt.client_name}! Reminder: you have a *${appt.title}* appointment at *${business.name}* on *${dateStr}* at *${timeStr}*.\n\nTo cancel or reschedule, message us here.`;

          // Los recordatorios suelen caer fuera de la ventana de 24hs → requieren plantilla aprobada.
          // Si hay SID de plantilla configurado se usa; si no, fallback a texto libre (solo funciona dentro de la ventana).
          const templateSid = isSpanish
            ? process.env.TWILIO_REMINDER_TEMPLATE_ES
            : process.env.TWILIO_REMINDER_TEMPLATE_EN;

          try {
            if (templateSid) {
              await sendWhatsAppTemplate(
                appt.client_phone,
                templateSid,
                {
                  '1': appt.client_name,
                  '2': appt.title,
                  '3': business.name,
                  '4': dateStr,
                  '5': timeStr,
                },
                process.env.TWILIO_ACCOUNT_SID!,
                process.env.TWILIO_AUTH_TOKEN!,
                business.phone_whatsapp
              );
            } else {
              await sendWhatsAppMessage(
                appt.client_phone,
                message,
                process.env.TWILIO_ACCOUNT_SID!,
                process.env.TWILIO_AUTH_TOKEN!,
                business.phone_whatsapp
              );
            }
            await supabase.from('appointments')
              .update({ reminder_sent: true, reminders_sent: [...alreadySent, hoursBefore] })
              .eq('id', appt.id);
            console.log(`[reminders] OK ${appt.client_name} ${appt.appointment_date} ${timeStr} (${hoursBefore}h)`);
          } catch (err: any) {
            console.error(`[reminders] Error ${appt.client_phone}:`, err.message);
          }
        }
      }
    }
  } catch (err: any) {
    const { captureError } = require('./logger');
    captureError(err, 'reminders');
  }
}

module.exports = { startReminderJob, startRemindersJob: startReminderJob, sendPendingReminders, autoCompleteAppointments };
