-- Migración aditiva de las fases 1 a 6 del plan de experiencia veterinaria.
--
-- No elimina ni reescribe datos existentes: solo agrega columnas con valor
-- por omisión y tablas nuevas. Las interfaces que las usan se desactivan
-- con banderas de función (ver src/lib/features.ts), nunca borrando tablas:
-- una tabla vacía se puede volver a llenar, una tabla eliminada se lleva
-- por delante lo que ya se había registrado.
--
-- Respaldar la base antes de aplicar. Probar primero contra una copia con
-- datos anteriores a la migración.
BEGIN;

-- ── Fase 2: plantillas, alertas y adendas ───────────────────────────────
CREATE TABLE IF NOT EXISTS clinical_templates (
  id serial PRIMARY KEY,
  name varchar(120) NOT NULL,
  -- Reutiliza el enum de tipos de cita, que en la base se llama
  -- literalmente "type" (ver drizzle/migrations/0000_init_pg.sql).
  "type" public."type" NOT NULL,
  sections jsonb NOT NULL,
  phrases jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  owner_user_id varchar(36) REFERENCES users(id) ON DELETE CASCADE,
  created_by varchar(36) REFERENCES users(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clinical_templates_type ON clinical_templates("type");
CREATE INDEX IF NOT EXISTS idx_clinical_templates_owner ON clinical_templates(owner_user_id);

DO $$ BEGIN
  CREATE TYPE patient_alert_category AS ENUM ('alergia', 'conducta', 'condicion', 'medicacion', 'administrativa');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS patient_alerts (
  id serial PRIMARY KEY,
  patient_id integer NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  "patient_alert_category" patient_alert_category NOT NULL,
  "text" varchar(300) NOT NULL,
  valid_until date,
  created_by varchar(36) NOT NULL REFERENCES users(id),
  resolved_at timestamp,
  resolved_by varchar(36) REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_patient_alerts_patient ON patient_alerts(patient_id);

-- Una corrección posterior al cierre es un registro nuevo que apunta al
-- anterior; la nota original nunca se reescribe.
ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS amends_record_id integer;
ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS template_id integer;
ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS template_version integer;
CREATE INDEX IF NOT EXISTS idx_mr_amends ON medical_records(amends_record_id);

-- ── Fase 3: catálogo de prestaciones ────────────────────────────────────
CREATE TABLE IF NOT EXISTS services (
  id serial PRIMARY KEY,
  code varchar(40) UNIQUE,
  name varchar(160) NOT NULL,
  description text,
  price numeric(12,2) NOT NULL,
  duration_minutes integer,
  aftercare text,
  is_package boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by varchar(36) REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_services_active ON services(is_active);

CREATE TABLE IF NOT EXISTS service_components (
  id serial PRIMARY KEY,
  service_id integer NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  product_id integer REFERENCES products(id),
  child_service_id integer REFERENCES services(id),
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  optional boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_service_components_service ON service_components(service_id);

CREATE TABLE IF NOT EXISTS visit_service_items (
  id serial PRIMARY KEY,
  appointment_id integer NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  service_id integer NOT NULL REFERENCES services(id),
  medical_record_id integer REFERENCES medical_records(id) ON DELETE SET NULL,
  invoice_id integer REFERENCES invoices(id) ON DELETE SET NULL,
  invoice_item_id integer REFERENCES invoice_items(id) ON DELETE SET NULL,
  quantity numeric(12,3) NOT NULL,
  description_snapshot varchar(255) NOT NULL,
  unit_price_snapshot numeric(12,2) NOT NULL,
  operation_id varchar(36),
  status varchar(20) NOT NULL DEFAULT 'realizada',
  reverses_item_id integer,
  created_by varchar(36) NOT NULL REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now()
);
-- Reenviar la misma operación no puede producir una segunda línea de la
-- misma prestación: es la garantía de "un tratamiento, un solo cobro".
CREATE UNIQUE INDEX IF NOT EXISTS uq_visit_service_operation ON visit_service_items(operation_id, service_id);
CREATE INDEX IF NOT EXISTS idx_visit_service_appointment ON visit_service_items(appointment_id);
CREATE INDEX IF NOT EXISTS idx_visit_service_invoice ON visit_service_items(invoice_id);

CREATE TABLE IF NOT EXISTS appointment_planned_services (
  id serial PRIMARY KEY,
  appointment_id integer NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  service_id integer NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  created_by varchar(36) REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_planned_service ON appointment_planned_services(appointment_id, service_id);

-- ── Fase 4: tiempos declarados y tiempos verificables ───────────────────
-- `occurred_at` lo afirma el dispositivo y puede venir de un reloj
-- desajustado; `received_at` lo pone el servidor. Se guardan separados
-- porque solo el segundo es comprobable.
ALTER TABLE visit_operations ADD COLUMN IF NOT EXISTS occurred_at timestamp;
ALTER TABLE visit_operations ADD COLUMN IF NOT EXISTS received_at timestamp NOT NULL DEFAULT now();

-- ── Fase 5: logística domiciliaria ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS visit_addresses (
  id serial PRIMARY KEY,
  owner_id integer NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  label varchar(80),
  address varchar(500) NOT NULL,
  access_notes text,
  sector varchar(80),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_visit_addresses_owner ON visit_addresses(owner_id);
CREATE INDEX IF NOT EXISTS idx_visit_addresses_sector ON visit_addresses(sector);

CREATE TABLE IF NOT EXISTS route_days (
  id serial PRIMARY KEY,
  veterinarian_id varchar(36) NOT NULL REFERENCES users(id),
  day date NOT NULL,
  notes text,
  created_by varchar(36) REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_route_day ON route_days(veterinarian_id, day);

CREATE TABLE IF NOT EXISTS route_stops (
  id serial PRIMARY KEY,
  route_day_id integer NOT NULL REFERENCES route_days(id) ON DELETE CASCADE,
  visit_address_id integer REFERENCES visit_addresses(id) ON DELETE SET NULL,
  address varchar(500) NOT NULL,
  sector varchar(80),
  "position" integer NOT NULL,
  travel_minutes integer NOT NULL DEFAULT 0,
  travel_fee numeric(12,2) NOT NULL DEFAULT 0,
  travel_charged_to integer,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_route_stops_day ON route_stops(route_day_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_route_stop_position ON route_stops(route_day_id, "position");

-- La cita conserva su propia dirección como fotografía: corregir un
-- domicilio guardado no debe cambiar dónde dice que se atendió antes.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS sector varchar(80);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS travel_buffer_minutes integer NOT NULL DEFAULT 0;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS route_stop_id integer;
CREATE INDEX IF NOT EXISTS idx_appt_route_stop ON appointments(route_stop_id);

-- ── Fase 6: pendientes y comunicaciones ─────────────────────────────────
DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('pendiente', 'en_curso', 'completada', 'descartada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE task_kind AS ENUM ('consulta_por_cerrar', 'resultado_por_revisar', 'seguimiento', 'cobro_pendiente', 'contacto', 'otra');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS followup_tasks (
  id serial PRIMARY KEY,
  "task_kind" task_kind NOT NULL,
  title varchar(200) NOT NULL,
  detail text,
  patient_id integer REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id integer REFERENCES appointments(id) ON DELETE SET NULL,
  assigned_to varchar(36) REFERENCES users(id),
  due_date date,
  "task_status" task_status NOT NULL DEFAULT 'pendiente',
  source_key varchar(120),
  created_by varchar(36) REFERENCES users(id),
  completed_by varchar(36) REFERENCES users(id),
  completed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
-- La clave de origen deduplica: procesar dos veces el mismo hecho (una
-- operación reenviada, una cola antigua) no puede crear dos tareas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_followup_source ON followup_tasks(source_key);
CREATE INDEX IF NOT EXISTS idx_followup_status ON followup_tasks("task_status");
CREATE INDEX IF NOT EXISTS idx_followup_assigned ON followup_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_followup_due ON followup_tasks(due_date);

DO $$ BEGIN
  CREATE TYPE communication_channel AS ENUM ('whatsapp', 'llamada', 'correo', 'presencial', 'otro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE communication_status AS ENUM ('preparado', 'enviado_manual', 'entregado', 'fallido');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS communication_events (
  id serial PRIMARY KEY,
  patient_id integer REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id integer REFERENCES appointments(id) ON DELETE SET NULL,
  task_id integer REFERENCES followup_tasks(id) ON DELETE SET NULL,
  "communication_channel" communication_channel NOT NULL,
  "communication_status" communication_status NOT NULL DEFAULT 'preparado',
  summary varchar(300),
  body text,
  created_by varchar(36) NOT NULL REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_communication_patient ON communication_events(patient_id);

COMMIT;
