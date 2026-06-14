-- Guards de unicidad para evitar duplicados por carreras (mensajes simultáneos).
-- Aplicado vía Supabase MCP el 2026-06-12. Archivo para paridad/documentación.
--
-- Trabaja junto al refactor de getOrCreateConversation (conversation.ts), que ante
-- un choque de carrera re-lee en vez de insertar un duplicado.

-- Un contacto único por negocio + teléfono.
create unique index if not exists uq_contacts_business_phone
  on public.contacts (business_id, phone);

-- Una sola conversación "active" por contacto a la vez (índice único parcial).
create unique index if not exists uq_conversations_active
  on public.conversations (business_id, contact_id)
  where status = 'active';
