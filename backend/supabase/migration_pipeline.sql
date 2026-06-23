-- Embudo de clientes (kanban estilo Kommo).
-- Cada contacto tiene una etapa que el bot avanza solo (nuevo → contactado →
-- agendó → atendió → recurrente) y el dueño puede mover a mano desde el dashboard
-- (incluida la etapa 'perdido'). Aplicado vía Supabase el 2026-06-23; este archivo
-- queda para paridad/documentación.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'nuevo';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS stage_updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_contacts_business_stage ON contacts(business_id, stage);
