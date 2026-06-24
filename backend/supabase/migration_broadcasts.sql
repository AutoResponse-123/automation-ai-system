-- Difusiones masivas + menú de botones del bot.
-- Aplicado vía Supabase el 2026-06-24; este archivo queda para paridad/documentación.

-- Registro de difusiones (una fila por envío masivo).
create table if not exists broadcasts (
  id uuid default gen_random_uuid() primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  name text,
  segment text not null default 'all',      -- 'all' | 'stage:<etapa>'
  content_sid text not null,                -- plantilla aprobada (Twilio Content SID)
  variables jsonb default '{}'::jsonb,
  status text not null default 'pending',   -- pending | sending | done | failed
  total int default 0,
  sent int default 0,
  failed int default 0,
  created_at timestamptz default now()
);
create index if not exists idx_broadcasts_business on broadcasts(business_id, created_at desc);

alter table broadcasts enable row level security;
drop policy if exists "broadcasts_owner" on broadcasts;
create policy "broadcasts_owner" on broadcasts for all
  using ((business_id in (select businesses.id from businesses where businesses.user_id = (select auth.uid()))) or is_admin());

-- Content SID de la plantilla quick-reply que el bot usa para mostrar botones.
alter table businesses add column if not exists menu_content_sid text;
