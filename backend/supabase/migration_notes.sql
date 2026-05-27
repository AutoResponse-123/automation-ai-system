-- Notas internas por conversación (visibles solo en el dashboard)
CREATE TABLE IF NOT EXISTS conversation_notes (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID    NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para consultas por conversación
CREATE INDEX IF NOT EXISTS idx_notes_conversation ON conversation_notes(conversation_id);

-- RLS: solo usuarios autenticados pueden leer/escribir notas de sus negocios
ALTER TABLE conversation_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notes_select" ON conversation_notes FOR SELECT
  USING (
    conversation_id IN (
      SELECT c.id FROM conversations c
      JOIN businesses b ON b.id = c.business_id
      WHERE b.user_id = auth.uid()
    )
  );

CREATE POLICY "notes_insert" ON conversation_notes FOR INSERT
  WITH CHECK (
    conversation_id IN (
      SELECT c.id FROM conversations c
      JOIN businesses b ON b.id = c.business_id
      WHERE b.user_id = auth.uid()
    )
  );

CREATE POLICY "notes_delete" ON conversation_notes FOR DELETE
  USING (
    conversation_id IN (
      SELECT c.id FROM conversations c
      JOIN businesses b ON b.id = c.business_id
      WHERE b.user_id = auth.uid()
    )
  );
