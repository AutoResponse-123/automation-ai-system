-- Plantillas de difusión (creadas y enviadas a aprobar a Meta desde el panel).
-- Aplicado vía Supabase el 2026-06-24; archivo para paridad/documentación.

create table if not exists broadcast_templates (
  id uuid default gen_random_uuid() primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  content_sid text not null,                 -- Content SID de Twilio (HX...)
  name text not null,                        -- nombre de aprobación (lowercase)
  body text not null,                        -- cuerpo con {{1}} para el nombre
  category text not null default 'marketing',-- marketing | utility
  status text not null default 'pending',    -- pending | approved | rejected
  created_at timestamptz default now()
);
create index if not exists idx_bt_business on broadcast_templates(business_id, created_at desc);

alter table broadcast_templates enable row level security;
drop policy if exists "bt_owner" on broadcast_templates;
create policy "bt_owner" on broadcast_templates for all
  using ((business_id in (select businesses.id from businesses where businesses.user_id = (select auth.uid()))) or is_admin());
