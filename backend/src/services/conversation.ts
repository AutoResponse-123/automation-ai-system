import { supabase } from '../config/supabase';

export async function getOrCreateConversation(
  businessId: string,
  contactPhone: string
) {
  // Busca o crea contacto
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id')
    .eq('business_id', businessId)
    .eq('phone', contactPhone)
    .single();

  let contactId: string;

  if (contactError || !contact) {
    // Crear contacto nuevo
    const { data: newContact, error: createError } = await supabase
      .from('contacts')
      .insert([
        {
          business_id: businessId,
          phone: contactPhone,
          interaction_count: 1,
        },
      ])
      .select('id')
      .single();

    if (createError) throw createError;
    contactId = newContact.id;
  } else {
    contactId = contact.id;
  }

  // Busca conversación activa
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('id')
    .eq('business_id', businessId)
    .eq('contact_id', contactId)
    .eq('status', 'active')
    .single();

  let conversationId: string;

  if (convError || !conversation) {
    // Crear conversación nueva
    const { data: newConv, error: createConvError } = await supabase
      .from('conversations')
      .insert([
        {
          business_id: businessId,
          contact_id: contactId,
          status: 'active',
        },
      ])
      .select('id')
      .single();

    if (createConvError) throw createConvError;
    conversationId = newConv.id;
  } else {
    conversationId = conversation.id;
  }

  return { contactId, conversationId };
}

export async function saveMessage(
  conversationId: string,
  sender: 'user' | 'assistant',
  content: string,
  tokensUsed?: number
) {
  const { data, error } = await supabase
    .from('messages')
    .insert([
      {
        conversation_id: conversationId,
        sender,
        content,
        tokens_used: tokensUsed,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getConversationHistory(conversationId: string) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getBusiness(businessId: string) {
  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', businessId)
    .single();

  if (error) throw error;
  return data;
}