export {};
const Anthropic = require('@anthropic-ai/sdk').default;
const { getAvailableSlots, createEvent, isSlotFree, cancelEvent, resolveSlot, isInvalidGrant, clearCalendarToken } = require('./calendar');
const { supabase } = require('../config/supabase');
const { createPaymentLink } = require('./mercadopago');
const { sendCancellationEmail } = require('./email');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const calendarTools = [
  {
    name: 'get_available_slots',
    description: 'Consulta los horarios disponibles en el calendario del negocio para una fecha específica. IMPORTANTE: pasá duration_minutes con la duración del servicio que pidió el cliente (la de su categoría), así los horarios ofrecidos calzan con ese servicio. Si todavía no sabés qué servicio quiere, preguntáselo antes de consultar.',
    input_schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Fecha en formato YYYY-MM-DD (ej: 2025-06-15)',
        },
        duration_minutes: {
          type: 'number',
          description: 'Duración en minutos del servicio que quiere el cliente (usá la de la categoría/servicio elegido). Si no se especificó, omitir.',
        },
      },
      required: ['date'],
    },
  },
  {
    name: 'create_payment_link',
    description: 'Genera un link de pago de Mercado Pago para cobrarle al cliente. Usalo cuando el cliente quiera pagar, pregunté precio o mostrá intención de compra.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Descripción del producto o servicio (ej: Corte de cabello)' },
        amount: { type: 'number', description: 'Monto a cobrar en la moneda local (ej: 5000)' },
      },
      required: ['title', 'amount'],
    },
  },
  {
    name: 'reschedule_appointment',
    description: 'Reprograma el turno del cliente a una nueva fecha y hora. Flujo: 1) preguntá la nueva fecha, 2) llamá get_available_slots para esa fecha, 3) cuando el cliente elija una hora disponible, llamá este tool con new_date y new_time. El sistema reserva el nuevo horario PRIMERO y recién ahí libera el anterior, así el cliente nunca se queda sin turno. NO canceles el turno por tu cuenta antes de tener la nueva hora.',
    input_schema: {
      type: 'object',
      properties: {
        new_date: { type: 'string', description: 'Nueva fecha del turno (YYYY-MM-DD)' },
        new_time: { type: 'string', description: 'Nueva hora del turno (HH:MM)' },
        duration_minutes: { type: 'number', description: 'Duración en minutos (opcional)' },
        reason: { type: 'string', description: 'Motivo del cambio mencionado por el cliente (opcional)' },
      },
      required: ['new_date', 'new_time'],
    },
  },
  {
    name: 'cancel_appointment',
    description: 'Cancela un turno existente del cliente. Usalo cuando el cliente pida cancelar o anular su turno.',
    input_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Motivo de cancelación mencionado por el cliente (opcional)',
        },
      },
      required: [],
    },
  },
  {
    name: 'escalate_to_human',
    description: 'Derivá la conversación a un humano del equipo cuando: no puedas resolver lo que pide el cliente, haya un error que te impida continuar, o el cliente pida explícitamente hablar con una persona. Después de llamarlo, respondé al cliente avisándole brevemente que lo derivás. NO lo uses para consultas normales que sí podés responder vos.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Motivo breve de la derivación (opcional)' },
      },
      required: [],
    },
  },
  {
    name: 'send_menu',
    description: 'Mostrale al cliente un menú de botones rápidos (opciones tocables) en lugar de pedirle que escriba. Útil para ofrecer acciones claras al inicio o cuando hay que elegir entre opciones. Llamalo cuando botones tocables agilicen la conversación. Después de llamarlo NO repitas las opciones en texto.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'create_appointment',
    description: 'Crea un turno/cita en el calendario del negocio.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Tipo de servicio o motivo del turno (ej: Corte de cabello)',
        },
        category: {
          type: 'string',
          description: 'Categoría del servicio, debe coincidir exactamente con una de las categorías configuradas',
        },
        date: {
          type: 'string',
          description: 'Fecha en formato YYYY-MM-DD',
        },
        time: {
          type: 'string',
          description: 'Hora en formato HH:MM (ej: 14:00)',
        },
        client_name: {
          type: 'string',
          description: 'Nombre del cliente',
        },
        duration_minutes: {
          type: 'number',
          description: 'Duración del turno en minutos — usá la duración de la categoría si está disponible',
        },
      },
      required: ['title', 'date', 'time', 'client_name'],
    },
  },
];

