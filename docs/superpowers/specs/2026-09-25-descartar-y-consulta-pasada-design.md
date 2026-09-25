# Descartar una atención sin cita y registrar consultas pasadas

Diseño y tareas, acordados el 25 de septiembre de 2026 tras probar la atención sin cita en el teléfono. Amplía `2026-09-24-atencion-sin-cita-design.md`.

## Problemas

1. **No hay cómo descartar una atención sin cita abierta por error.** El espacio de visita solo termina al cerrarla, y cerrar exige nota y cobro (o «sin costo»).
2. **«Registrar consulta pasada» usa otro formulario** (`MedicalRecordForm`), con otro aspecto y sin cobro. Además no pide fecha: guarda la consulta con la de hoy.

## Decisiones

### A. Descartar

- **Botón «Descartar atención»** en el espacio de visita, con confirmación. Solo aparece si se cumple todo esto:
  - `origin` es `sin_cita` o `pasada`;
  - el estado es `en_curso`;
  - no hay nota propia ni cobro;
  - en la cola no hay otra operación de esa visita aparte de la apertura.
- **La atención se borra por completo:** no queda como cancelada, porque ensuciaría la agenda con errores de dedo.
- **Visita local sin sincronizar (id negativo):** `discardLocalVisit` borra del dispositivo la visita, sus operaciones en cola y su borrador. Nada llega al servidor.
- **Visita ya sincronizada:**
  - `POST /api/visits/:id/discard` exige sesión, `X-Field-User` y la bandera `atencionSinCita`.
  - En una transacción con bloqueo `FOR UPDATE`, revalida el origen, que el estado no sea `completada`, que no haya `medical_records` ni facturas no anuladas, y `canAccessVisit`. Solo entonces hace `DELETE`. Las líneas de prestación y las prestaciones planificadas se borran en cascada.
  - Si alguna condición no se cumple, responde 409 con el motivo.
  - Requiere señal: sin señal, el botón explica que hace falta conexión.
- **Después de descartar:** la pantalla vuelve a Hoy (modo sin conexión) o a la ficha del paciente.

### B. Consulta pasada

- **Nuevo valor de enum** `appointment_origin = 'pasada'`, con una migración aditiva `ALTER TYPE ... ADD VALUE`.
- **Apertura:** `POST /api/visits/open` acepta `origin: 'sin_cita' | 'pasada'`, opcional y con `sin_cita` por omisión.
  - Con `pasada`, la hora debe estar al menos 1 minuto en el pasado y no antes de 2000. No se aplica el tope de 7 días.
  - `startedAt = null`: no se midió en vivo, así que no entra en el promedio de duración.
  - Sin cambios: `status = en_curso`, `endAt = inicio + 30 min`.
  - El UUID y el comprobante funcionan igual que en la apertura sin cita.
- **`save-visit`**, cuando `origin = 'pasada'`:
  - la nota clínica toma `date = visit.scheduledAt`, así se ordena bien en la cronología;
  - al cerrar **no** se cambia `endAt`.
- **Pantalla:** en la ficha, «Registrar consulta pasada» abre un diálogo con fecha y hora en horario de la clínica (`fromClinicInput`), llama a la apertura con señal y navega a `/citas/:id`.
- **Etiquetas:** «Consulta pasada» en la cabecera de la visita, la agenda y Hoy.
- **Se eliminan** `src/pages/historial/nuevo.astro`, `MedicalRecordForm.tsx`, `src/lib/offlineDraft.ts` (y su test) y `medicalRecordFormSchema`, que ya no tienen uso. `POST /api/medical` se conserva.

## Tareas

1. Migración `2026-09-25-consulta-pasada.sql` y enum en el esquema. Se aplica en Supabase y se actualiza el snapshot de Drizzle.
2. Contrato: `openVisitSchema.origin` y `checkOpenTime(occurredAt, now, origin)`. Tests.
3. `openVisit` con `origin` (`startedAt`). Tests.
4. `save-visit` con `pasada` (fecha de la nota y `endAt` sin cambios). Tests.
5. `discardVisit` en el servidor, el endpoint y sus tests.
6. `discardLocalVisit` en `field-storage`. Tests.
7. Interfaz:
   - botón de descarte en el espacio de visita;
   - diálogo de consulta pasada en la ficha;
   - `createOpener` con origen;
   - etiquetas.
8. Eliminar el formulario antiguo y lo que queda sin uso.
9. Integración contra la base real: descartar, rechazar el descarte con nota, y consulta pasada con fecha de la nota y `endAt` sin cambios.
10. Documentación, verificación completa y revisión final.
