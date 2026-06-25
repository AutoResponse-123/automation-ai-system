-- Aceptación de términos y condiciones al crear la cuenta (prueba legal del consentimiento).
-- Aplicado vía Supabase el 2026-06-25; archivo para paridad/documentación.

alter table businesses add column if not exists terms_accepted_at timestamptz;
alter table businesses add column if not exists terms_version text;
