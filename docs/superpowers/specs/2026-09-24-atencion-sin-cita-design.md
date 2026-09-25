# Atención sin cita

Diseño acordado el 24 de septiembre de 2026. Es el primero de tres proyectos: atención sin cita, navegación en celular y otras mejoras. Cada uno lleva su propio diseño, plan e implementación.

## Problema

Hoy la visita completa solo existe si hay una cita. Por visita completa se entiende la nota clínica, los insumos del botiquín, el cobro y el pago, los pendientes de seguimiento y el trabajo sin conexión. Todo eso cuelga de la cita: `save-visit.ts` busca la cita por `operation.visitId`, y las facturas, el stock, los pendientes y la cronología apuntan a ella.

Para atender a un paciente sin cita solo queda «Registrar consulta» (`/historial/nuevo`, `MedicalRecordForm`). Ese formulario no emite cobro, no crea pendientes, no aparece en la jornada y no sirve en terreno sin señal.

En la atención a domicilio pasa seguido: llegas por el perro y también atiendes al gato, o te llaman y vas sin agendar.

## Requisitos

- Una atención sin cita registra lo mismo que una agendada: nota clínica, insumos del botiquín, cobro y pago.
- Funciona sin conexión, igual que la visita agendada.
- Sin señal se puede atender a **cualquier paciente activo** de la clínica, no solo a los de la jornada.
- Para esos pacientes, el teléfono muestra sin señal la identificación del paciente y su responsable, las alertas activas y las 3 últimas consultas y vacunas.
- Pueden usarlo administración y veterinarios. Recepción no, porque no escribe notas clínicas.

## Enfoque elegido

**«Atender ahora» crea por detrás una cita marcada como sin cita y reutiliza el espacio de visita completo.**

Se descartaron dos alternativas:

- **Separar visita de cita en el modelo.** Es más limpio a largo plazo, pero obliga a rehacer `save-visit`, facturas, pendientes, cronología, la copia del día y la cola sin conexión.
- **Ampliar `MedicalRecordForm` con cobro y funcionamiento sin conexión.** Duplica la lógica del espacio de visita en un segundo camino que se desviaría del original.

## 1. Experiencia de uso

### Puntos de entrada

- **Hoy (`DayPanel`):** botón «Atender sin cita» junto a «+ Agendar visita». Abre un buscador por nombre de la mascota, del responsable o por teléfono. Con señal busca en el servidor, a través de la búsqueda de pacientes que ya existe. Sin señal busca en el directorio local.
- **Ficha del paciente:** la acción principal pasa a ser «Atender ahora».
- **Modo sin conexión (`/sin-conexion`, `OfflineApp`):** el mismo «Atender sin cita», sobre el directorio local.

### Flujo

- Al elegir un paciente, se abre el espacio de visita existente (`VisitWorkspace`) directamente **en curso**, sin los pasos «ir» ni «iniciar».
- La cabecera muestra **«Sin cita»** en vez de la hora agendada, junto con las alertas y los antecedentes.
- Después de guardar, la atención aparece:
  - en la agenda, a la hora real, con la etiqueta «Sin cita»;
  - en la cronología del paciente;
  - en los cobros.

### «Registrar consulta»

Se mantiene como enlace secundario en la ficha del paciente, solo para registrar una consulta **pasada**, como una atención anotada en papel.

## 2. Datos y servidor

### Migración

La migración es aditiva: añade una columna con valor por defecto y no toca los datos existentes.

- `appointments.origin`: `varchar(20)` con restricción `CHECK (origin IN ('agendada', 'sin_cita'))`, `NOT NULL DEFAULT 'agendada'`. Las citas existentes quedan como `agendada`.
- No se crean tablas nuevas. El trigger `ensure_rls_on_new_tables` no interviene.
- El SQL queda versionado en `docs/migrations/`, que es el flujo del proyecto. Además se aplica como migración de Supabase y se actualiza el snapshot local de Drizzle.

### Operación «abrir atención»: `POST /api/visits/open`

**Entrada:**

```ts
{ id: uuid, action: 'open', patientId: number, occurredAt: ISO datetime }
```

Es un esquema aparte de `visitOperationSchema`, porque todavía no hay `visitId`. No admite `record`, `items`, `charge`, `payment` ni `noCharge`.

**Proceso, en una sola transacción:**

