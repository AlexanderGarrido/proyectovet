# Estado de implementación del plan de experiencia veterinaria

Fecha: 18 de septiembre de 2026. Corresponde al plan de `PLAN-MEJORAS-EXPERIENCIA-VETERINARIA.md`.

Este documento dice qué quedó construido, qué quedó fuera y qué falta comprobar antes del piloto. No afirma que las mejoras funcionen en terreno: eso solo puede decirlo el piloto.

## Qué quedó implementado

| Fase | Entregable del plan | Estado |
|---|---|---|
| 0 | Línea base, observación de recorridos y prototipo con usuarios | **No corresponde a código.** Requiere observar a personas reales; sigue pendiente. |
| 1 | Navegación, componentes y estados claros | Implementado |
| 2 | Plantillas, cabecera clínica y cronología | Implementado |
| 3 | Servicios y cobro integrado | Implementado |
| 4 | Centro de sincronización y preparación verificable | Implementado |
| 5 | Agenda territorial y varias mascotas | Implementado (sectores, paradas y traslado manual; sin proveedor de rutas, como indica el plan) |
| 6 | Seguimientos y preparación del botiquín | Implementado (sin lotes, que el plan deja como ampliación posterior) |
| 7 | Validación y entrega | Migración aditiva, banderas de función y pruebas automatizadas listas. **El piloto y las pruebas contra PostgreSQL de staging siguen pendientes.** |

### Fase 1 — experiencia base

- `MobileNavigation`: barra inferior con las cinco áreas, filtrada por permisos, con área segura de iOS y objetivos táctiles sobre 44 px.
- `SyncStatus` reemplaza el aviso de conexión. Separa tres cosas que antes se mezclaban: hay red, está guardado en el dispositivo, lo confirmó el servidor.
- `ErrorState` y `VisitStatusBadge`: «no se pudo cargar» dejó de parecerse a «no hay datos», y el estado de una cita se traduce en un solo lugar.
- Botiquín lleva al botiquín asignado si el rol es veterinario, y al inventario general en los demás casos.
- Búsqueda del encabezado: también cruza nombre y teléfono del responsable, descarta respuestas tardías y distingue el fallo de red de la ausencia de resultados.
- Todo el horario pasa por `clinic-time.ts`. El calendario, la agenda semanal y los recordatorios ya no usan el reloj del dispositivo.
- Hoy se reordenó: visita en curso o siguiente con dirección, hora, acción contextual y estado de guardado arriba; métricas al final.

### Fase 2 — atención y memoria clínica

- `VisitWorkspace` quedó reducido a composición. El borrador, la cola y las operaciones viven en `useVisitDraft`; cada sección es su propia vista.
- `clinical_templates` y `patient_alerts`, con plantillas incorporadas para control, vacunación y consulta general.
- `GET /api/patients/:id/timeline`: cronología paginada por cursor, con filtros y permisos resueltos en el servidor.
- Adendas: una visita cerrada admite una corrección trazable (`medical_records.amends_record_id`) que no reescribe el original, no mueve stock y no toca el cobro.

### Fase 3 — catálogo y cierre económico

- `services`, `service_components`, `visit_service_items` y `appointment_planned_services`.
- Formato 2 de la operación con `items`; el formato anterior (`charge`) se sigue aceptando para colas antiguas.
- El servidor resuelve precios y descuentos de stock; el cliente nunca envía importes.
- La visita y el formulario general comparten catálogo y cálculo (`src/lib/charge.ts`).

### Fase 4 — confiabilidad de terreno

- Versionado de copia diaria, borrador y operación; los borradores de la versión anterior se leen sin descartarse.
- Manifiesto de cobertura visible: qué trajo la copia y qué quedó recortado.
- Centro de sincronización con antigüedad, último intento y cuatro resultados distinguidos, incluido **resultado desconocido**.
- Coordinación entre pestañas (`BroadcastChannel` y bloqueo de envío), solicitud de almacenamiento persistente y actualización del service worker diferida hasta que la cola esté vacía.
- `occurred_at` (declarado por el dispositivo) y `received_at` (del servidor) se guardan por separado.

