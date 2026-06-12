-- Fix bug "la configuración no persiste al recargar" + soporte recordatorios sub-hora.
-- Aplicado vía Supabase MCP el 2026-06-12. Archivo para paridad/documentación.
--
-- 1) businesses no tenía las columnas welcome_message ni type, pero el dashboard
--    (Settings.saveConfig) las mandaba en el UPDATE → Postgres rechazaba el update
--    ENTERO → no se guardaba nada y al recargar volvía todo atrás.
alter table public.businesses add column if not exists welcome_message text;
alter table public.businesses add column if not exists type text;

-- 2) Para permitir recordatorios de 30 min / 1 h, los arrays de horas pasan de
--    int4[] a numeric[] (0.5 = 30 min).
alter table public.businesses  alter column reminder_hours_before type numeric[] using reminder_hours_before::numeric[];
alter table public.appointments alter column reminders_sent       type numeric[] using reminders_sent::numeric[];
