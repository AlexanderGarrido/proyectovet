-- Consulta pasada: atención registrada después, con su fecha real, desde el
-- mismo espacio de visita. Aditiva. Aplicar ANTES de desplegar el código.
ALTER TYPE public.appointment_origin ADD VALUE IF NOT EXISTS 'pasada';