### Fase 5 — logística domiciliaria

- `visit_addresses`, `route_days`, `route_stops` y `appointments.route_stop_id`, más sector y colchón de traslado en la cita.
- La validación de solapamientos considera el traslado declarado.
- Vista de recorrido en la agenda: agrupar es una decisión explícita, reordenar no toca horarios, y el traslado se atribuye a una sola visita del grupo.

### Fase 6 — pendientes y botiquín

- `followup_tasks` con clave de origen única y `communication_events` con estados conservadores.
- Bandeja de pendientes en Hoy, que además muestra las atenciones iniciadas sin cerrar.
- Faltantes del botiquín calculados con existencias del servidor, separando mínimo y plan del día.

### Fase 7 — entrega

- `docs/migrations/2026-09-18-experiencia-veterinaria.sql`, aditiva.
- Banderas de función en `src/lib/features.ts` (`PUBLIC_FEATURE_*=off`) para desactivar interfaces sin borrar tablas.
- `npm run db:seed-catalog` para el catálogo mínimo, idempotente y con precios marcados como provisorios.

## Qué quedó deliberadamente fuera

- **Pago con tarjeta y cualquier integración de cobro con tarjeta asociada.** Excluido por indicación explícita; los medios de pago existentes no se ampliaron.
- Lotes y vencimiento por lote (el plan los deja como ampliación posterior al piloto).
- Proveedor de geocodificación y optimización de rutas.
- Dictado y transcripción.
- Envío automático de mensajes: solo se prepara texto y se registra lo que la persona declara haber enviado.
- Portal de tutores, aplicación nativa e IA diagnóstica, que el plan posterga.

## Defectos encontrados en revisión y corregidos

Una revisión del cambio completo encontró siete defectos reales. Se dejan anotados porque varios eran silenciosos, y esa es justamente la clase de problema que conviene recordar:

1. **La cronología perdía elementos.** Siete de las ocho fuentes filtraban con `<` estricto contra el cursor, mientras la mezcla en memoria esperaba incluir los empates. Una vacuna (anclada al mediodía UTC) y una cita de las 09:00 en horario de verano comparten instante exacto: si el corte de página caía entre ambas, la segunda desaparecía del historial sin error visible. Ahora todas las fuentes usan `<=` y el desempate lo hace el cursor. Hay prueba que reproduce el caso.
2. **El seguimiento se perdía en el flujo de dos pasos.** Las indicaciones se derivaban de la operación en curso, y al guardar primero (que emite el cobro) y cerrar después, la operación de cierre ya no traía prestaciones. Ahora se leen de lo registrado en la cita.
3. **Armar el recorrido invalidaba la cola offline.** Asignar una parada tocaba `updated_at`, así que los guardados que el veterinario tenía en cola rebotaban con 409 justo cuando no podía redescargar nada. La asignación de parada ya no altera esa marca.
4. **Recepción podía leer alergias y medicaciones.** El endpoint de alertas solo exigía `patients:read`, contradiciendo la regla de la cronología. Ahora, sin acceso clínico, solo se entregan las categorías operativas (manejo y administrativa), filtradas en el servidor.
5. **Dos líneas con la misma prestación rompían el cobro general** con un 500 por violación del índice único. Se rechaza con un mensaje que dice qué corregir.
6. **Una prestación retirada del catálogo dejaba sin cargar toda la pantalla del botiquín.** Ahora se omite, se cuenta y se declara en la vista.
7. **Marcar «sin costo» sobre una visita ya cobrada se degradaba en silencio.** Ahora se rechaza explicando por qué.

Además: un veterinario ya no puede reasignar una tarea a otra persona, una segunda nota sobre la misma cita queda enlazada como adenda, y un fallo al pedir más cronología conserva en pantalla lo ya cargado.

