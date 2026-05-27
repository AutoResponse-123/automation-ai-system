-- Agregar columna tags a conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- Índice para búsqueda por tag
CREATE INDEX IF NOT EXISTS idx_conversations_tags ON conversations USING GIN(tags);
