-- Candado anti doble-reserva: no puede haber dos turnos 'scheduled' en el mismo
-- negocio + fecha + hora. El insert del segundo cliente que intente el mismo
-- horario falla (code 23505) y el bot ofrece otro. Aplicado vía Supabase 2026-06-24.

create unique index if not exists uq_appt_slot_scheduled
  on appointments (business_id, appointment_date, appointment_time)
  where status = 'scheduled';
