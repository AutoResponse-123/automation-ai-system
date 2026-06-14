export {};
const { supabase } = require('../config/supabase');

async function getOrCreateConversation(
  businessId: string,
  contactPhone: string
) {
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id, summary')
    .eq('business_id', businessId)
    .eq('phone', contactPhone)
    .single();

  let contactId: string;
  let contactSummary: string | null = null;

  if (contactError || !contact) {
    const { data: newContact, error: createError } = await supabase
      .from('contacts')
      .insert([{ business_id: businessId, phone: contactPhone, interaction_count: 1 }])
      .select('id')
      .single();

    if (createError) throw createError;
    contactId = newContact.id;
  } else {
    contactId = contact.id;
    contactSummary = contact.summary || null;
  }

  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('id')
    .eq('business_id', businessId)
    .eq('contact_id', contactId)
    .eq('status', 'active')
    .single();

  let conversationId: string;

  if (convError || !conversation) {
    const { data: newConv, error: createConvError } = await supabase
      .from('conversations')
      .insert([{ business_id: businessId, contact_id: contactId, status: 'active' }])
      .select('id')
      .single();

    if (createConvError) throw createConvError;
    conversationId = newConv.id;
  } else {
    conversationId = conversation.id;
  }

  return { contactId, conversationId, contactSummary };
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