// Defensa de año: a veces el modelo calcula fechas con un año pasado (ej. 2025 en vez
// de 2026) y los turnos quedan en el pasado → 0 slots. Si la fecha quedó antes de hoy,
// la empujamos al año en curso (y si aún es pasada, al siguiente). Los turnos son a futuro.
function normalizeFutureDate(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const todayStr = new Date().toISOString().slice(0, 10);
  if (dateStr >= todayStr) return dateStr;
  const [, mo, dd] = dateStr.split('-');
  const curY = new Date().getUTCFullYear();
  const cand = `${curY}-${mo}-${dd}`;
  return cand >= todayStr ? cand : `${curY + 1}-${mo}-${dd}`;
}

async function callClaude(
  messages: any[],
  systemPrompt: string,
  maxTokens: number = 300,
  business?: any,
  clientPhone?: string
) {
  // Features Pro (turnos/Calendar y Mercado Pago) solo para Pro/Enterprise/trial,
  // sin importar si quedó un token conectado de antes (un Basic no las usa).
  const entitledPro = ['pro', 'premium', 'enterprise', 'trial'].includes(business?.plan);
  // Si el negocio desactivó la agenda (schedule.appointments_enabled === false), el bot NO ofrece agendar.
  const apptEnabled = business?.schedule?.appointments_enabled !== false;
  const hasCalendar = entitledPro && !!business?.google_refresh_token && apptEnabled;
  const hasMP = entitledPro && !!business?.mp_access_token;
  // El bot puede derivar a un humano por su cuenta (si el negocio lo habilita).
  const botDecides = business?.schedule?.escalation_bot_decides !== false;
  const activeTools = calendarTools.filter((t: any) => {
    if (t.name === 'create_payment_link') return hasMP;
    if (t.name === 'cancel_appointment') return hasCalendar;
    if (t.name === 'escalate_to_human') return botDecides;
    if (t.name === 'send_menu') return !!business?.menu_content_sid;
    return hasCalendar;
  });
  const tools = activeTools.length > 0 ? activeTools : undefined;
  const effectiveMaxTokens = tools ? Math.max(maxTokens, 1000) : maxTokens;

  let currentMessages = [...messages];
  let totalTokens = 0;
  let escalateRequested = false;
  let escalateReason = '';
  const MAX_TOOL_ROUNDS = 5; // seguridad para evitar loops infinitos
  const calledActionTools = new Set<string>(); // tools de acción ya ejecutados (guard anti-alucinación)
  let guardRetries = 0;

  // Velocidad: usamos Haiku en TODOS los planes para que el bot responda lo más rápido
  // posible (es muy capaz para atención + turnos). Antes Pro/trial usaba Sonnet (más lento).
  const model = 'claude-haiku-4-5-20251001';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model,
      max_tokens: effectiveMaxTokens,
      system: systemPrompt,
      messages: currentMessages,
      ...(tools ? { tools } : {}),
    });

    totalTokens += response.usage?.output_tokens ?? 0;

    // Si no hay tool call, devolver respuesta final
    if (response.stop_reason !== 'tool_use') {
      const content = response.content.find((c: any) => c.type === 'text');
      const finalText = content?.text || '';

      // Guard anti-alucinación (estructural): el modelo a veces AFIRMA que canceló o
      // reprogramó un turno sin haber llamado a la herramienta -> el cambio nunca ocurre.
      // Si detectamos esa afirmación sin la ejecución del tool, lo forzamos a corregirse
      // una vez. La corrección es segura: solo le pide ejecutar la herramienta si el
      // cliente realmente lo pidió, o aclarar que el turno NO fue modificado.
      if (hasCalendar && guardRetries < 1) {
        const claimsCancel = /\b(cancel|anul)(é|ó|amos|aron|aste|ad[oa]s?)/i.test(finalText) || /\b(ya )?no ten[ée]s\b[^.]{0,30}\bturnos?\b/i.test(finalText);
        const claimsReschedule = /\b(reprogram|reagend)(é|ó|amos|aron|aste|ad[oa]s?)/i.test(finalText)
          || /\b(turno|cita|hora)\b[^.]{0,40}\b(actualizad[oa]|cambiad[oa]|movid[oa])\b/i.test(finalText);
        // Confirmación de un turno NUEVO (agendado/reservado/confirmado) sin haber
        // ejecutado create_appointment → el turno nunca se guardó. Mismo problema que
        // con cancelar/reprogramar. Un reschedule también "agenda", por eso solo cuenta
        // como alucinación si NO se llamó ni create_appointment ni reschedule_appointment.
        const claimsCreate = /\b(agend|reserv)(é|ó|amos|aron|aste|ad[oa]s?)\b/i.test(finalText)
          || /\btu turno\b[^.]{0,40}\b(qued[óo]|est[áa]|list[oa]|confirmad[oa])\b/i.test(finalText)
          || /\bqued[óo]\b[^.]{0,20}\bagendad[oa]\b/i.test(finalText)
          || /\bturno\b[^.]{0,20}\bconfirmad[oa]\b/i.test(finalText);
        const hallucinatedCancel = claimsCancel && !calledActionTools.has('cancel_appointment');
        const hallucinatedReschedule = claimsReschedule && !calledActionTools.has('reschedule_appointment');
        const hallucinatedCreate = claimsCreate
          && !calledActionTools.has('create_appointment')
          && !calledActionTools.has('reschedule_appointment');
        if (hallucinatedCancel || hallucinatedReschedule || hallucinatedCreate) {
          guardRetries++;
          console.warn('[guard] confirmación sin ejecución de tool detectada — forzando corrección');
          const correction = hallucinatedCreate
            ? 'Aviso del sistema: afirmaste que el turno quedó agendado/reservado/confirmado SIN ejecutar la herramienta create_appointment, así que el turno NO se creó. Si el cliente ya definió servicio, fecha y una hora, verificá disponibilidad con get_available_slots y llamá AHORA a create_appointment; confirmá únicamente según su resultado. Si falta algún dato o la hora no está disponible, NO confirmes: pedí lo que falte u ofrecé los horarios disponibles.'
            : 'Aviso del sistema: afirmaste algo sobre el estado del/los turno(s) del cliente (que se cancelo, se reprogramo, o que no tiene turnos) SIN ejecutar la herramienta, asi que NO verificaste el estado real. Si el cliente pidio cancelar o reprogramar, llama AHORA a la herramienta correspondiente (cancel_appointment / reschedule_appointment) y responde unicamente segun su resultado. No afirmes que un turno fue cancelado/reprogramado ni que no hay turnos sin confirmarlo con la herramienta.';
          currentMessages = [
            ...currentMessages,
            { role: 'assistant', content: finalText },
            { role: 'user', content: correction },
          ];
          continue;
        }
      }

      return { text: finalText, tokens: totalTokens, escalate: escalateRequested, escalateReason };
    }

    // Procesar TODAS las tool calls de la respuesta. Claude puede pedir varias en
    // paralelo (ej. un get_available_slots por cada día). La API exige devolver un
    // tool_result por cada tool_use; mandar solo uno tira 400 y rompe la respuesta.
    const toolUseBlocks = response.content.filter((c: any) => c.type === 'tool_use');
    if (toolUseBlocks.length === 0) {
      const content = response.content.find((c: any) => c.type === 'text');
      return { text: content?.text || '', tokens: totalTokens, escalate: escalateRequested, escalateReason };
    }

    // En paralelo: si Claude pide varios slots (un día por tool), se consultan todos
    // a la vez en vez de en serie → mucho más rápido para el cliente. Promise.all
    // preserva el orden, así cada tool_result queda con su tool_use_id correcto.
    const toolResults = await Promise.all(toolUseBlocks.map(async (toolUseBlock: any) => {
    if (toolUseBlock.input?.date) toolUseBlock.input.date = normalizeFutureDate(toolUseBlock.input.date);
    console.log(`[Claude tool call] ${toolUseBlock.name}`, toolUseBlock.input);
    calledActionTools.add(toolUseBlock.name);

    // Ejecutar el tool
    let toolResult: string;
    try {
      if (toolUseBlock.name === 'get_available_slots') {
        const slots = await getAvailableSlots(business, toolUseBlock.input.date, toolUseBlock.input.duration_minutes || 60);
        toolResult = slots.length > 0
          ? `Horarios disponibles: ${slots.join(', ')}`
          : 'No hay horarios disponibles para esa fecha.';
      } else if (toolUseBlock.name === 'create_appointment') {
        const reqDate = toolUseBlock.input.date;
        const reqTime = String(toolUseBlock.input.time).slice(0, 5);
        const reqDur = toolUseBlock.input.duration_minutes || 60;

        // 1) El horario tiene que ser uno REALMENTE ofrecido: esto valida horario de
        //    atención, día cerrado, descansos, feriados, horarios pasados y ocupados.
        const offered = await getAvailableSlots(business, reqDate, reqDur);
        if (!offered.includes(reqTime)) {
          toolResult = `El horario ${reqTime} NO está disponible para ${reqDate}. Horarios disponibles: ${offered.join(', ') || 'ninguno ese día'}. Ofrecele uno de esos y NO confirmes hasta que el cliente elija uno válido.`;
          console.log('[create_appointment] horario no ofrecido, rechazado:', reqDate, reqTime);
        } else {
          const { data: contactData } = await supabase
            .from('contacts').select('id')
            .eq('business_id', business.id).eq('phone', clientPhone || '').maybeSingle();

          // 2) Guardar en la base PRIMERO. El índice único parcial
          //    (business_id, appointment_date, appointment_time) WHERE status='scheduled'
          //    actúa de candado anti doble-reserva: si dos clientes intentan el mismo
          //    horario casi a la vez, el segundo insert falla (code 23505).
          const { data: inserted, error: insertErr } = await supabase.from('appointments').insert({
            business_id: business.id,
            contact_id: contactData?.id || null,
            title: toolUseBlock.input.title,
            category: toolUseBlock.input.category || null,
            client_name: toolUseBlock.input.client_name,
            client_phone: clientPhone || '',
            appointment_date: reqDate,
            appointment_time: reqTime + ':00',
            duration_minutes: resolveSlot(business, reqDur).duration,
          }).select('id').maybeSingle();

          if (insertErr) {
            const dup = insertErr.code === '23505' || /duplicate|unique/i.test(insertErr.message || '');
            if (dup) {
              toolResult = `Ese horario (${reqTime}) lo acaban de tomar. Pedile al cliente que elija otro y consultá de nuevo con get_available_slots. NO confirmes este turno.`;
              console.log('[create_appointment] doble-reserva evitada:', reqDate, reqTime);
            } else {
              console.error('[appointments insert]', insertErr.message);
              toolResult = `ERROR: no se pudo guardar el turno (${insertErr.message}). NO le confirmes el turno al cliente. Pedile disculpas, avisale que hubo un problema técnico y que alguien del equipo lo va a contactar. Derivá a un humano si podés.`;
              try { require('./logger').captureError(insertErr, 'appointments_insert'); } catch {}
            }
          } else {
            // 3) Recién ahora el evento en Google (el turno YA quedó reservado en la base).
            //    Si Google falla, el turno igual está guardado (recordatorios funcionan).
            let eventId: string | null = null;
            try {
              eventId = await createEvent(business, {
                title: toolUseBlock.input.title, date: reqDate, time: reqTime,
                clientName: toolUseBlock.input.client_name, clientPhone: clientPhone || '',
                durationMinutes: reqDur,
              });
              if (eventId) await supabase.from('appointments').update({ google_event_id: eventId }).eq('id', inserted.id);
            } catch (gErr: any) {
              console.error('[create_appointment] Google event falló (turno igual guardado):', gErr?.message || gErr);
            }
            const { advanceStage } = require('./pipeline');
            advanceStage(contactData?.id, 'agendó').catch((e: any) => console.error('[pipeline async]', e.message));
            toolResult = `Turno creado exitosamente.`;
            console.log(`[create_appointment] OK — ${reqDate} ${reqTime} (event: ${eventId || 'sin google'})`);
          }
        }
      } else if (toolUseBlock.name === 'reschedule_appointment') {
        const today = new Date().toISOString().split('T')[0];
        const newDate = normalizeFutureDate(toolUseBlock.input.new_date);
        const newTime = String(toolUseBlock.input.new_time).slice(0, 5);
        const newDur = toolUseBlock.input.duration_minutes || 60;

        const { data: appts } = await supabase
          .from('appointments').select('*')
          .eq('business_id', business.id).eq('client_phone', clientPhone || '')
          .eq('status', 'scheduled').gte('appointment_date', today)
          .order('appointment_date').order('appointment_time').limit(1);

        if (!appts || appts.length === 0) {
          toolResult = 'No se encontró ningún turno activo para reprogramar. Si el cliente quiere uno nuevo, usá create_appointment.';
        } else {
          const appt = appts[0];
          // 1) El nuevo horario tiene que estar realmente disponible.
          const offered = await getAvailableSlots(business, newDate, newDur);
          if (!offered.includes(newTime)) {
            toolResult = `El horario ${newTime} no está disponible para ${newDate}. El turno actual (${appt.appointment_date} ${String(appt.appointment_time).slice(0, 5)}) SIGUE ACTIVO. Horarios disponibles: ${offered.join(', ') || 'ninguno'}. Ofrecele otro y NO confirmes el cambio.`;
          } else {
            // 2) Reservar el NUEVO turno primero (candado anti doble-reserva).
            const { data: inserted, error: insertErr } = await supabase.from('appointments').insert({
              business_id: business.id,
              contact_id: appt.contact_id || null,
              title: appt.title,
              category: appt.category || null,
              client_name: appt.client_name,
              client_phone: clientPhone || '',
              appointment_date: newDate,
              appointment_time: newTime + ':00',
              duration_minutes: resolveSlot(business, newDur).duration,
            }).select('id').maybeSingle();

            if (insertErr) {
              const dup = insertErr.code === '23505' || /duplicate|unique/i.test(insertErr.message || '');
              toolResult = dup
                ? `Ese horario (${newTime}) lo acaban de tomar. El turno actual SIGUE ACTIVO. Ofrecele otro horario y NO confirmes el cambio.`
                : `ERROR al reprogramar (${insertErr.message}). El turno actual SIGUE ACTIVO. Pedile disculpas y derivá a un humano. NO confirmes el cambio.`;
              if (!dup) { try { require('./logger').captureError(insertErr, 'reschedule_insert'); } catch {} }
            } else {
              // 3) Recién ahora liberamos el turno viejo (ya está asegurado el nuevo).
              await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', appt.id);
              if (appt.google_event_id) await cancelEvent(business, appt.google_event_id);
              // 4) Evento de Google para el nuevo turno.
              try {
                const eventId = await createEvent(business, { title: appt.title, date: newDate, time: newTime, clientName: appt.client_name, clientPhone: clientPhone || '', durationMinutes: newDur });
                if (eventId) await supabase.from('appointments').update({ google_event_id: eventId }).eq('id', inserted.id);
              } catch (gErr: any) { console.error('[reschedule] Google event falló:', gErr?.message || gErr); }
              const { advanceStage } = require('./pipeline');
              advanceStage(appt.contact_id, 'agendó').catch((e: any) => console.error('[pipeline async]', e.message));
              toolResult = `Turno reprogramado: de ${appt.appointment_date} ${String(appt.appointment_time).slice(0, 5)} a ${newDate} ${newTime}.`;
              console.log(`[reschedule_appointment] ${appt.id} → ${newDate} ${newTime}`);
            }
          }
        }
      } else if (toolUseBlock.name === 'cancel_appointment') {
        // Buscar el próximo turno activo del cliente
        const today = new Date().toISOString().split('T')[0];
        const { data: appts } = await supabase
          .from('appointments')
          .select('*')
          .eq('business_id', business.id)
          .eq('client_phone', clientPhone || '')
          .eq('status', 'scheduled')
          .gte('appointment_date', today)
          .order('appointment_date').order('appointment_time')
          .limit(1);

        if (!appts || appts.length === 0) {
          toolResult = 'No se encontró ningún turno activo para cancelar.';
        } else {
          const appt = appts[0];
          const { error: cancelErr } = await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', appt.id);
          if (cancelErr) {
            console.error('[cancel_appointment] update falló:', cancelErr.message);
            try { require('./logger').captureError(cancelErr, 'cancel_update'); } catch {}
            toolResult = `ERROR: no se pudo cancelar el turno (${cancelErr.message}). NO le confirmes la cancelación al cliente. Pedile disculpas, avisale que el equipo lo va a contactar y derivá a un humano.`;
          } else {
            if (appt.google_event_id) await cancelEvent(business, appt.google_event_id);

            // Email al dueño
            sendCancellationEmail({
              to: business.escalation_email,
              businessName: business.name,
              botName: business.bot_name || 'Bot',
              clientPhone: clientPhone || '',
              clientName: appt.client_name,
              appointmentDate: appt.appointment_date,
              appointmentTime: String(appt.appointment_time).slice(0, 5),
              title: appt.title,
            }).catch((e: any) => console.error('[cancel email]', e.message));

            toolResult = `Turno cancelado: ${appt.title} del ${appt.appointment_date} a las ${String(appt.appointment_time).slice(0, 5)}.`;
          }
          console.log(`[cancel_appointment] Cancelado turno ${appt.id} de ${clientPhone}`);
        }
      } else if (toolUseBlock.name === 'escalate_to_human') {
        escalateRequested = true;
        escalateReason = toolUseBlock.input?.reason || '';
        toolResult = 'Derivación registrada. Avisale al cliente en UNA frase corta y amable que lo vas a derivar con una persona del equipo y que le responderán en breve. No menciones datos de contacto.';
        console.log('[escalate_to_human] solicitada:', escalateReason);
      } else if (toolUseBlock.name === 'create_payment_link') {
        if (!business.mp_access_token) {
          toolResult = 'Mercado Pago no está configurado en este negocio.';
        } else {
          const { url } = await createPaymentLink({
            accessToken: business.mp_access_token,
            title: toolUseBlock.input.title,
            amount: toolUseBlock.input.amount,
          });
          toolResult = `Link de pago generado: ${url}`;
          console.log(`[create_payment_link] OK — ${url}`);
        }
      } else if (toolUseBlock.name === 'send_menu') {
        if (!business.menu_content_sid) {
          toolResult = 'El menú de botones no está configurado en este negocio.';
        } else {
          const { sendWhatsAppTemplate } = require('./twilio');
          await sendWhatsAppTemplate(clientPhone || '', business.menu_content_sid, {}, process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN, business.phone_whatsapp);
          toolResult = 'Menú de botones enviado al cliente. No repitas las opciones en texto.';
          console.log('[send_menu] menú enviado a', clientPhone);
        }
      } else {
        toolResult = `Tool desconocido: ${toolUseBlock.name}`;
      }
    } catch (err: any) {
      console.error(`[tool error] ${toolUseBlock.name}:`, err.message);
      try { require('./logger').captureError(err, `tool:${toolUseBlock.name}`); } catch {}
      if (isInvalidGrant(err)) {
        // El token de Google está muerto: lo marcamos desconectado (el panel pedirá
        // reconectar y el bot deja de ofrecer agenda). El dueño se entera por Sentry
        // (captureError de arriba).
        clearCalendarToken(business.id).catch(() => {});
        toolResult = 'La agenda no está disponible en este momento (se desconectó el calendario). NO inventes disponibilidad ni confirmes turnos. Pedile disculpas al cliente, decile que en breve el equipo lo contacta para coordinar, y derivá a un humano.';
      } else {
        toolResult = `Error al acceder al calendario: ${err.message}`;
      }
    }
      return { type: 'tool_result', tool_use_id: toolUseBlock.id, content: toolResult };
    }));

    // Agregar la respuesta del asistente + TODOS los tool_result y continuar el loop
    currentMessages = [
      ...currentMessages,
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResults },
    ];
  }

  return { text: 'No se pudo completar la operación.', tokens: totalTokens, escalate: escalateRequested, escalateReason };
}

module.exports = { callClaude };
// Modelo: Haiku en todos los planes (prioriza velocidad de respuesta; ver callClaude).