1. Toma el bloqueo consultivo por usuario y operación, igual que `saveVisit`.
2. Si existe un comprobante en `visit_operations` con el mismo `(userId, operationId)`:
   - con el mismo hash del payload, devuelve su resultado;
   - con otro hash, responde 409.
3. Valida:
   - el rol es `admin` o `veterinario`; si no, responde 403;
   - el paciente existe (si no, 404) y está activo (si no, 409 con el motivo);
   - `occurredAt` no está más de 10 minutos en el futuro ni más de 7 días en el pasado respecto de la hora del servidor; si no, responde 400.
4. Crea la cita:

   | Campo | Valor |
   |---|---|
   | `origin` | `'sin_cita'` |
   | `status` | `'en_curso'` |
   | `type` | `'consulta'` |
   | `patientId`, `ownerId` | paciente y su responsable actual |
   | `veterinarianId` | `user.id` |
   | `scheduledAt`, `startedAt` | `occurredAt` |
   | `endAt` | `occurredAt + 30 min` (provisional) |
   | `travelBufferMinutes` | `0` |

   `veterinarianId` es quien atiende, aunque sea un administrador: las cuentas actuales son de administración, y `canAccessVisit` ya lo permite.
5. **No valida solapamientos**, porque la atención ya ocurrió. Las citas que se creen o reprogramen después sí la cuentan como ocupada: el filtro solo excluye `cancelada` y `no_asistio`.
6. Guarda el comprobante `{ visitId, updatedAt, ... }` en `visit_operations`, con `occurredAt` y `receivedAt` por separado.
7. Devuelve el comprobante y la visita, en el mismo formato que `/api/visits/:id`.

### Cierre

En `save-visit`, cuando `action = 'complete'` y la cita es `sin_cita`, `endAt` pasa a ser la hora real de cierre. Las citas agendadas no cambian.

### Directorio en la copia del día

- `DaySnapshot` suma `directory: PatientCard[]` y `DAY_SCHEMA_VERSION` pasa a `3`. Una copia en versión 2 se lee sin directorio: el buscador sin señal informa que hay que volver a preparar la jornada, en vez de fallar.
- `PatientCard` contiene:
  - `id`, `name`, `species`, `breed`, `weight`;
  - el responsable: nombre y teléfono;
  - las alertas activas;
  - las 3 últimas consultas y las 3 últimas vacunas.
- Incluye solo pacientes activos, con un límite de `DAY_LIMITS.directory = 2000`. Si se recorta, `DayCoverage` lo declara y `CoverageNotice` lo muestra.
- El directorio solo se entrega a `admin` y `veterinario`, los roles que pueden atender sin cita. Recepción no lo recibe: no lo usaría, y así no se guardan en su teléfono datos clínicos que no puede ver.

## 3. Sincronización desde el teléfono

### Apertura sin señal

1. La visita se crea en la copia local con un **id provisorio negativo**. Los ids reales son positivos, así que no chocan, y `VisitSnapshot.id`, los borradores (`draft:${visitId}`) y la pantalla de visita siguen funcionando con un número.
2. Se encola la operación `open`.
3. Las operaciones siguientes (`save`, `complete`) se encolan con el id provisorio y `predecessorId` encadenado.
4. `queueVisit` hoy permite encadenar una segunda operación pendiente solo después de `travel` o `start`. Se amplía para aceptarla también después de `open`.

### Envío al volver la señal (`runSync`)

1. Envía `open` a `/api/visits/open` y recibe el `visitId` real.
2. Reemplaza el id provisorio por el real, en este orden:
   1. Escribe en IndexedDB la equivalencia `local:<id provisorio> → <id real>`.
   2. Reescribe con el id real las operaciones pendientes con ese `visitId`, el borrador y la visita en la copia del día. Al terminar, borra la equivalencia.
   3. Si el proceso se interrumpe, el siguiente `runSync` encuentra la equivalencia y completa el reemplazo antes de enviar nada.
3. Sigue con la cadena normal por `/api/visits/{id}/sync`. El servidor ya resuelve `expectedUpdatedAt` a partir del comprobante del predecesor. `open` guarda `updatedAt` y el `visitId` real en su comprobante, así que la validación `previous.result.visitId === visit.id` se cumple.

### Errores