**Un octavo hueco, este propio de la implementación y no señalado por la revisión:** la interfaz afirmaba que una corrección posterior al cierre se guarda como adenda, pero el servidor rechazaba cualquier nota sobre una visita cerrada y la pantalla ni siquiera dejaba escribir. Era una promesa sin respaldo. Ahora existe de verdad: una visita cerrada admite exactamente una escritura clínica —la adenda— que declara a qué registro corrige, se valida contra las notas de esa misma visita, no descuenta insumos ni altera el cobro, y deja el original intacto con su propio autor y fecha.

## Qué falta comprobar antes de confiar en esto

1. **Fase 0 completa**: observar cinco recorridos reales y fijar la línea base. Sin eso no hay con qué comparar ninguna mejora.
2. Aplicar la migración sobre una copia con datos anteriores y verificar que nada se rompe.
3. Ejecutar contra PostgreSQL de staging los escenarios transaccionales: reenvío tras respuesta perdida, solicitudes simultáneas, pago parcial, stock insuficiente, producto inactivo y convivencia con la factura general.
4. Probar en los teléfonos objetivo (Android y Safari/iPhone) los puntos 9 a 24 de la verificación manual de `DOCUMENTACION.md`.
5. Revisar con el veterinario el catálogo de prestaciones y las tres plantillas antes de cobrar con ellos.
6. Medir contraste, foco y zoom. El diseño apunta a 44–48 px y texto de 16 px en formularios, pero eso es una intención, no una medición.

Las pruebas automatizadas (305 casos) cubren contratos, permisos, horario de la clínica, cola, clasificación de fallos, idempotencia, resolución de prestaciones, deduplicación de pendientes y cálculo de cobro y faltantes. Cubren lógica, no experiencia de uso.

## Atención sin cita (24 de septiembre de 2026)

Diseño en `docs/superpowers/specs/2026-09-24-atencion-sin-cita-design.md`, plan en `docs/superpowers/plans/2026-09-24-atencion-sin-cita.md`.

- «Atender ahora» (ficha) y «Atender sin cita» (Hoy y modo sin conexión) abren el espacio de atención completo sin agendar antes. Por debajo, una cita `origin = 'sin_cita'` creada por `POST /api/visits/open`, idempotente.
- Sin señal: directorio de pacientes activos en la copia del día (versión 3), visita local con número provisorio y reemplazo por el real al sincronizar, con reanudación si se corta.
- Etiqueta «Sin cita» en agenda, Hoy y centro de sincronización. «Registrar consulta» pasa a «Registrar consulta pasada».
- Bandera `PUBLIC_FEATURE_ATENCION_SIN_CITA` y migración aditiva `2026-09-24-atencion-sin-cita.sql`, ya aplicada en producción.
- Primeras pruebas de integración contra Postgres real (`npm run test:integration`): hoy apuntan a producción, que solo tiene datos de prueba.

Falta comprobar en el teléfono: atender con señal y en modo avión, sincronizar al volver la señal y confirmar que no se duplica la atención.

## Descartar atención y consulta pasada (25 de septiembre de 2026)

Tras probar la atención sin cita en el teléfono. Diseño en `docs/superpowers/specs/2026-09-25-descartar-y-consulta-pasada-design.md`.

- «Descartar atención» borra por completo una atención sin cita o consulta pasada abierta por error, mientras no tenga nota ni cobro: en el dispositivo si no llegó al servidor, o con `POST /api/visits/:id/discard`.
- «Registrar consulta pasada» usa el mismo espacio de atención, con fecha y hora elegidas (`origin = 'pasada'`, migración `2026-09-25-consulta-pasada.sql`, ya aplicada). La nota toma esa fecha.
- Se eliminó el formulario anterior (`/historial/nuevo`, `MedicalRecordForm`, `offlineDraft`).

Falta comprobar en el teléfono: descartar una atención abierta por error (con y sin señal) y registrar una consulta pasada con cobro.
