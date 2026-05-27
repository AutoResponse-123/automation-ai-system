export {};
const { supabase } = require('../config/supabase');

async function getOrCreateConversation(
  businessId: string,
  contactPhone: string
) {
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id')
    .eq('business_id', businessId)
    .eq('phone', contactPhone)
    .single();

  let contactId: string;

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

  return { contactId, conversationId };
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
  // Busca el negocio por número de WhatsApp — permite multi-tenant
  // Normaliza el número: intenta con y sin el formato +
  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('phone_whatsapp', phone)
    .eq('is_active', true)
    .single();

  if (!error && data) return data;

  // Fallback: buscar sin importar is_active (para mostrar mensaje de suspensión)
  const { data: anyBiz } = await supabase
    .from('businesses')
    .select('*')
    .eq('phone_whatsapp', phone)
    .single();

  return anyBiz || null;
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
};
