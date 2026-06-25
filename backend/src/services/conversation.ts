export {};
const { supabase } = require('../config/supabase');

async function getOrCreateConversation(
  businessId: string,
  contactPhone: string,
  sessionTimeoutHours: number = 6
) {
  // Contacto: buscar; si no existe, crear tolerando carrera (índice único
  // contacts(business_id, phone) → si otro proceso lo creó a la vez, re-leemos).
  let contact: any = (await supabase
    .from('contacts')
    .select('id, summary')
    .eq('business_id', businessId)
    .eq('phone', contactPhone)
    .maybeSingle()).data;

  if (!contact) {
    const ins = await supabase
      .from('contacts')
      .insert({ business_id: businessId, phone: contactPhone, interaction_count: 1 })
      .select('id, summary')
      .maybeSingle();
    contact = ins.data || (await supabase
      .from('contacts')
      .select('id, summary')
      .eq('business_id', businessId)
      .eq('phone', contactPhone)
      .maybeSingle()).data;
    if (!contact) throw ins.error || new Error('No se pudo crear/obtener el contacto');
  }

  const contactId: string = contact.id;
  const contactSummary: string | null = contact.summary || null;

  // Conversación abierta (activa o pendiente/derivada). Se reutiliza para no perder el hilo
  // ni "reactivar" sin querer una conversación derivada a un humano. Solo las 'resolved' se
  // consideran cerradas (=> se crea una nueva).
  const SESSION_TIMEOUT_MS = Math.max(0, Number(sessionTimeoutHours) || 0) * 60 * 60 * 1000; // 0 = nunca reinicia
  let conversation: any = ((await supabase
    .from('conversations')
    .select('id, ai_enabled')
    .eq('business_id', businessId)
    .eq('contact_id', contactId)
    .in('status', ['active', 'pending'])
    .order('started_at', { ascending: false })
    .limit(1)).data || [])[0] || null;

  let lastMessageAt: string | null = null;
  if (conversation) {
    const { data: lastMsgs } = await supabase
      .from('messages')
      .select('created_at')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: false })
      .limit(1);
    lastMessageAt = (lastMsgs && lastMsgs[0]?.created_at) || null;
    const lastTs = lastMessageAt ? new Date(lastMessageAt).getTime() : null;
    const paused = conversation.ai_enabled === false;
    // Reinicio por inactividad SOLO si NO está pausada (derivada). Las derivadas las maneja
    // el webhook (reactivación manual o automática configurable), no este timer.
    if (!paused && SESSION_TIMEOUT_MS > 0 && lastTs && Date.now() - lastTs > SESSION_TIMEOUT_MS) {
      await supabase
        .from('conversations')
        .update({ status: 'resolved', updated_at: new Date().toISOString() })
        .eq('id', conversation.id);
      conversation = null;
      lastMessageAt = null;
    }
  }

  if (!conversation) {
    const ins = await supabase
      .from('conversations')
      .insert({ business_id: businessId, contact_id: contactId, status: 'active' })
      .select('id, ai_enabled')
      .maybeSingle();
    conversation = ins.data || (await supabase
      .from('conversations')
      .select('id, ai_enabled')
      .eq('business_id', businessId)
      .eq('contact_id', contactId)
      .eq('status', 'active')
      .maybeSingle()).data;
    if (!conversation) throw ins.error || new Error('No se pudo crear/obtener la conversación');
  }

  return {
    contactId,
    conversationId: conversation.id,
    contactSummary,
    aiEnabled: conversation.ai_enabled !== false,
    lastMessageAt,
  };
}

async function updateContactSummary(contactId: string, conversationId: string, business: any) {
  // Traer los últimos 40 mensajes de la conversación actual
  const { data: messages } = await supabase
    .from('messages')
    .select('sender, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(40);

  if (!messages || messages.length < 3) return;

  const transcript = messages.map((m: any) =>
    `${m.sender === 'user' ? 'Cliente' : 'Bot'}: ${m.content}`
  ).join('\n');

  const { callClaude } = require('./claude');
  const systemPrompt = `Sos un asistente que genera resúmenes concisos de conversaciones de atención al cliente para que el bot tenga contexto en futuras interacciones. Respondé SOLO con el resumen, sin preámbulos.`;
  const userPrompt = `Resumí en 3-5 puntos breves lo más relevante de esta conversación: qué consultó el cliente, qué se acordó o resolvió, preferencias o datos importantes (nombre, servicio preferido, etc.). Será usado como contexto en próximas conversaciones con este cliente.

Conversación:
${transcript}`;

  try {
    const { text } = await callClaude(
      [{ role: 'user', content: userPrompt }],
      systemPrompt,
      300
    );
    if (text) {
      await supabase.from('contacts').update({ summary: text }).eq('id', contactId);
      console.log(`[summary] Actualizado para contacto ${contactId}`);
    }
  } catch (err: any) {
    console.error('[updateContactSummary]', err.message);
  }
}

async function saveMessage(
  conversationId: string,
  sender: string,
  content: string,
  tokensUsed?: number
) {
  const { data, error } = await supabase
    .from('messages')
    .insert([{ conversation_id: conversationId, sender, content, tokens_used: tokensUsed }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getConversationHistory(conversationId: string) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function getBusiness(businessId: string) {
  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', businessId)
    .single();

  if (error) throw error;
  return data;
}

async function getBusinessByPhone(phone: string) {
  // Multi-tenant: rutea por phone_whatsapp. Normaliza para tolerar que el número
  // esté guardado con o sin el '+' (causa #1 de "Business not found" en el alta).
  const variants = phone.startsWith('+') ? [phone, phone.slice(1)] : [phone, '+' + phone];

  // Preferir negocio activo
  const { data: active } = await supabase
    .from('businesses')
    .select('*')
    .in('phone_whatsapp', variants)
    .eq('is_active', true)
    .limit(1);
  if (active && active.length > 0) return active[0];

  // Fallback: cualquiera con ese número (para mostrar mensaje de suspensión)
  const { data: anyBiz } = await supabase
    .from('businesses')
    .select('*')
    .in('phone_whatsapp', variants)
    .limit(1);

  return (anyBiz && anyBiz[0]) || null;
}

async function updateConversationStatus(conversationId: string, status: string) {
  const { error } = await supabase
    .from('conversations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', conversationId);
  if (error) throw error;
}

module.exports = {
  getOrCreateConversation,
  saveMessage,
  getConversationHistory,
  getBusiness,
  getBusinessByPhone,
  updateConversationStatus,
  updateContactSummary,
};
