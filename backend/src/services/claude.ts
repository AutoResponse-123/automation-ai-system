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
  const effectiveMaxTokens = hasCalendar ? Math.max(maxTokens, 1000) : maxTokens;

  let currentMessages = [...messages];
  let totalTokens = 0;
  const MAX_TOOL_ROUNDS = 5; // seguridad para evitar loops infinitos

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
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

    // Buscar el tool call
    const toolUseBlock = response.content.find((c: any) => c.type === 'tool_use');
    if (!toolUseBlock) {
      const content = response.content.find((c: any) => c.type === 'text');
      return { text: content?.text || '', tokens: totalTokens };
    }

    console.log(`[Claude tool call] ${toolUseBlock.name}`, toolUseBlock.input);

    // Ejecutar el tool
    let toolResult: string;
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
        console.log(`[create_appointment] OK — Event ID: ${eventId}`);
      } else {
        toolResult = `Tool desconocido: ${toolUseBlock.name}`;
      }
    } catch (err: any) {
      toolResult = `Error al acceder al calendario: ${err.message}`;
      console.error(`[tool error] ${toolUseBlock.name}:`, err.message);
    }

    // Agregar resultado al historial y continuar el loop
    currentMessages = [
      ...currentMessages,
      { role: 'assistant', content: response.content },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolUseBlock.id, content: toolResult }],
      },
    ];
  }

  return { text: 'No se pudo completar la operación.', tokens: totalTokens };
}

module.exports = { callClaude };
