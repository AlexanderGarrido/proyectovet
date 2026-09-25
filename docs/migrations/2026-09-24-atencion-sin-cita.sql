-- Atención sin cita: una cita creada al atender, no agendada antes.
-- Aditiva: las citas existentes quedan como 'agendada' por el valor por defecto.
-- Aplicar ANTES de desplegar el código que la usa.
DO $$ BEGIN
  CREATE TYPE public.appointment_origin AS ENUM ('agendada', 'sin_cita');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS origin public.appointment_origin NOT NULL DEFAULT 'agendada';
