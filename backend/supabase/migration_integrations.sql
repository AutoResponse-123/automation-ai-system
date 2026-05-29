-- ── Tabla de turnos/citas ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id       UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  contact_id        UUID        REFERENCES contacts(id) ON DELETE SET NULL,
  google_event_id   TEXT,
  title             TEXT        NOT NULL,
  client_name       TEXT,
  client_phone      TEXT,
  appointment_date  DATE        NOT NULL,
  appointment_time  TIME        NOT NULL,
  duration_minutes  INTEGER     DEFAULT 60,
  reminder_24h_sent BOOLEAN     DEFAULT FALSE,
  reminder_1h_sent  BOOLEAN     DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_business    ON appointments(business_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date        ON appointments(appointment_date);

-- ── Campos de integraciones en businesses ────────────────────────────────────
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS reminders_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS mp_access_token   TEXT;
