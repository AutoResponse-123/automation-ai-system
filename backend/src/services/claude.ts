export {};
const Anthropic = require('@anthropic-ai/sdk').default;
const { getAvailableSlots, createEvent } = require('./calendar');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const calendarTools = [
  {
    name: 'get_available_slots',
    description: 'Consulta los horarios disponibles en el calendario del negocio para una fecha específica.',
    input_schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Fecha en formato YYYY-MM-DD (ej: 2025-06-15)',
        },
      },
      required: ['date'],
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
          description: 'Duración del turno en minutos (default: 60)',
        },
      },
      required: ['title', 'date', 'time', 'client_name'],
    },
  },
];

async function callClaude(
  messages: any[],
  systemPrompt: string,
  maxTokens: number = 300,
  business?: any,
  clientPhone?: string
) {
  const hasCalendar = !!business?.google_refresh_token;
  const tools = hasCalendar ? calendarTools : undefined;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages,
    ...(tools ? { tools } : {}),
  });

  // Sin tools, respuesta normal
  if (response.stop_reason !== 'tool_use') {
    const content = response.content.find((c: any) => c.type === 'text');
    return { text: content?.text || '', tokens: response.usage?.output_tokens ?? 0 };
  }

  // Procesar tool calls
  const toolUseBlock = response.content.find((c: any) => c.type === 'tool_use');
  if (!toolUseBlock) {
    const content = response.content.find((c: any) => c.type === 'text');
    return { text: content?.text || '', tokens: response.usage?.output_tokens ?? 0 };
  }

  let toolResult: any;
  try {
    if (toolUseBlock.name === 'get_available_slots') {
      const slots = await getAvailableSlots(business, toolUseBlock.input.date);
      toolResult = slots.length > 0
        ? `Horarios disponibles: ${slots.join(', ')}`
        : 'No hay horarios disponibles para esa fecha.';
    } else if (toolUseBlock.name === 'create_appointment') {
      const eventId = await createEvent(business, {
        title: toolUseBlock.input.title,
        date: toolUseBlock.input.date,
        time: toolUseBlock.input.time,
        clientName: toolUseBlock.input.client_name,
        clientPhone: clientPhone || '',
        durationMinutes: toolUseBlock.input.duration_minutes,
      });
      toolResult = `Turno creado exitosamente. ID: ${eventId}`;
    }
  } catch (err: any) {
    toolResult = `Error al acceder al calendario: ${err.message}`;
  }

  // Segunda llamada a Claude con el resultado del tool
  const followUp = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [
      ...messages,
      { role: 'assistant', content: response.content },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolUseBlock.id, content: toolResult }],
      },
    ],
    ...(tools ? { tools } : {}),
  });

  const finalContent = followUp.content.find((c: any) => c.type === 'text');
  return {
    text: finalContent?.text || '',
    tokens: (response.usage?.output_tokens ?? 0) + (followUp.usage?.output_tokens ?? 0),
  };
}

module.exports = { callClaude };