| Situación | Comportamiento |
|---|---|
| `open` sin respuesta | Queda como resultado **incierto**. El reintento con el mismo UUID devuelve la misma cita; no crea otra. |
| `open` rechazada (400/403/404/409) | Queda **bloqueada** en el centro de sincronización con el motivo. Las operaciones que dependen de ella también quedan bloqueadas. El borrador se conserva. |
| La cuenta activa cambia | La sincronización se detiene, igual que hoy. |

### Con señal

Se usa el mismo camino. `open` se envía de inmediato, y con el id real se navega a `/citas/{id}`. No hay un segundo camino que mantener.

## 4. Pruebas y salida a producción

### Pruebas unitarias (Vitest)

- **Esquema de `open`:** acepta el payload válido; rechaza fechas fuera de rango y cualquier campo clínico o de cobro.
- **`/api/visits/open`:**
  - crea con `origin = sin_cita` y estado `en_curso`;
  - un reintento con el mismo UUID devuelve la misma cita;
  - el mismo UUID con otro payload devuelve 409;
  - responde 403 a recepción, 404 si el paciente no existe y 409 si está inactivo.
- **Cierre de `sin_cita`:** `endAt` pasa a la hora real.
- **Cola:**
  - orden `open → save → complete`;
  - reemplazo del id provisorio;
  - reanudación desde la equivalencia guardada;
  - bloqueo de las operaciones que dependen de un `open` rechazado.
- **Copia del día:** trae el directorio para admin y veterinario, y no para recepción; declara el recorte a 2000; una copia en v2 no falla.

### Pruebas de integración contra Postgres real

Los tests actuales simulan la base de datos. Por eso el bug de las fechas en las citas (`70277b4`) pasó seis días sin detectarse. Este proyecto agrega un grupo de integración contra Postgres real.

- **Dónde:** contra la **base de producción** (`puidzeikalabfixvzrrs`).
  - Hoy el sistema está en fase de pruebas: sus datos son de prueba y no hay pacientes reales. Se decidió así el 24-09-2026, en vez de pagar Supabase Pro para tener ramas (la organización está en el plan gratuito).
  - **Vale solo mientras no haya datos reales.** Antes de atender clientes reales, las pruebas de integración se mueven a una base aparte, como un segundo proyecto gratuito de Supabase.
- **Aislamiento:**
  - Cada test crea sus propios datos marcados `[TEST]`: responsable, paciente, producto con stock, prestación y, si hace falta, ubicación de stock. Nunca usa pacientes existentes.
  - En `afterAll` borra lo que creó, en orden de dependencias: movimientos de stock, pagos, ítems y facturas, notas, citas, comprobantes de `visit_operations`, paciente, responsable, prestación y producto.
  - Si un test se corta a la mitad, el script `npm run test:integration:limpiar` borra todo lo marcado `[TEST]`.
- **Cómo corre:**
  - Los tests leen `TEST_DATABASE_URL`, sin valor por omisión. Sin esa variable se saltan, así `npm test` y el build de Vercel nunca los ejecutan.
  - Se lanzan a mano con `npm run test:integration`.
  - Configuración propia: `vitest.integration.config.ts`.
- **Escenarios:**
  - abrir una atención y cerrarla con prestaciones, insumos y pago: la factura, el stock y los movimientos quedan correctos;
  - reintentar `open` y un `save` con respuesta perdida: nada se duplica;
  - crear una cita agendada que se solapa con una atención sin cita: responde 409.

### Salida a producción

1. **Migración** de `origin` en producción. Va **antes** del deploy, porque el código la necesita. Como es aditiva y tiene valor por defecto, el código actual la ignora sin problema.
2. **Deploy detrás de una bandera:**
   - En `features.ts` se agrega `atencionSinCita`, con la variable `PUBLIC_FEATURE_ATENCION_SIN_CITA`.
   - Con `off` se ocultan los botones y la ruta responde 404. Los datos quedan intactos.
3. **Prueba en el teléfono con una cuenta real:**
   - con señal;
   - en modo avión, con sincronización al volver la señal;
   - comprobar que la atención aparezca con «Sin cita» en la agenda, la cronología y los cobros.

## Fuera de alcance

- Crear pacientes o responsables nuevos sin señal. El alta sigue requiriendo conexión.
- Elegir el tipo de atención al abrirla: siempre es `consulta`, y el motivo va en la nota.
- Navegación en celular y las demás mejoras. Son proyectos aparte.
