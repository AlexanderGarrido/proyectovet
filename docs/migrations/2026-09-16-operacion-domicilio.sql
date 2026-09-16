-- Migración aditiva. Aplicar antes de desplegar la nueva interfaz.
-- No elimina responsables ni historiales. Respaldar la base antes de aplicar.
BEGIN;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS started_at timestamp;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS completed_at timestamp;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS no_charge boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS visit_operations (
  user_id varchar(36) NOT NULL REFERENCES users(id),
  operation_id varchar(36) NOT NULL,
  payload_hash varchar(64) NOT NULL,
  result jsonb NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, operation_id)
);
CREATE INDEX IF NOT EXISTS idx_medical_records_appointment ON medical_records(appointment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_appointment ON invoices(appointment_id);
COMMIT;
