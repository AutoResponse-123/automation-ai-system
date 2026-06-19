export {};
const Anthropic = require('@anthropic-ai/sdk').default;
const { getAvailableSlots, createEvent, isSlotFree, cancelEvent, resolveSlot } = require('./calendar');
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
    description: 'Reprograma el turno del cliente: cancela el actual y lo prepara para agendar uno nuevo. Usalo cuando el cliente pida cambiar, mover o reprogramar su turno. Después de llamar este tool, seguí el flujo normal de agendado: preguntá la nueva fecha y llamá get_available_slots.',
    input_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Motivo del cambio mencionado por el cliente (opcional)',
        },
      },
      required: [],
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
  const entitledPro = ['pro', 'enterprise', 'trial'].includes(business?.plan);
  // Si el negocio desactivó la agenda (schedule.appointments_enabled === false), el bot NO ofrece agendar.
  const apptEnabled = business?.schedule?.appointments_enabled !== false;
  const hasCalendar = entitledPro && !!business?.google_refresh_token && apptEnabled;
  const hasMP = entitledPro && !!business?.mp_access_token;
  const activeTools = calendarTools.filter((t: any) => {
    if (t.name === 'create_payment_link') return hasMP;
    if (t.name === 'cancel_appointment') return true; // siempre disponible
    return hasCalendar;
  });
  const tools = (hasCalendar || hasMP) ? activeTools : undefined;
  const effectiveMaxTokens = (hasCalendar || hasMP) ? Math.max(maxTokens, 1000) : maxTokens;

  let currentMessages = [...messages];
  let totalTokens = 0;
  const MAX_TOOL_ROUNDS = 5; // seguridad para evitar loops infinitos

  // Tiering por plan: Pro/Enterprise/trial usan Sonnet (más inteligente, y el trial
  // muestra la mejor versión); Basic usa Haiku (más rápido y económico → protege margen).
  const model = entitledPro ? 'claude-sonnet-4-5' : 'claude-haiku-4-5-20251001';

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
      return { text: content?.text || '', tokens: totalTokens };
    }

    // Procesar TODAS las tool calls de la respuesta. Claude puede pedir varias en
    // paralelo (ej. un get_available_slots por cada día). La API exige devolver un
    // tool_result por cada tool_use; mandar solo uno tira 400 y rompe la respuesta.
    const toolUseBlocks = response.content.filter((c: any) => c.type === 'tool_use');
    if (toolUseBlocks.length === 0) {
      const content = response.content.find((c: any) => c.type === 'text');
      return { text: content?.text || '', tokens: totalTokens };
    }

    // En paralelo: si Claude pide varios slots (un día por tool), se consultan todos
    // a la vez en vez de en serie → mucho más rápido para el cliente. Promise.all
    // preserva el orden, así cada tool_result queda con su tool_use_id correcto.
    const toolResults = await Promise.all(toolUseBlocks.map(async (toolUseBlock: any) => {
    if (toolUseBlock.input?.date) toolUseBlock.input.date = normalizeFutureDate(toolUseBlock.input.date);
    console.log(`[Claude tool call] ${toolUseBlock.name}`, toolUseBlock.input);

    // Ejecutar el tool
    let toolResult: string;
    try {
      if (toolUseBlock.name === 'get_available_slots') {
        const slots = await getAvailableSlots(business, toolUseBlock.input.date, toolUseBlock.input.duration_minutes || 60);
        toolResult = slots.length > 0
          ? `Horarios disponibles: ${slots.join(', ')}`
          : 'No hay horarios disponibles para esa fecha.';
      } else if (toolUseBlock.name === 'create_appointment') {
        const free = await isSlotFree(business, toolUseBlock.input.date, toolUseBlock.input.time, toolUseBlock.input.duration_minutes || 60);
        if (!free) {
          toolResult = 'Ese horario ya no esta disponible (lo tomaron recien). Pedile al cliente que elija otro horario y consulta de nuevo con get_available_slots. NO confirmes este turno.';
          console.log('[create_appointment] slot ocupado, rechazado:', toolUseBlock.input.date, toolUseBlock.input.time);
        } else {
        const eventId = await createEvent(business, {
          title: toolUseBlock.input.title,
          date: toolUseBlock.input.date,
          time: toolUseBlock.input.time,
          clientName: toolUseBlock.input.client_name,
          clientPhone: clientPhone || '',
          durationMinutes: toolUseBlock.input.duration_minutes,
        });
        // Buscar contact_id por phone
        const { data: contactData } = await supabase
          .from('contacts')
          .select('id')
          .eq('business_id', business.id)
          .eq('phone', clientPhone || '')
          .single();
        // Guardar en Supabase para recordatorios
        const { error: insertErr } = await supabase.from('appointments').insert({
          business_id: business.id,
          contact_id: contactData?.id || null,
          google_event_id: eventId,
          title: toolUseBlock.input.title,
          category: toolUseBlock.input.category || null,
          client_name: toolUseBlock.input.client_name,
          client_phone: clientPhone || '',
          appointment_date: toolUseBlock.input.date,
          appointment_time: toolUseBlock.input.time + ':00',
          duration_minutes: resolveSlot(business, toolUseBlock.input.duration_minutes).duration,
        });
        if (insertErr) console.error('[appointments insert]', insertErr.message);
        toolResult = `Turno creado exitosamente. ID: ${eventId}`;
        console.log(`[create_appointment] OK — Event ID: ${eventId}`);
        }
      } else if (toolUseBlock.name === 'reschedule_appointment') {
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
          toolResult = 'No se encontró ningún turno activo para reprogramar.';
        } else {
          const appt = appts[0];
          await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', appt.id);
          if (appt.google_event_id) await cancelEvent(business, appt.google_event_id);
          toolResult = `Turno anterior cancelado: ${appt.title} del ${appt.appointment_date} a las ${String(appt.appointment_time).slice(0,5)}. Ahora preguntale al cliente qué nueva fecha prefiere y consultá disponibilidad con get_available_slots.`;
          console.log(`[reschedule_appointment] Cancelado ${appt.id}, iniciando reagendado para ${clientPhone}`);
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
          await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', appt.id);
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
          console.log(`[cancel_appointment] Cancelado turno ${appt.id} de ${clientPhone}`);
        }
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
      } else {
        toolResult = `Tool desconocido: ${toolUseBlock.name}`;
      }
    } catch (err: any) {
      toolResult = `Error al acceder al calendario: ${err.message}`;
      console.error(`[tool error] ${toolUseBlock.name}:`, err.message);
      try { require('./logger').captureError(err, `tool:${toolUseBlock.name}`); } catch {}
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

  return { text: 'No se pudo completar la operación.', tokens: totalTokens };
}

module.exports = { callClaude };
// Modelo por plan: Basic/trial → Haiku, Pro/Enterprise → Sonnet (ver callClaude).
