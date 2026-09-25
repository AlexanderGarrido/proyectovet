# Atención sin cita — Plan de implementación

> **Para agentes:** OBLIGATORIO: usar superpowers:subagent-driven-development (si hay subagentes) o superpowers:executing-plans para ejecutar este plan. Los pasos usan casillas (`- [ ]`) para seguir el avance.

**Objetivo:** permitir atender a cualquier paciente activo sin cita agendada, con el espacio de visita completo (nota, insumos, cobro, pago y cierre), con y sin señal.

**Arquitectura:**

- «Atender» crea por detrás una cita con `origin = 'sin_cita'` en estado `en_curso`, mediante una operación idempotente `POST /api/visits/open`. Desde ahí, `save-visit` y el resto del flujo no cambian.
- Con señal, la pantalla llama al endpoint directamente.
- Sin señal:
  - la visita nace en la copia local con un id provisorio negativo;
  - la apertura se encola y encabeza la cadena de operaciones;
  - al sincronizar, el id provisorio se reemplaza por el real.
- La copia del día trae un directorio de pacientes activos para buscar sin señal.

**Tecnologías:** Astro 5 + React, Drizzle ORM 0.45 + postgres-js sobre Supabase (Postgres 17), IndexedDB (fake-indexeddb en tests), Vitest 4, Zod.

**Diseño:** `docs/superpowers/specs/2026-09-24-atencion-sin-cita-design.md`.

## Reglas del proyecto que aplican a todas las tareas

- **Comentarios y textos en español**, con la densidad de comentarios del código que rodea el cambio.
- **Fechas en SQL crudo:** nunca interpolar un `Date` dentro de `sql```. Drizzle desactiva el serializador de fechas de postgres-js, así que hay que pasar `fecha.toISOString()`. Ver el commit `70277b4`.
- **Migraciones:**
  - el SQL versionado va en `docs/migrations/`;
  - se aplica en Supabase con una migración de Supabase;
  - `drizzle/` está en `.gitignore`: su snapshot local se actualiza, pero no se commitea;
  - las claves foráneas se nombran como Drizzle (`<tabla>_<col>_<ref>_<refcol>_fk`).
- **Tras cada tarea que toque código:**
  - `npx vitest run` y `npx astro check` (se espera `0 errors`);
  - `npx graphify hook-rebuild`, requisito del `CLAUDE.md` del usuario.
- **Commits:** un commit por tarea, en español, terminado con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **No hacer push** sin pedírselo al usuario.
- **Producción es hoy el entorno de pruebas:** solo hay datos de prueba. Aun así, las escrituras de los tests usan exclusivamente datos marcados `[TEST]`.

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `docs/migrations/2026-09-24-atencion-sin-cita.sql` | Crear | Enum `appointment_origin` y columna `appointments.origin` |
| `src/db/schema/appointments.ts` | Modificar | Declarar `origin` |
| `src/lib/features.ts` (+ `features.test.ts`) | Modificar | Bandera `atencionSinCita` |
| `src/lib/visit-types.ts` | Modificar | `OpenVisitOperation`, `QueuedOperation`, `PatientCard`, directorio, `origin` y `alerts` en la visita, `DAY_SCHEMA_VERSION = 3` |
| `src/lib/visit-operation.ts` (+ test) | Modificar | `openVisitSchema` y `checkOpenTime` |
| `src/lib/open-visit.ts` (+ test) | Crear | Transacción de apertura en el servidor |
| `src/pages/api/visits/open.ts` (+ test en `src/pages/api/__tests__/visits-open.test.ts`) | Crear | Endpoint |
| `src/lib/save-visit.ts` (+ test) | Modificar | Al cerrar una visita `sin_cita`, `endAt` pasa a la hora real |
| `src/lib/directory.ts` (+ test) | Crear | Directorio de pacientes para la copia del día |
| `src/lib/visits.ts` | Modificar | Incluir el directorio y su cobertura en `loadDay` |
| `src/lib/local-visit.ts` (+ test) | Crear | Visita local desde una tarjeta del directorio e id provisorio |
| `src/lib/field-storage.ts` (+ test) | Modificar | Encolar la apertura, enviarla, promover el id provisorio al real y reanudar la promoción |
| `src/lib/open-visit-client.ts` (+ test) | Crear | Apertura con señal, reutilizando el UUID al reintentar |
| `src/components/visits/useVisitDraft.ts` | Modificar | Tratar `open` como un eslabón encadenable; no pedir al servidor una visita con id negativo |
| `src/components/visits/VisitHeader.tsx`, `VisitWorkspace.tsx` | Modificar | Etiqueta «Sin cita»; alertas desde la copia cuando no hay señal |
| `src/components/visits/PatientPicker.tsx` | Crear | Buscador de pacientes: servidor con señal, directorio sin señal |
| `src/components/visits/DayPanel.tsx` | Modificar | Botón «Atender sin cita», etiqueta en la lista y paso del id provisorio al real |
| `src/components/visits/SyncCenter.tsx` | Modificar | Etiqueta de la apertura; no enlazar a `/citas/-N` |
| `src/components/patients/AttendNowButton.tsx` | Crear | «Atender ahora» en la ficha |
| `src/pages/pacientes/[id].astro`, `src/components/patients/PatientProfileTabs.tsx` | Modificar | Botón en la ficha y «Registrar consulta pasada» |
| `src/pages/api/appointments/index.ts`, `AppointmentList.tsx`, `AppointmentCalendar.tsx` | Modificar | Etiqueta «Sin cita» en la agenda |
| `vitest.integration.config.ts`, `tests/integration/*` | Crear | Pruebas contra Postgres real y limpieza de datos `[TEST]` |
| `package.json` | Modificar | `test:integration` y `test:integration:limpiar` |
| `docs/ESTADO-IMPLEMENTACION.md`, `DOCUMENTACION.md` | Modificar | Documentar la función y la bandera |

---

### Tarea 1: Migración y esquema de `origin`

**Archivos:**
- Crear: `docs/migrations/2026-09-24-atencion-sin-cita.sql`
- Modificar: `src/db/schema/appointments.ts`

- [ ] **Paso 1: Escribir la migración versionada**

```sql
-- Atención sin cita: una cita creada al atender, no agendada antes.
-- Aditiva: las citas existentes quedan como 'agendada' por el valor por defecto.
-- Aplicar ANTES de desplegar el código que la usa.
DO $$ BEGIN
  CREATE TYPE public.appointment_origin AS ENUM ('agendada', 'sin_cita');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS origin public.appointment_origin NOT NULL DEFAULT 'agendada';
```

- [ ] **Paso 2: Declarar la columna en el esquema**

En `src/db/schema/appointments.ts`, después de `appointmentStatusEnum`:

```ts
// Cómo nació la cita: agendada con anticipación, o creada al atender sin
// cita previa. La agenda y los reportes las distinguen con este campo.
export const appointmentOriginEnum = pgEnum('appointment_origin', ['agendada', 'sin_cita']);
```

Y dentro de `appointments`, después de `noCharge`:

```ts
  origin: appointmentOriginEnum('origin').notNull().default('agendada'),
```

- [ ] **Paso 3: Aplicar en Supabase**

Usar `apply_migration` sobre el proyecto `puidzeikalabfixvzrrs`, con nombre `atencion_sin_cita_origin` y el SQL del paso 1.

Verificar con `execute_sql`:

```sql
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'appointments' and column_name = 'origin';
```

Esperado: una fila con `USER-DEFINED` y valor por defecto `'agendada'::appointment_origin`.

- [ ] **Paso 4: Sincronizar el snapshot local de Drizzle (no se commitea)**

Ejecutar `npx drizzle-kit generate --name atencion_sin_cita_origin`.

Anteponer al `.sql` generado:

```sql
-- YA APLICADA en produccion (migracion Supabase atencion_sin_cita_origin). NO EJECUTAR.
```

Después, `npx drizzle-kit generate` debe responder `No schema changes, nothing to migrate`.

- [ ] **Paso 5: Verificar y commitear**

Ejecutar `npx vitest run` (todo en verde) y `npx astro check` (`0 errors`).

```bash
git add docs/migrations/2026-09-24-atencion-sin-cita.sql src/db/schema/appointments.ts
git commit -m "feat: columna origin en citas para distinguir atenciones sin cita"
```

---

### Tarea 2: Bandera de función

**Archivos:**
- Modificar: `src/lib/features.ts`
- Test: `src/lib/features.test.ts`

- [ ] **Paso 1: Test que falla**

En `src/lib/features.test.ts`, dentro de `describe('Banderas de función')`:
- sumar `'atencionSinCita'` al arreglo del test «todo viene activado por omisión»;
- agregar este test:

```ts
  it('la atención sin cita se apaga con PUBLIC_FEATURE_ATENCION_SIN_CITA=off', () => {
    vi.stubEnv('PUBLIC_FEATURE_ATENCION_SIN_CITA', 'off');
    expect(isEnabled('atencionSinCita')).toBe(false);
    expect(isEnabled('cronologia')).toBe(true);
  });
```

- [ ] **Paso 2: Comprobar que falla**

Ejecutar `npx vitest run src/lib/features.test.ts`.

Esperado: FAIL, porque `ENV_KEYS['atencionSinCita']` no existe: `read(undefined)` devuelve `undefined` y la función queda encendida.

- [ ] **Paso 3: Implementar**

En `src/lib/features.ts`:
- Sumar `| 'atencionSinCita'` a `FeatureName`.
- Sumar `atencionSinCita: 'PUBLIC_FEATURE_ATENCION_SIN_CITA',` a `ENV_KEYS`.
- Sumar a `features`:

```ts
  get atencionSinCita() { return isEnabled('atencionSinCita'); },
```

- [ ] **Paso 4: Comprobar que pasa**

Ejecutar `npx vitest run src/lib/features.test.ts`. Esperado: PASS.

- [ ] **Paso 5: Commit**

```bash
git add src/lib/features.ts src/lib/features.test.ts
git commit -m "feat: bandera de funcion para la atencion sin cita"
```

---

### Tarea 3: Contrato de la apertura

**Archivos:**
- Modificar: `src/lib/visit-types.ts`, `src/lib/visit-operation.ts`
- Test: `src/lib/visit-operation.test.ts`

- [ ] **Paso 1: Tipos**

En `src/lib/visit-types.ts`, después de `VisitOperation`:

```ts
/**
 * Apertura de una atención sin cita. Todavía no hay número de cita: en la
 * cola del dispositivo `visitId` es el id provisorio (negativo) de la
 * visita local, y lo que viaja al servidor es solo paciente y hora.
 */
export interface OpenVisitOperation {
  id: string;
  action: 'open';
  visitId: number;
  patientId: number;
  occurredAt: string;
  predecessorId?: undefined;
}
/** Lo que puede haber en la cola del dispositivo. */
export type QueuedOperation = VisitOperation | OpenVisitOperation;
```

En `VisitSnapshot`, después de `noCharge?: boolean;`:

```ts
  /** 'sin_cita' si la cita se creó al atender. Ausente en copias antiguas. */
  origin?: 'agendada' | 'sin_cita';
  /** Solo en visitas locales creadas sin señal: alertas traídas en la copia. */
  alerts?: { id: number; category: string; text: string; validUntil: string | null }[];
```

- [ ] **Paso 2: Tests que fallan**

Agregar al final de `src/lib/visit-operation.test.ts`, que ya existe. Sumar `checkOpenTime`, `openVisitSchema` y `VisitError` a su `import` desde `./visit-operation`, y agregar las constantes y los `describe`:

```ts

const base = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', patientId: 5, occurredAt: '2026-09-24T14:50:00.000Z' };
const now = new Date('2026-09-24T15:00:00.000Z');

describe('openVisitSchema', () => {
  it('acepta paciente y hora', () => {
    expect(openVisitSchema.safeParse(base).success).toBe(true);
  });
  it.each(['record', 'items', 'charge', 'payment', 'noCharge', 'visitId'])('rechaza el campo %s: abrir no registra nada más', (field) => {
    expect(openVisitSchema.safeParse({ ...base, [field]: 1 }).success).toBe(false);
  });
});

describe('checkOpenTime', () => {
  it('acepta hasta 10 minutos en el futuro y hasta 7 días atrás', () => {
    expect(() => checkOpenTime('2026-09-24T15:10:00.000Z', now)).not.toThrow();
    expect(() => checkOpenTime('2026-09-17T15:00:00.000Z', now)).not.toThrow();
  });
  it('rechaza una hora futura: indicaría un reloj mal puesto', () => {
    expect(() => checkOpenTime('2026-09-24T15:11:00.000Z', now)).toThrow(VisitError);
  });
  it('rechaza más de 7 días atrás: corresponde a una consulta pasada', () => {
    expect(() => checkOpenTime('2026-09-17T14:59:00.000Z', now)).toThrow(/7 días/);
  });
});
```

- [ ] **Paso 3: Comprobar que fallan**

Ejecutar `npx vitest run src/lib/visit-operation.test.ts`.

Esperado: FAIL, porque `openVisitSchema` y `checkOpenTime` no existen.

- [ ] **Paso 4: Implementar**

En `src/lib/visit-operation.ts`, después de la clase `VisitError`:

```ts
/**
 * Apertura de una atención sin cita. Solo trae paciente y hora: la nota,
 * los insumos y el cobro viajan después, en las operaciones de siempre,
 * para que haya un único camino que valide y descuente.
 */
export const openVisitSchema = z.object({
  id: z.string().uuid(),
  patientId: z.number().int().positive(),
  occurredAt: z.string().datetime(),
}).strict();
export type OpenVisitInput = z.infer<typeof openVisitSchema>;

const OPEN_FUTURE_MS = 10 * 60 * 1000;
const OPEN_PAST_MS = 7 * 24 * 60 * 60 * 1000;

/** La hora la declara el teléfono: se acota para no aceptar un reloj desajustado. */
export function checkOpenTime(occurredAt: string, now = new Date()) {
  const at = Date.parse(occurredAt);
  if (at - now.getTime() > OPEN_FUTURE_MS) throw new VisitError(400, 'La hora de inicio está en el futuro. Revisa la hora del teléfono.');
  if (now.getTime() - at > OPEN_PAST_MS) throw new VisitError(400, 'La atención tiene más de 7 días. Regístrala como consulta pasada desde la ficha del paciente.');
}
```

Nota: `.strict()` hace que `visitId` también se rechace, como pide el test.

- [ ] **Paso 5: Comprobar que pasan**

Ejecutar `npx vitest run src/lib/visit-operation.test.ts`. Esperado: PASS.

- [ ] **Paso 6: Commit**

```bash
git add src/lib/visit-types.ts src/lib/visit-operation.ts src/lib/visit-operation.test.ts
git commit -m "feat: contrato de apertura de atencion sin cita"
```

---

### Tarea 4: Apertura en el servidor (`openVisit`)

**Archivos:**
- Crear: `src/lib/open-visit.ts`
- Test: `src/lib/open-visit.test.ts`

- [ ] **Paso 1: Tests que fallan**

Crear `src/lib/open-visit.test.ts`:

```ts
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appointments } from '../db/schema/appointments';
import { visitOperations } from '../db/schema/visit-operations';

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock('../db', () => ({ db: { transaction: mocks.transaction } }));
import { openVisit } from './open-visit';

const vet = { id: 'vet-1', name: 'Vet', role: 'veterinario' };
const now = new Date('2026-09-24T15:00:00.000Z');
const input = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', patientId: 5, occurredAt: '2026-09-24T14:50:00.000Z' };
const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');

// Las lecturas se entregan en orden: comprobante previo, paciente.
function transaction(reads: unknown[][]) {
  const inserts: { table: unknown; value: any }[] = [];
  const chain = (result: () => unknown): any => {
    const q: any = {};
    for (const m of ['where', 'for', 'limit', 'returning']) q[m] = () => q;
    q.then = (res: any, rej: any) => Promise.resolve().then(result).then(res, rej);
    return q;
  };
  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn(() => ({ from: () => chain(() => reads.shift() ?? []) })),
    insert: vi.fn((table) => ({ values: (value: any) => chain(() => { inserts.push({ table, value }); return [{ id: 41 }]; }) })),
  };
  mocks.transaction.mockImplementation(async (cb) => cb(tx));
  return { tx, inserts };
}

beforeEach(() => vi.clearAllMocks());

describe('openVisit', () => {
  it('crea una cita sin_cita en curso con la hora declarada', async () => {
    const { inserts } = transaction([[], [{ id: 5, ownerId: 9, isActive: true }]]);
    const result = await openVisit(vet, input, now);
    const appt = inserts.find((i) => i.table === appointments)!.value;
    expect(appt).toMatchObject({ patientId: 5, ownerId: 9, veterinarianId: 'vet-1', origin: 'sin_cita', status: 'en_curso', type: 'consulta', travelBufferMinutes: 0 });
    expect(appt.scheduledAt.toISOString()).toBe(input.occurredAt);
    expect(appt.startedAt.toISOString()).toBe(input.occurredAt);
    expect(appt.endAt.toISOString()).toBe('2026-09-24T15:20:00.000Z');
    expect(result).toMatchObject({ visitId: 41, recordId: null, invoiceId: null, status: 'en_curso', updatedAt: appt.updatedAt.toISOString() });
    expect(inserts.find((i) => i.table === visitOperations)!.value).toMatchObject({ userId: 'vet-1', operationId: input.id, payloadHash: hash, result });
  });

  it('un reintento con el mismo id devuelve el comprobante sin crear otra cita', async () => {
    const previous = { visitId: 41, recordId: null, invoiceId: null, status: 'en_curso', updatedAt: now.toISOString() };
    const { inserts } = transaction([[{ payloadHash: hash, result: previous }]]);
    await expect(openVisit(vet, input, now)).resolves.toEqual(previous);
    expect(inserts).toEqual([]);
  });

  it('el mismo id con otros datos es un conflicto', async () => {
    transaction([[{ payloadHash: 'otro', result: {} }]]);
    await expect(openVisit(vet, input, now)).rejects.toMatchObject({ status: 409 });
  });

  it('recepción no puede abrir una atención', async () => {
    await expect(openVisit({ ...vet, role: 'recepcionista' }, input, now)).rejects.toMatchObject({ status: 403 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('administración sí puede, y queda como quien atiende', async () => {
    const { inserts } = transaction([[], [{ id: 5, ownerId: 9, isActive: true }]]);
    await openVisit({ ...vet, id: 'admin-1', role: 'admin' }, input, now);
    expect(inserts.find((i) => i.table === appointments)!.value.veterinarianId).toBe('admin-1');
  });

  it.each([
    [[], 404],
    [[{ id: 5, ownerId: 9, isActive: false }], 409],
  ] as const)('rechaza un paciente inexistente o inactivo (%j)', async (patient, status) => {
    const { inserts } = transaction([[], [...patient]]);
    await expect(openVisit(vet, input, now)).rejects.toMatchObject({ status });
    expect(inserts).toEqual([]);
  });

  it('rechaza una hora fuera de rango antes de crear nada', async () => {
    const { inserts } = transaction([[]]);
    await expect(openVisit(vet, { ...input, occurredAt: '2026-09-24T16:00:00.000Z' }, now)).rejects.toMatchObject({ status: 400 });
    expect(inserts).toEqual([]);
  });
});
```

- [ ] **Paso 2: Comprobar que fallan**

Ejecutar `npx vitest run src/lib/open-visit.test.ts`. Esperado: FAIL, porque no existe el módulo `./open-visit`.

- [ ] **Paso 3: Implementar**

Crear `src/lib/open-visit.ts`:

```ts
import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { appointments } from '../db/schema/appointments';
import { patients } from '../db/schema/patients';
import { visitOperations } from '../db/schema/visit-operations';
import { checkOpenTime, VisitError, type OpenVisitInput } from './visit-operation';
import type { VisitUser } from './visits';
import type { VisitResult } from './visit-types';

const PROVISIONAL_MINUTES = 30;

/**
 * Abre una atención sin cita: crea la cita en curso a la hora declarada y
 * guarda el comprobante con el mismo mecanismo que `saveVisit`. Un
 * reintento con el mismo id —típico tras una respuesta perdida en terreno—
 * devuelve la cita ya creada en vez de duplicarla.
 *
 * No valida solapamientos: la atención ya ocurrió. Las citas que se agenden
 * después sí la cuentan como tiempo ocupado.
 */
export async function openVisit(user: VisitUser, input: OpenVisitInput, now = new Date()): Promise<VisitResult> {
  if (!['admin', 'veterinario'].includes(user.role)) throw new VisitError(403, 'Solo administración o un veterinario pueden atender sin cita.');
  const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${user.id + ':' + input.id}, 0))`);
    const [receipt] = await tx.select().from(visitOperations)
      .where(and(eq(visitOperations.userId, user.id), eq(visitOperations.operationId, input.id)));
    if (receipt) {
      if (receipt.payloadHash !== hash) throw new VisitError(409, 'El identificador de guardado ya se utilizó con otros datos.');
      return receipt.result;
    }
    // La hora se valida después del comprobante: un reintento legítimo de
    // hace más de siete días debe recibir su cita, no un rechazo.
    checkOpenTime(input.occurredAt, now);
    const [patient] = await tx.select({ id: patients.id, ownerId: patients.ownerId, isActive: patients.isActive })
      .from(patients).where(eq(patients.id, input.patientId));
    if (!patient) throw new VisitError(404, 'Paciente no encontrado.');
    if (!patient.isActive) throw new VisitError(409, 'El paciente está inactivo. Reactívalo en su ficha antes de atenderlo.');

    const start = new Date(input.occurredAt);
    // updatedAt explícito: la siguiente operación de la cadena se valida
    // contra este valor exacto, guardado en el comprobante.
    const updatedAt = new Date(now.getTime());
    const [visit] = await tx.insert(appointments).values({
      patientId: patient.id, ownerId: patient.ownerId, veterinarianId: user.id,
      scheduledAt: start, startedAt: start, endAt: new Date(start.getTime() + PROVISIONAL_MINUTES * 60_000),
      type: 'consulta', status: 'en_curso', origin: 'sin_cita', travelBufferMinutes: 0, updatedAt,
    }).returning({ id: appointments.id });

    const receivedAt = new Date();
    const result: VisitResult = {
      visitId: visit.id, recordId: null, invoiceId: null, status: 'en_curso',
      updatedAt: updatedAt.toISOString(), receivedAt: receivedAt.toISOString(),
    };
    await tx.insert(visitOperations).values({ userId: user.id, operationId: input.id, payloadHash: hash, result, occurredAt: start, receivedAt });
    return result;
  });
}
```

- [ ] **Paso 4: Comprobar que pasan**

Ejecutar `npx vitest run src/lib/open-visit.test.ts`. Esperado: PASS, 8 tests.

- [ ] **Paso 5: Commit**

```bash
git add src/lib/open-visit.ts src/lib/open-visit.test.ts
git commit -m "feat: apertura idempotente de atencion sin cita en el servidor"
```

---

### Tarea 5: Endpoint `POST /api/visits/open`

**Archivos:**
- Crear: `src/pages/api/visits/open.ts`
- Test: `src/pages/api/__tests__/visits-open.test.ts`

- [ ] **Paso 1: Tests que fallan**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ openVisit: vi.fn(), enabled: true }));
vi.mock('../../../lib/open-visit', () => ({ openVisit: mocks.openVisit }));
vi.mock('../../../lib/features', () => ({ features: { get atencionSinCita() { return mocks.enabled; } } }));
import { POST } from '../visits/open';
import { VisitError } from '../../../lib/visit-operation';

const body = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', patientId: 5, occurredAt: new Date().toISOString() };
const call = (user: any = { id: 'vet-1', role: 'veterinario' }, payload: unknown = body, fieldUser = user?.id) => POST({
  locals: { user },
  request: new Request('http://localhost/api/visits/open', {
    method: 'POST', body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json', ...(fieldUser ? { 'X-Field-User': fieldUser } : {}) },
  }),
} as any);

beforeEach(() => { vi.clearAllMocks(); mocks.enabled = true; });

describe('POST /api/visits/open', () => {
  it('abre y devuelve el comprobante', async () => {
    mocks.openVisit.mockResolvedValue({ visitId: 41, status: 'en_curso' });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ visitId: 41 });
    expect(mocks.openVisit).toHaveBeenCalledWith(expect.objectContaining({ id: 'vet-1' }), body);
  });
  it('con la bandera apagada responde 404', async () => {
    mocks.enabled = false;
    expect((await call()).status).toBe(404);
    expect(mocks.openVisit).not.toHaveBeenCalled();
  });
  it('exige sesión y la misma cuenta del dispositivo', async () => {
    expect((await call(null)).status).toBe(401);
    expect((await call(undefined, body, 'otra-cuenta')).status).toBe(401);
  });
  it('rechaza campos de más', async () => {
    expect((await call(undefined, { ...body, record: { reason: 'x' } })).status).toBe(400);
  });
  it('traduce VisitError a su código', async () => {
    mocks.openVisit.mockRejectedValue(new VisitError(409, 'inactivo'));
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('inactivo');
  });
  it('un error inesperado es 503: el teléfono conserva la operación', async () => {
    mocks.openVisit.mockRejectedValue(new Error('db caída'));
    expect((await call()).status).toBe(503);
  });
});
```

- [ ] **Paso 2: Comprobar que fallan**

Ejecutar `npx vitest run src/pages/api/__tests__/visits-open.test.ts`. Esperado: FAIL, porque no existe el módulo `../visits/open`.

- [ ] **Paso 3: Implementar**

Crear `src/pages/api/visits/open.ts`, siguiendo `src/pages/api/visits/[id]/sync.ts`:

```ts
import type { APIRoute } from 'astro';
import { jsonError, jsonOk } from '../../../lib/http';
import { parseJsonBody, zodError } from '../../../lib/schemas';
import { openVisitSchema, VisitError } from '../../../lib/visit-operation';
import { openVisit } from '../../../lib/open-visit';
import { features } from '../../../lib/features';

export const POST: APIRoute = async ({ locals, request }) => {
  if (!features.atencionSinCita) return jsonError(404, 'No encontrado');
  const user = locals.user;
  if (!user) return jsonError(401, 'Tu sesión venció. Inicia sesión para sincronizar.');
  if (request.headers.get('X-Field-User') !== user.id) return jsonError(401, 'Esta operación pertenece a otra sesión. Inicia sesión con la cuenta que la registró.');
  const body = await parseJsonBody(request);
  if ('error' in body) return body.error;
  const parsed = openVisitSchema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);
  try { return jsonOk(await openVisit(user, parsed.data)); }
  catch (error) {
    if (error instanceof VisitError) return jsonError(error.status, error.message);
    console.error('No se pudo abrir la atención', error instanceof Error ? error.name : 'Error desconocido');
    return jsonError(503, 'No se pudo confirmar la apertura. Conserva la operación pendiente y vuelve a sincronizar.');
  }
};
```

- [ ] **Paso 4: Comprobar que pasan**

Ejecutar `npx vitest run src/pages/api/__tests__/visits-open.test.ts`. Esperado: PASS. `zodError` responde 400.

- [ ] **Paso 5: Commit**

```bash
git add src/pages/api/visits/open.ts src/pages/api/__tests__/visits-open.test.ts
git commit -m "feat: endpoint para abrir una atencion sin cita"
```

---

### Tarea 6: El cierre de una atención sin cita fija la hora real de fin

**Archivos:**
- Modificar: `src/lib/save-visit.ts` (bloque `tx.update(appointments).set({...})`, cerca de la línea 150)
- Test: `src/lib/save-visit.test.ts`

- [ ] **Paso 1: Tests que fallan**

Agregar al final del archivo. Usan el helper `transaction` y las constantes `user`, `visit` y `operation` que ya existen. La secuencia de lecturas es la del test «conserva el seguimiento cuando el cierre llega después del cobro»:

```ts
describe('cierre de una atención sin cita', () => {
  const invoice = { id: 4, total: '18000.00', status: 'pagada' };
  const reads = (extra: object) => [[{ ...visit, ...extra }], [], [{ id: 3 }], [invoice], [{ amount: '18000.00' }], []];

  it('sin_cita: endAt pasa a la hora real del cierre', async () => {
    const state = transaction(reads({ origin: 'sin_cita', scheduledAt: new Date('2026-09-16T11:00:00.000Z') }));
    const before = Date.now();
    await saveVisit(user, operation({ action: 'complete' }));
    const update = state.committed.find((w) => w.table === appointments && w.kind === 'update')!.value;
    expect(update.endAt).toBeInstanceOf(Date);
    expect(update.endAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('agendada: endAt no se toca', async () => {
    const state = transaction(reads({ origin: 'agendada' }));
    await saveVisit(user, operation({ action: 'complete' }));
    const update = state.committed.find((w) => w.table === appointments && w.kind === 'update')!.value;
    expect(update).not.toHaveProperty('endAt');
  });
});
```

- [ ] **Paso 2: Comprobar que fallan**

Ejecutar `npx vitest run src/lib/save-visit.test.ts`. Esperado: el primer test nuevo FALLA porque `update.endAt` es `undefined`.

- [ ] **Paso 3: Implementar**

En `src/lib/save-visit.ts`, dentro del `.set({...})` de `appointments`, después de la línea de `completedAt`:

```ts
      // La atención sin cita nació con un fin provisorio: al cerrarla, la
      // agenda debe mostrar lo que realmente duró. Nunca antes del inicio
      // más un minuto, aunque el reloj del teléfono haya ido adelantado.
      ...(operation.action === 'complete' && visit.origin === 'sin_cita'
        ? { endAt: new Date(Math.max(Date.now(), new Date(visit.scheduledAt).getTime() + 60_000)) }
        : {}),
```

- [ ] **Paso 4: Comprobar que pasan**

Ejecutar `npx vitest run src/lib/save-visit.test.ts`. Esperado: PASS, incluidos los tests anteriores.

- [ ] **Paso 5: Commit**

```bash
git add src/lib/save-visit.ts src/lib/save-visit.test.ts
git commit -m "feat: el cierre de una atencion sin cita registra su hora real de fin"
```

---

### Tarea 7: Directorio de pacientes en la copia del día

**Archivos:**
- Modificar: `src/lib/visit-types.ts`
- Crear: `src/lib/directory.ts`
- Test: `src/lib/directory.test.ts`
- Modificar: `src/lib/visits.ts`

- [ ] **Paso 1: Tipos y límites**

En `src/lib/visit-types.ts`:
- `DAY_LIMITS` suma `directory: 2000, directoryRecords: 3`.
- `DAY_SCHEMA_VERSION = 3`.
- Agregar:

```ts
/**
 * Paciente del directorio que viaja en la copia del día, para poder atender
 * sin cita y sin señal. Trae lo justo para atender con seguridad —quién es,
 * de quién es, a qué es alérgico y cómo le fue las últimas veces—, no el
 * historial completo.
 */
export interface PatientCard {
  id: number; name: string; species: string; breed: string | null; weight: string | null; notes: string | null;
  ownerId: number;
  owner: { firstName: string; lastName: string; phone: string | null; address: string | null };
  alerts: { id: number; category: string; text: string; validUntil: string | null }[];
  records: VisitRecord[];
  vaccines: { name: string; applicationDate: string; nextDoseDate: string | null }[];
}
```

En `DayCoverage` agregar:

```ts
  /** Pacientes del directorio; ausente si el rol no lo recibe. */
  directory?: number;
  directoryTruncated?: boolean;
```

En `DaySnapshot` agregar `directory?: PatientCard[];`.

- [ ] **Paso 2: Tests que fallan (armado de tarjetas, función pura)**

Crear `src/lib/directory.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('../db', () => ({ db: {} }));
import { buildPatientCards } from './directory';

const patient = (id: number) => ({ id, name: `P${id}`, species: 'perro', breed: null, weight: '10.00', notes: null, ownerId: 100 + id, firstName: 'Ana', lastName: 'Rojas', phone: '+569', address: 'Calle 1' });

describe('buildPatientCards', () => {
  it('agrupa alertas, las 3 últimas consultas y las 3 últimas vacunas por paciente', () => {
    const records = [1, 2, 3, 4].map((n) => ({ id: n, patientId: 1, appointmentId: null, date: `2026-09-0${n}T10:00:00.000Z`, reason: `C${n}`, subjective: null, diagnosis: null, treatment: null, observations: null, vitalSigns: null }));
    const vaccines = [1, 2, 3, 4].map((n) => ({ patientId: 1, name: `V${n}`, applicationDate: `2026-08-0${n}`, nextDoseDate: null }));
    const cards = buildPatientCards([patient(1), patient(2)], [{ id: 9, patientId: 1, category: 'alergia', text: 'Penicilina', validUntil: null }], records, vaccines);
    expect(cards[0].owner).toEqual({ firstName: 'Ana', lastName: 'Rojas', phone: '+569', address: 'Calle 1' });
    expect(cards[0].alerts).toEqual([{ id: 9, category: 'alergia', text: 'Penicilina', validUntil: null }]);
    expect(cards[0].records.map((r) => r.reason)).toEqual(['C4', 'C3', 'C2']);
    expect(cards[0].vaccines.map((v) => v.name)).toEqual(['V4', 'V3', 'V2']);
    expect(cards[1]).toMatchObject({ id: 2, alerts: [], records: [], vaccines: [] });
  });
});
```

- [ ] **Paso 3: Comprobar que fallan**

Ejecutar `npx vitest run src/lib/directory.test.ts`. Esperado: FAIL, porque no existe el módulo.

- [ ] **Paso 4: Implementar**

Crear `src/lib/directory.ts`:

```ts
import { and, asc, eq, gte, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { patients, owners } from '../db/schema/patients';
import { patientAlerts } from '../db/schema/clinical';
import { medicalRecords, vaccines } from '../db/schema/medical';
import { clinicDay } from './clinic-time';
import { DAY_LIMITS, type PatientCard, type VisitRecord } from './visit-types';

type PatientRow = { id: number; name: string; species: string; breed: string | null; weight: string | null; notes: string | null; ownerId: number; firstName: string; lastName: string; phone: string | null; address: string | null };
type AlertRow = { id: number; patientId: number; category: string; text: string; validUntil: string | null };
type VaccineRow = { patientId: number; name: string; applicationDate: string; nextDoseDate: string | null };

const newestFirst = <T>(rows: T[], key: (row: T) => string) => [...rows].sort((a, b) => key(b).localeCompare(key(a)));

/** Arma las tarjetas a partir de filas ya leídas. Pura, para poder probarla sin base. */
export function buildPatientCards(rows: PatientRow[], alerts: AlertRow[], records: VisitRecord[], vaccineRows: VaccineRow[]): PatientCard[] {
  const limit = DAY_LIMITS.directoryRecords;
  return rows.map((p) => ({
    id: p.id, name: p.name, species: p.species, breed: p.breed, weight: p.weight, notes: p.notes, ownerId: p.ownerId,
    owner: { firstName: p.firstName, lastName: p.lastName, phone: p.phone, address: p.address },
    alerts: alerts.filter((a) => a.patientId === p.id).map(({ id, category, text, validUntil }) => ({ id, category, text, validUntil })),
    records: newestFirst(records.filter((r) => r.patientId === p.id), (r) => String(r.date)).slice(0, limit),
    vaccines: newestFirst(vaccineRows.filter((v) => v.patientId === p.id), (v) => v.applicationDate).slice(0, limit)
      .map(({ name, applicationDate, nextDoseDate }) => ({ name, applicationDate, nextDoseDate })),
  }));
}

/**
 * Directorio de pacientes activos para atender sin cita y sin señal. Las
 * consultas y vacunas se limitan en la base con row_number(): traer todo el
 * historial de la clínica para quedarse con tres por paciente sería leer
 * cientos de veces más de lo necesario.
 */
export async function loadDirectory(): Promise<{ cards: PatientCard[]; truncated: boolean }> {
  const limit = DAY_LIMITS.directory;
  const rows = await db.select({
    id: patients.id, name: patients.name, species: patients.species, breed: patients.breed, weight: patients.weight, notes: patients.notes,
    ownerId: patients.ownerId, firstName: owners.firstName, lastName: owners.lastName, phone: owners.phone, address: owners.address,
  }).from(patients).innerJoin(owners, eq(patients.ownerId, owners.id))
    .where(eq(patients.isActive, true)).orderBy(asc(patients.name)).limit(limit + 1);
  const truncated = rows.length > limit;
  const kept = rows.slice(0, limit);
  if (!kept.length) return { cards: [], truncated };

  const rankedRecords = db.select({
    id: medicalRecords.id, appointmentId: medicalRecords.appointmentId, patientId: medicalRecords.patientId, date: medicalRecords.date,
    reason: medicalRecords.reason, subjective: medicalRecords.subjective, diagnosis: medicalRecords.diagnosis,
    treatment: medicalRecords.treatment, observations: medicalRecords.observations, vitalSigns: medicalRecords.vitalSigns,
    rank: sql<number>`row_number() over (partition by ${medicalRecords.patientId} order by ${medicalRecords.date} desc)`.as('rank'),
  }).from(medicalRecords).as('ranked_records');
  const rankedVaccines = db.select({
    patientId: vaccines.patientId, name: vaccines.name, applicationDate: vaccines.applicationDate, nextDoseDate: vaccines.nextDoseDate,
    rank: sql<number>`row_number() over (partition by ${vaccines.patientId} order by ${vaccines.applicationDate} desc)`.as('rank'),
  }).from(vaccines).as('ranked_vaccines');

  const today = clinicDay();
  const [alerts, records, vaccineRows] = await Promise.all([
    db.select({ id: patientAlerts.id, patientId: patientAlerts.patientId, category: patientAlerts.category, text: patientAlerts.text, validUntil: patientAlerts.validUntil })
      .from(patientAlerts)
      .where(and(isNull(patientAlerts.resolvedAt), or(isNull(patientAlerts.validUntil), gte(patientAlerts.validUntil, today)))),
    db.select().from(rankedRecords).where(sql`${rankedRecords.rank} <= ${DAY_LIMITS.directoryRecords}`),
    db.select().from(rankedVaccines).where(sql`${rankedVaccines.rank} <= ${DAY_LIMITS.directoryRecords}`),
  ]);
  const ids = new Set(kept.map((p) => p.id));
  const cards = buildPatientCards(
    kept,
    alerts.filter((a) => ids.has(a.patientId)),
    // JSON.parse(JSON.stringify(...)) en loadDay convierte las fechas a texto,
    // igual que el resto de la copia.
    records.filter((r) => ids.has(r.patientId)).map(({ rank, ...r }) => ({ ...r, date: r.date.toISOString() })) as VisitRecord[],
    vaccineRows.filter((v) => ids.has(v.patientId)).map(({ rank, ...v }) => v),
  );
  return { cards, truncated };
}
```

Si `gte(patientAlerts.validUntil, today)` da error de tipos con la columna `date`, usar ``sql`${patientAlerts.validUntil} >= ${today}` ``. `today` es un string, no un `Date`, así que no aplica la regla de las fechas crudas.

- [ ] **Paso 5: Incluir el directorio en `loadDay`**

En `src/lib/visits.ts`:
- importar `loadDirectory` desde `./directory` y `features` desde `./features`;
- calcular el directorio antes de armar `coverage`;
- sumar el directorio a `coverage` y al objeto devuelto.

```ts
  // Solo la jornada completa lo trae (no la lectura de una visita suelta), y
  // solo los roles que pueden atender sin cita.
  const directory = !visitId && canReadClinical && features.atencionSinCita ? await loadDirectory() : null;
```

En `coverage`:

```ts
    ...(directory ? { directory: directory.cards.length, directoryTruncated: directory.truncated } : {}),
```

En el objeto de `JSON.parse(JSON.stringify({...}))`:

```ts
    ...(directory ? { directory: directory.cards } : {}),
```

- [ ] **Paso 6: Avisar del recorte en `CoverageNotice`**

En `src/components/visits/CoverageNotice.tsx`, en la lista de avisos, siguiendo el estilo de los que ya existen:

```tsx
{coverage.directoryTruncated && <li>El directorio trae los primeros {coverage.directory} pacientes activos por nombre; los demás solo pueden atenderse con señal.</li>}
```

Si una copia en versión 2 no trae directorio, no se muestra nada: `directory` es opcional.

- [ ] **Paso 7: Verificar y commitear**

Ejecutar `npx vitest run src/lib/directory.test.ts`. Esperado: PASS.

Después, `npx vitest run` y `npx astro check`.

Por último, probar la lectura contra la base real, solo lectura, con este script (el mismo patrón usado en `70277b4`):

```bash
cat > probe_tmp.ts <<'EOF'
import 'dotenv/config';
import { loadDirectory } from './src/lib/directory';
const { cards, truncated } = await loadDirectory();
console.log('pacientes', cards.length, 'recortado', truncated, 'ejemplo', JSON.stringify(cards[0]).slice(0, 200));
process.exit(0);
EOF
npx tsx probe_tmp.ts; rm probe_tmp.ts
```

Esperado: `pacientes 4` (o la cantidad de pacientes activos), sin error.

```bash
git add src/lib/visit-types.ts src/lib/directory.ts src/lib/directory.test.ts src/lib/visits.ts src/components/visits/CoverageNotice.tsx
git commit -m "feat: directorio de pacientes en la copia del dia para atender sin senal"
```

---

### Tarea 8: Visita local a partir de una tarjeta

**Archivos:**
- Crear: `src/lib/local-visit.ts`
- Test: `src/lib/local-visit.test.ts`

- [ ] **Paso 1: Tests que fallan**

```ts
import { describe, expect, it } from 'vitest';
import { isLocalVisitId, localVisitId, visitFromCard } from './local-visit';
import type { PatientCard } from './visit-types';

const card: PatientCard = {
  id: 5, name: 'Toby', species: 'perro', breed: 'Mestizo', weight: '12.00', notes: null, ownerId: 9,
  owner: { firstName: 'Ana', lastName: 'Rojas', phone: '+569', address: 'Calle 1' },
  alerts: [{ id: 1, category: 'alergia', text: 'Penicilina', validUntil: null }],
  records: [], vaccines: [],
};

describe('visita local', () => {
  it('el id provisorio es negativo y no choca con ids reales', () => {
    expect(localVisitId(1727200000000)).toBe(-1727200000000);
    expect(isLocalVisitId(-3)).toBe(true);
    expect(isLocalVisitId(3)).toBe(false);
  });
  it('arma una visita en curso sin cita con los datos de la tarjeta', () => {
    const visit = visitFromCard(card, -7, { id: 'vet-1', name: 'Vet' }, '2026-09-24T14:50:00.000Z');
    expect(visit).toMatchObject({
      id: -7, patientId: 5, ownerId: 9, veterinarianId: 'vet-1', status: 'en_curso', origin: 'sin_cita', type: 'consulta',
      scheduledAt: '2026-09-24T14:50:00.000Z', startedAt: '2026-09-24T14:50:00.000Z', endAt: '2026-09-24T15:20:00.000Z',
      patient: { name: 'Toby', species: 'perro', breed: 'Mestizo', weight: '12.00', notes: null },
      owner: card.owner, alerts: card.alerts, invoices: [],
    });
  });
});
```

- [ ] **Paso 2: Comprobar que fallan**

Ejecutar `npx vitest run src/lib/local-visit.test.ts`. Esperado: FAIL, porque no existe el módulo.

- [ ] **Paso 3: Implementar**

```ts
import type { PatientCard, VisitSnapshot } from './visit-types';

/**
 * Visitas creadas sin señal. Viven en la copia local con un id negativo
 * hasta que el servidor confirma la apertura y entrega el número real: los
 * ids reales son siempre positivos, así que no pueden confundirse.
 */
export const localVisitId = (now = Date.now()) => -now;
export const isLocalVisitId = (id: number) => id < 0;

export function visitFromCard(card: PatientCard, id: number, user: { id: string; name: string }, occurredAt: string): VisitSnapshot {
  return {
    id, patientId: card.id, ownerId: card.ownerId, veterinarianId: user.id, veterinarianName: user.name,
    scheduledAt: occurredAt, startedAt: occurredAt, endAt: new Date(Date.parse(occurredAt) + 30 * 60_000).toISOString(),
    completedAt: null, updatedAt: occurredAt, status: 'en_curso', type: 'consulta', origin: 'sin_cita',
    reason: null, notes: null, visitAddress: null, noCharge: false,
    patient: { name: card.name, species: card.species, breed: card.breed, weight: card.weight, notes: card.notes },
    owner: card.owner, records: card.records, invoices: [], vaccines: card.vaccines, alerts: card.alerts,
  };
}
```

- [ ] **Paso 4: Comprobar que pasan**

Ejecutar `npx vitest run src/lib/local-visit.test.ts`. Esperado: PASS.

- [ ] **Paso 5: Commit**

```bash
git add src/lib/local-visit.ts src/lib/local-visit.test.ts
git commit -m "feat: visita local provisoria para atender sin senal"
```

---

### Tarea 9: Cola sin conexión: apertura, promoción del id y reanudación

**Archivos:**
- Modificar: `src/lib/field-storage.ts`
- Test: `src/lib/field-storage.test.ts`

- [ ] **Paso 1: Tests que fallan**

Agregar al final de `src/lib/field-storage.test.ts`. Reutilizan el `beforeEach` existente: IndexedDB falso, `vet-a` activo y en línea.

```ts
import { resolveVisitAlias, startUnscheduledVisit } from './field-storage';
import type { PatientCard } from './visit-types';

const card: PatientCard = {
  id: 5, name: 'Toby', species: 'perro', breed: null, weight: null, notes: null, ownerId: 9,
  owner: { firstName: 'Ana', lastName: 'Rojas', phone: null, address: null }, alerts: [], records: [], vaccines: [],
};
const day = (): DaySnapshot => ({ userId: 'vet-a', userName: 'Vet A', role: 'veterinario', day: '2026-09-24', preparedAt: '2026-09-24T08:00:00.000Z', visits: [], products: [], locations: [], directory: [card] });
const serverVisit = (id: number) => ({ ...day(), visits: [{ id, patientId: 5, status: 'en_curso', origin: 'sin_cita' }] });

/** fetch falso por ruta: apertura, sync y lectura de visita. */
function server(realId = 41, openStatus = 200) {
  return vi.fn(async (url: string) => {
    if (url === '/api/visits/open') return openStatus === 200
      ? Response.json({ visitId: realId, status: 'en_curso', updatedAt: '2026-09-24T15:00:00.000Z' })
      : Response.json({ error: 'El paciente está inactivo.' }, { status: openStatus });
    if (url.endsWith('/sync')) return Response.json({ visitId: realId, status: 'en_curso', updatedAt: '2026-09-24T15:01:00.000Z' });
    if (url === `/api/visits/${realId}`) return Response.json(serverVisit(realId));
    throw new Error(`ruta inesperada ${url}`);
  });
}

describe('Atención sin cita sin señal', () => {
  it('crea la visita local y encola la apertura', async () => {
    await saveDay(day());
    const id = await startUnscheduledVisit('vet-a', card, 'Vet A');
    expect(id).toBeLessThan(0);
    expect((await getDay('vet-a'))!.visits[0]).toMatchObject({ id, origin: 'sin_cita', status: 'en_curso' });
    expect((await listPending('vet-a'))[0].operation).toMatchObject({ action: 'open', visitId: id, patientId: 5 });
  });

  it('exige una jornada preparada', async () => {
    await expect(startUnscheduledVisit('vet-a', card, 'Vet A')).rejects.toThrow('Prepara la jornada');
  });

  it('permite encadenar el guardado a la apertura', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    await saveDay(day());
    const id = await startUnscheduledVisit('vet-a', card, 'Vet A');
    const open = (await listPending('vet-a'))[0].operation;
    await queueVisit('vet-a', { ...operation, id: crypto.randomUUID(), visitId: id, predecessorId: open.id });
    expect(await listPending('vet-a')).toHaveLength(2);
  });

  it('al sincronizar: abre, reemplaza el id provisorio y envía el guardado con el real', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    await saveDay(day());
    const id = await startUnscheduledVisit('vet-a', card, 'Vet A');
    const open = (await listPending('vet-a'))[0].operation;
    await saveFieldDraft('vet-a', id, { reason: 'Vómitos' });
    await queueVisit('vet-a', { ...operation, id: crypto.randomUUID(), visitId: id, predecessorId: open.id });
    vi.stubGlobal('navigator', { onLine: true });
    const fetchMock = server(41); vi.stubGlobal('fetch', fetchMock);

    expect((await syncPending('vet-a')).sent).toBe(2);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/visits/open');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ id: open.id, patientId: 5, occurredAt: (open as any).occurredAt });
    const syncCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/sync'))!;
    expect(syncCall[0]).toBe('/api/visits/41/sync');
    expect(JSON.parse(syncCall[1].body).visitId).toBe(41);
    expect(await resolveVisitAlias('vet-a', id)).toBe(41);
    expect((await getDay('vet-a'))!.visits.map((v) => v.id)).toEqual([41]);
    expect(await listPending('vet-a')).toEqual([]);
  });

  it('la apertura no borra el borrador: se mueve al id real', async () => {
    await saveDay(day());
    const id = await startUnscheduledVisit('vet-a', card, 'Vet A');
    await saveFieldDraft('vet-a', id, { reason: 'Vómitos' });
    vi.stubGlobal('fetch', server(41));
    await syncPending('vet-a');
    expect(await loadFieldDraft('vet-a', 41)).toEqual({ reason: 'Vómitos' });
    expect(await loadFieldDraft('vet-a', id)).toBeNull();
  });

  it('una apertura rechazada bloquea lo que depende de ella sin enviarlo', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    await saveDay(day());
    const id = await startUnscheduledVisit('vet-a', card, 'Vet A');
    const open = (await listPending('vet-a'))[0].operation;
    await queueVisit('vet-a', { ...operation, id: crypto.randomUUID(), visitId: id, predecessorId: open.id });
    vi.stubGlobal('navigator', { onLine: true });
    const fetchMock = server(41, 409); vi.stubGlobal('fetch', fetchMock);
    await syncPending('vet-a');
    const pending = await listPending('vet-a');
    expect(pending.every((p) => p.blocked)).toBe(true);
    expect(pending[1].error).toContain('inactivo');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retoma un reemplazo interrumpido usando la equivalencia guardada', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    await saveDay(day());
    const id = await startUnscheduledVisit('vet-a', card, 'Vet A');
    const open = (await listPending('vet-a'))[0].operation;
    await queueVisit('vet-a', { ...operation, id: crypto.randomUUID(), visitId: id, predecessorId: open.id });
    // Simula un corte después de confirmar la apertura: la equivalencia ya
    // se escribió y la apertura se retiró, pero el guardado sigue con el id provisorio.
    await rememberVisitAlias('vet-a', id, 41);
    await removePending('vet-a', open.id);
    vi.stubGlobal('navigator', { onLine: true });
    const fetchMock = server(41); vi.stubGlobal('fetch', fetchMock);
    expect((await syncPending('vet-a')).sent).toBe(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/visits/41/sync');
  });
});
```

Sumar `removePending` y `rememberVisitAlias` al `import` de `./field-storage` al inicio del archivo.

- [ ] **Paso 2: Comprobar que fallan**

Ejecutar `npx vitest run src/lib/field-storage.test.ts`.

Esperado: FAIL, porque no existen `startUnscheduledVisit`, `resolveVisitAlias` ni `rememberVisitAlias`.

- [ ] **Paso 3: Implementar en `src/lib/field-storage.ts`**

1. Imports: cambiar `VisitOperation` por `QueuedOperation` en el import de tipos, y sumar `PatientCard`. Importar `localVisitId` y `visitFromCard` desde `./local-visit`.

2. `QueuedVisit.operation` pasa a ser de tipo `QueuedOperation`, y `queueVisit` recibe `operation: QueuedOperation`.

3. En `queueVisit`, permitir que la apertura encabece la cadena:

```ts
  if (existing && existing.operation.id !== operation.id && !(operation.predecessorId === existing.operation.id && ['travel', 'start', 'open'].includes(existing.operation.action))) throw new Error('Esta visita ya tiene una consulta pendiente de sincronizar.');
```

4. Equivalencias de ids y promoción. Van después de `removePending`:

```ts
const aliasKey = (userId: string, localId: number) => `${userId}:alias:${localId}`;

/**
 * Número real que el servidor asignó a una visita creada sin señal. La
 * equivalencia se conserva aunque la promoción termine: la pantalla que
 * todavía muestra el id provisorio la usa para saltar a la visita real.
 */
export async function resolveVisitAlias(userId: string, localId: number): Promise<number | null> {
  return localId < 0 ? read<number>(aliasKey(userId, localId)) : localId;
}
export const rememberVisitAlias = (userId: string, localId: number, realId: number) => write(aliasKey(userId, localId), realId);

/**
 * Reemplaza el id provisorio por el real en todo lo que el dispositivo
 * guarda: cola, borrador y copia del día. La equivalencia se escribe
 * primero, así un corte a mitad de camino se completa en el siguiente
 * envío en vez de dejar operaciones apuntando a una visita inexistente.
 */
async function promoteLocalVisit(userId: string, localId: number, realId: number) {
  await rememberVisitAlias(userId, localId, realId);
  for (const item of await listPending(userId)) {
    if (item.operation.visitId === localId) await write(`${userId}:queue:${item.operation.id}`, { ...item, operation: { ...item.operation, visitId: realId } });
  }
  const draft = await read<unknown>(`${userId}:draft:${localId}`);
  if (draft !== null) { await write(`${userId}:draft:${realId}`, draft); await write(`${userId}:draft:${localId}`, undefined); }
  const day = await getDay(userId);
  if (day?.visits.some((v) => v.id === localId)) await saveDay({ ...day, visits: day.visits.map((v) => v.id === localId ? { ...v, id: realId } : v) });
}

/** Termina promociones que quedaron a medias por un corte. */
async function resumePromotions(userId: string) {
  const locals = new Set((await listPending(userId)).map((q) => q.operation.visitId).filter((id) => id < 0));
  for (const localId of locals) {
    const realId = await read<number>(aliasKey(userId, localId));
    if (realId) await promoteLocalVisit(userId, localId, realId);
  }
}

/**
 * Atiende sin cita y sin señal: la visita nace en la copia local con un id
 * provisorio y su apertura queda primera en la cola.
 */
export async function startUnscheduledVisit(userId: string, card: PatientCard, userName: string): Promise<number> {
  const day = await getDay(userId);
  if (!day) throw new Error('Prepara la jornada sin conexión antes de atender sin señal.');
  const occurredAt = new Date().toISOString();
  const id = localVisitId();
  await saveDay({ ...day, visits: [...day.visits, visitFromCard(card, id, { id: userId, name: userName }, occurredAt)] });
  await queueVisit(userId, { id: crypto.randomUUID(), action: 'open', visitId: id, patientId: card.id, occurredAt }, card.name);
  return id;
}
```

5. En `runSync`:

- Al inicio, justo después del chequeo de `navigator.onLine`: `await resumePromotions(userId);`.
- El bucle vuelve a leer la cola en cada vuelta, porque la promoción cambia los `visitId` de los elementos siguientes. Reemplazar `for (const item of await listPending(userId)) {` por:

```ts
  const done = new Set<string>();
  for (;;) {
    const item = (await listPending(userId)).find((q) => !q.blocked && !done.has(q.operation.id));
    if (!item) break;
    done.add(item.operation.id);
```

  Luego quitar la línea `if (item.blocked) continue;`, porque el `find` ya descarta las bloqueadas.

- Antes del `fetch`, para operaciones que todavía apuntan a una visita local:

```ts
    const isOpen = item.operation.action === 'open';
    if (!isOpen && item.operation.visitId < 0) {
      // Depende de una apertura que todavía no se confirmó. Si esa apertura
      // fue rechazada, esta queda bloqueada con el mismo motivo; si no, espera.
      const opener = (await listPending(userId)).find((q) => q.operation.id === item.operation.predecessorId);
      if (opener?.blocked) await write(`${userId}:queue:${item.operation.id}`, { ...item, blocked: true, outcome: 'rechazo', error: `No se pudo registrar el inicio de la atención: ${opener.error}` });
      continue;
    }
```

- En el `fetch`, usar la ruta y el cuerpo según el tipo de operación:

```ts
      const url = isOpen ? '/api/visits/open' : `/api/visits/${item.operation.visitId}/sync`;
      const payload = isOpen
        ? { id: item.operation.id, patientId: (item.operation as OpenVisitOperation).patientId, occurredAt: (item.operation as OpenVisitOperation).occurredAt }
        : item.operation;
      const response = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Field-User': userId }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30000),
      });
```

  Sumar `OpenVisitOperation` al import de tipos.

- Cuando una apertura falla con `blocked`, el `continue` que ya existe basta. Las operaciones que dependen de ella se marcan en la vuelta siguiente, con el bloque anterior.

- Tras `const data = result as VisitResult;`, y antes de refrescar la copia:

```ts
      if (isOpen) await promoteLocalVisit(userId, item.operation.visitId, data.visitId);
```

- El borrador **no** se borra al confirmar una apertura, porque todavía contiene la nota en curso:

```ts
      if (!['travel', 'start', 'open'].includes(item.operation.action)) await removeFieldDraft(userId, data.visitId);
```

- [ ] **Paso 4: Comprobar que pasan**

Ejecutar `npx vitest run src/lib/field-storage.test.ts`. Esperado: PASS, con los tests nuevos y los anteriores.

Si «ordena la consulta tras su inicio» cambia de orden, revisar que `listPending` se siga ordenando por `predecessorId`. El nuevo bucle usa esa misma función.

- [ ] **Paso 5: Revisar tipos**

Ejecutar `npx astro check`. Los errores de tipo que aparezcan por `QueuedOperation` en `useVisitDraft.ts` y `SyncCenter.tsx` se resuelven en las tareas 10 y 13. Si bloquean el commit, hacer ahí el ajuste mínimo, por ejemplo `hadPending: useRef<QueuedOperation | null>`.

- [ ] **Paso 6: Commit**

```bash
git add src/lib/field-storage.ts src/lib/field-storage.test.ts
git commit -m "feat: cola offline abre atenciones sin cita y promueve el id provisorio"
```

---

### Tarea 10: Pantalla de visita con visitas locales

**Archivos:**
- Modificar: `src/components/visits/useVisitDraft.ts`, `VisitHeader.tsx`, `VisitWorkspace.tsx`, `DayPanel.tsx`

- [ ] **Paso 1: `useVisitDraft.ts`**

- Cambiar el tipo de `hadPending` a `useRef<QueuedOperation | null>(null)`, importando `QueuedOperation`.
- `pendingStatus` también considera la apertura:

```ts
  const pendingStatus = pending && ['travel', 'start', 'open'].includes(pending.operation.action);
```

- Donde se decide `resetAfterConfirm`, en `refreshPending` y en `sync()`, reemplazar `['travel', 'start']` por `['travel', 'start', 'open']`.
- En `refresh()`, no pedir al servidor una visita con id provisorio:

```ts
    if (navigator.onLine && visitId > 0) {
```

- En `buildOperation`, si `pendingStatus` es verdadero ya se encadena con `predecessorId = pending!.operation.id`, así que con la apertura pendiente funciona sin más cambios.

- [ ] **Paso 2: `VisitHeader.tsx`, etiqueta «Sin cita»**

Reemplazar `<span>{clinicHhmm(visit.scheduledAt)} · {visit.type}</span>` por:

```tsx
            <span>{visit.origin === 'sin_cita' ? `Sin cita · desde las ${clinicHhmm(visit.scheduledAt)}` : `${clinicHhmm(visit.scheduledAt)} · ${visit.type}`}</span>
```

- [ ] **Paso 3: `VisitWorkspace.tsx`, alertas sin señal**

Después de `const { alerts, state: alertsState } = usePatientAlerts(visit.patientId);`:

```ts
  // Sin señal no se pueden pedir las alertas; una visita creada desde el
  // directorio ya las trae en la copia, y ocultarlas justo ahí sería peligroso.
  const offlineAlerts = alertsState === 'sin-conexion' && visit.alerts;
  const shownAlerts = offlineAlerts ? visit.alerts! : alerts;
  const shownState = offlineAlerts ? 'listo' : alertsState;
```

Y pasar `alerts={shownAlerts} alertsState={shownState}` a `VisitHeader`.

- [ ] **Paso 4: `DayPanel.tsx`, paso del id provisorio al real**

Importar `resolveVisitAlias` y agregar este efecto después de los que ya existen:

```ts
  // Una visita abierta sin señal cambia de id al sincronizar: si la que está
  // en pantalla desapareció de la copia, se busca su número real.
  useEffect(() => {
    if (!selected || selected > 0 || snapshot.visits.some((v) => v.id === selected)) return;
    resolveVisitAlias(initial.userId, selected).then((real) => { if (real) setSelected(real); }).catch(() => {});
  }, [selected, snapshot, initial.userId]);
```

- [ ] **Paso 5: Verificar y commitear**

Ejecutar `npx vitest run` y `npx astro check` (`0 errors`).

```bash
git add src/components/visits/useVisitDraft.ts src/components/visits/VisitHeader.tsx src/components/visits/VisitWorkspace.tsx src/components/visits/DayPanel.tsx
git commit -m "feat: espacio de visita para atenciones sin cita locales"
```

---

### Tarea 11: «Atender sin cita» en Hoy y en el modo sin conexión

**Archivos:**
- Crear: `src/lib/open-visit-client.ts`, `src/lib/open-visit-client.test.ts`, `src/components/visits/PatientPicker.tsx`
- Modificar: `src/components/visits/DayPanel.tsx`

- [ ] **Paso 1: Tests que fallan (apertura con señal)**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpener } from './open-visit-client';

afterEach(() => vi.unstubAllGlobals());

describe('apertura con señal', () => {
  it('reintenta con el mismo UUID si no hubo respuesta', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('sin red'))
      .mockResolvedValueOnce(Response.json({ visitId: 41 }));
    vi.stubGlobal('fetch', fetchMock);
    const open = createOpener('vet-1');
    await expect(open(5)).rejects.toThrow();
    await expect(open(5)).resolves.toBe(41);
    const [first, second] = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
    // Mismo id Y misma hora: el servidor compara el hash del payload, y una
    // hora distinta haría que un reintento legítimo se rechazara con 409.
    expect(second).toEqual(first);
    expect(fetchMock.mock.calls[0][1].headers['X-Field-User']).toBe('vet-1');
  });
  it('otro paciente usa otro UUID', async () => {
    const fetchMock = vi.fn(async () => Response.json({ visitId: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const open = createOpener('vet-1');
    await open(5); await open(6);
    const [a, b] = fetchMock.mock.calls.map((c: any) => JSON.parse(c[1].body).id);
    expect(a).not.toBe(b);
  });
  it('muestra el motivo del rechazo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'El paciente está inactivo.' }, { status: 409 })));
    await expect(createOpener('vet-1')(5)).rejects.toThrow('inactivo');
  });
});
```

- [ ] **Paso 2: Comprobar que fallan**

Ejecutar `npx vitest run src/lib/open-visit-client.test.ts`. Esperado: FAIL, porque no existe el módulo.

- [ ] **Paso 3: Implementar**

Crear `src/lib/open-visit-client.ts`:

```ts
import type { VisitResult } from './visit-types';

/**
 * Apertura con señal. Conserva la operación por paciente mientras no haya
 * respuesta: si la red se corta y la persona vuelve a tocar el botón, se
 * reintenta la MISMA operación (mismo id y misma hora, para que el hash del
 * servidor coincida) y se recibe la cita ya creada, en vez de abrir una
 * segunda atención.
 */
export function createOpener(userId: string) {
  const inFlight = new Map<number, { id: string; occurredAt: string }>();
  return async function open(patientId: number): Promise<number> {
    const operation = inFlight.get(patientId) ?? { id: crypto.randomUUID(), occurredAt: new Date().toISOString() };
    inFlight.set(patientId, operation);
    const response = await fetch('/api/visits/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Field-User': userId },
      body: JSON.stringify({ id: operation.id, patientId, occurredAt: operation.occurredAt }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      // Un rechazo (4xx) es definitivo: el siguiente intento es una operación
      // nueva. Un 5xx puede haberse aplicado, así que se reintenta la misma.
      if (response.status < 500) inFlight.delete(patientId);
      throw new Error(data.error || 'No se pudo abrir la atención. Revisa tu conexión.');
    }
    inFlight.delete(patientId);
    return (data as VisitResult).visitId;
  };
}
```

- [ ] **Paso 4: Comprobar que pasan**

Ejecutar `npx vitest run src/lib/open-visit-client.test.ts`. Esperado: PASS.

- [ ] **Paso 5: `PatientPicker.tsx`**

Crear un diálogo con el mismo estilo de botones que `DayPanel`:

```tsx
import { useEffect, useState } from 'react';
import type { PatientCard } from '../../lib/visit-types';

export interface PickedPatient { id: number; name: string; card?: PatientCard }

const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * Elige a quién atender sin cita. Con señal busca en el servidor (la misma
 * búsqueda del directorio de pacientes); sin señal, en el directorio que
 * trajo la copia del día.
 */
export function PatientPicker({ offline, directory, onPick, onClose }: {
  offline: boolean; directory?: PatientCard[]; onPick: (p: PickedPatient) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickedPatient[]>([]);
  const [state, setState] = useState<'idle' | 'buscando' | 'error'>('idle');

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    if (offline) {
      const needle = normalize(q);
      setResults((directory ?? []).filter((c) => normalize(`${c.name} ${c.owner.firstName} ${c.owner.lastName} ${c.owner.phone ?? ''}`).includes(needle))
        .slice(0, 20).map((c) => ({ id: c.id, name: `${c.name} · ${c.owner.firstName} ${c.owner.lastName}`, card: c })));
      return;
    }
    const controller = new AbortController();
    setState('buscando');
    const timer = setTimeout(() => {
      fetch(`/api/patients?search=${encodeURIComponent(q)}&limit=20`, { signal: controller.signal })
        .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
        .then((rows: { id: number; name: string; isActive: boolean; ownerFirstName: string | null; ownerLastName: string | null }[]) => {
          setResults(rows.filter((r) => r.isActive).map((r) => ({ id: r.id, name: `${r.name} · ${r.ownerFirstName ?? ''} ${r.ownerLastName ?? ''}`.trim() })));
          setState('idle');
        })
        .catch(() => { if (!controller.signal.aborted) setState('error'); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, offline, directory]);

  const noDirectory = offline && !directory;
  return (
    <div role="dialog" aria-modal="true" aria-label="Atender sin cita" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-lg rounded-t-2xl bg-card p-5 sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Atender sin cita</h2>
          <button className="min-h-11 px-3 text-sm text-primary" onClick={onClose}>Cerrar</button>
        </div>
        {noDirectory
          ? <p className="text-sm text-muted-foreground">Esta copia no trae el directorio de pacientes. Con señal, vuelve a «Preparar sin conexión».</p>
          : <>
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Mascota, responsable o teléfono"
              aria-label="Buscar paciente" className="min-h-11 w-full rounded-lg border bg-background px-3 text-base" />
            <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {results.map((r) => (
                <li key={r.id}><button className="min-h-11 w-full rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => onPick(r)}>{r.name}</button></li>
              ))}
            </ul>
            {state === 'buscando' && <p role="status" className="mt-2 text-sm text-muted-foreground">Buscando…</p>}
            {state === 'error' && <p role="alert" className="mt-2 text-sm text-destructive">No se pudo buscar. Revisa tu conexión.</p>}
            {query.trim().length >= 2 && state === 'idle' && !results.length && <p className="mt-2 text-sm text-muted-foreground">Sin pacientes activos con ese dato.</p>}
          </>}
      </div>
    </div>
  );
}
```

Antes de dar el paso por terminado, confirmar en `src/pages/api/patients/index.ts` que `GET` devuelve un arreglo con `isActive`, `ownerFirstName` y `ownerLastName`. Así era al escribir este plan, con el total en la cabecera `X-Total-Count`.

- [ ] **Paso 6: Conectar en `DayPanel.tsx`**

Importar `PatientPicker`, `createOpener`, `startUnscheduledVisit` y `features`. Agregar el estado:

```ts
  const [picking, setPicking] = useState(false);
  const [opener] = useState(() => createOpener(initial.userId));
  const canAttend = features.atencionSinCita && ['admin', 'veterinario'].includes(snapshot.role);

  async function attend(patient: PickedPatient) {
    setBusy(true); setProblem('');
    try {
      if (offline) {
        if (!patient.card) throw new Error('Este paciente no está en la copia del día.');
        const id = await startUnscheduledVisit(initial.userId, patient.card, snapshot.userName);
        const cached = await getDay(initial.userId);
        if (cached) setSnapshot(cached);
        setPicking(false);
        setSelected(id);
      } else {
        const id = await opener(patient.id);
        window.location.href = `/citas/${id}`;
      }
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'No se pudo abrir la atención');
    } finally { setBusy(false); }
  }
```

Junto a «+ Agendar visita»:

```tsx
        {canAttend && <button className={button} disabled={busy} onClick={() => setPicking(true)}>Atender sin cita</button>}
```

Y antes del cierre del `div` principal:

```tsx
    {picking && <PatientPicker offline={offline} directory={snapshot.directory} onPick={attend} onClose={() => setPicking(false)} />}
```

En la lista «Visitas del día», junto al `VisitStatusBadge`:

```tsx
                  {visit.origin === 'sin_cita' && <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">Sin cita</span>}
```

- [ ] **Paso 7: Verificar y commitear**

Ejecutar `npx vitest run` y `npx astro check`.

```bash
git add src/lib/open-visit-client.ts src/lib/open-visit-client.test.ts src/components/visits/PatientPicker.tsx src/components/visits/DayPanel.tsx
git commit -m "feat: atender sin cita desde Hoy, con y sin senal"
```

---

### Tarea 12: «Atender ahora» en la ficha del paciente

**Archivos:**
- Crear: `src/components/patients/AttendNowButton.tsx`
- Modificar: `src/pages/pacientes/[id].astro`, `src/components/patients/PatientProfileTabs.tsx`

- [ ] **Paso 1: Botón**

```tsx
import { useState } from 'react';
import { createOpener } from '../../lib/open-visit-client';

/** Abre una atención sin cita para este paciente y lleva al espacio de visita. */
export function AttendNowButton({ userId, patientId }: { userId: string; patientId: number }) {
  const [opener] = useState(() => createOpener(userId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function attend() {
    setBusy(true); setError('');
    try { window.location.href = `/citas/${await opener(patientId)}`; }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo abrir la atención'); setBusy(false); }
  }
  return (
    <div className="flex flex-col gap-1">
      <button onClick={attend} disabled={busy} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
        {busy ? 'Abriendo…' : 'Atender ahora'}
      </button>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Paso 2: Ficha (`src/pages/pacientes/[id].astro`)**

En el bloque de acciones del `header`, antes de «Agendar cita»:

```astro
      {features.atencionSinCita && canEdit && patient.isActive && <AttendNowButton client:load userId={user.id} patientId={id} />}
```

Importar `AttendNowButton` y `features`. `canEdit` ya existe y es `medical-records:write`: solo administración y veterinarios.

Con «Atender ahora» como acción principal, «Agendar cita» pasa a estilo secundario. Cambiar sus clases `bg-primary ... text-primary-foreground hover:bg-primary/90` por `border hover:bg-muted`, como «Editar ficha».

- [ ] **Paso 3: «Registrar consulta pasada»**

En `src/components/patients/PatientProfileTabs.tsx`, en la pestaña Consultas, cambiar el texto del enlace «Registrar consulta» a «Registrar consulta pasada» y su clase a `text-sm text-muted-foreground hover:underline`.

- [ ] **Paso 4: Verificar y commitear**

Ejecutar `npx astro check` y `npx vitest run`.

```bash
git add src/components/patients/AttendNowButton.tsx "src/pages/pacientes/[id].astro" src/components/patients/PatientProfileTabs.tsx
git commit -m "feat: atender ahora desde la ficha del paciente"
```

---

### Tarea 13: Etiquetas en la agenda y en el centro de sincronización

**Archivos:**
- Modificar: `src/pages/api/appointments/index.ts`, `src/components/appointments/AppointmentList.tsx`, `src/components/appointments/AppointmentCalendar.tsx`, `src/components/visits/SyncCenter.tsx`

- [ ] **Paso 1: API**

En el `select` del `GET` de `src/pages/api/appointments/index.ts`, sumar `origin: appointments.origin,`.

- [ ] **Paso 2: Lista y calendario**

- En la interfaz `Appointment` de ambos componentes, sumar `origin?: 'agendada' | 'sin_cita';`.
- En `AppointmentList.tsx`, en la celda del paciente:

```tsx
                  <td className="px-4 py-3 font-medium">{a.patientName || '—'}{a.origin === 'sin_cita' && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal">Sin cita</span>}</td>
```

- En `AppointmentCalendar.tsx`, dentro del bloque de la cita, anteponer al nombre del paciente `{a.origin === 'sin_cita' ? 'Sin cita · ' : ''}`.

- [ ] **Paso 3: Centro de sincronización**

En `SyncCenter.tsx`:
- Sumar `open: 'Inicio de atención sin cita',` a `actionLabel`.
- Un id negativo no tiene página: en lugar de `visita #-1727…`, mostrar `atención nueva`.
- El enlace `<a href="/citas/...">` se muestra solo si `item.operation.visitId > 0`. El botón `onOpenVisit` del modo sin conexión sí funciona con el id local.

- [ ] **Paso 4: Verificar y commitear**

Ejecutar `npx astro check` y `npx vitest run`.

```bash
git add src/pages/api/appointments/index.ts src/components/appointments/AppointmentList.tsx src/components/appointments/AppointmentCalendar.tsx src/components/visits/SyncCenter.tsx
git commit -m "feat: etiqueta Sin cita en agenda y centro de sincronizacion"
```

---

### Tarea 14: Pruebas de integración contra Postgres real

**Archivos:**
- Crear: `vitest.integration.config.ts`, `tests/integration/setup.ts`, `tests/integration/fixtures.ts`, `tests/integration/atencion-sin-cita.test.ts`, `tests/integration/limpiar.ts`
- Modificar: `package.json`

- [ ] **Paso 1: Configuración**

`vitest.integration.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

// Pruebas contra Postgres real. Solo corren con TEST_DATABASE_URL; nunca en
// `npm test` ni en el build. Hoy apuntan a producción, que solo tiene datos
// de prueba: moverlas a una base aparte antes de atender clientes reales.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/integration/setup.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
```

`tests/integration/setup.ts`:

```ts
import 'dotenv/config';
// src/db lee DATABASE_URL al importarse: se reemplaza antes de que ningún
// test lo cargue, para que la conexión sea siempre la de prueba declarada.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
```

En `package.json`, dentro de `scripts`:

```json
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:integration:limpiar": "npx tsx tests/integration/limpiar.ts"
```

- [ ] **Paso 2: Datos `[TEST]` y limpieza**

`tests/integration/fixtures.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { eq, inArray, like, or } from 'drizzle-orm';
import { db } from '../../src/db';
import { users } from '../../src/db/schema/users';
import { owners, patients } from '../../src/db/schema/patients';
import { products, stockMovements } from '../../src/db/schema/inventory';
import { services, serviceComponents, visitServiceItems } from '../../src/db/schema/services';
import { appointments } from '../../src/db/schema/appointments';
import { invoices, invoiceItems, payments } from '../../src/db/schema/billing';
import { medicalRecords } from '../../src/db/schema/medical';
import { visitOperations } from '../../src/db/schema/visit-operations';
import { followupTasks } from '../../src/db/schema/followups';

export const TEST_MARK = '[TEST]';
const TEST_EMAIL_DOMAIN = '@alma-test.invalid';

/** Crea un veterinario, un responsable, un paciente, un producto con stock y una prestación que lo consume. */
export async function createFixtures() {
  const vetId = randomUUID();
  await db.insert(users).values({ id: vetId, name: `${TEST_MARK} Vet`, email: `vet-${vetId}${TEST_EMAIL_DOMAIN}`, role: 'veterinario' });
  const [owner] = await db.insert(owners).values({ firstName: TEST_MARK, lastName: 'Responsable' }).returning();
  const [patient] = await db.insert(patients).values({ ownerId: owner.id, name: `${TEST_MARK} Toby`, species: 'perro', sex: 'macho' }).returning();
  const [product] = await db.insert(products).values({ name: `${TEST_MARK} Jeringa`, category: 'insumo', unitPrice: '100', stock: '10' }).returning();
  const [service] = await db.insert(services).values({ name: `${TEST_MARK} Consulta`, price: '20000' }).returning();
  await db.insert(serviceComponents).values({ serviceId: service.id, productId: product.id, quantity: '1' });
  return { vet: { id: vetId, name: `${TEST_MARK} Vet`, role: 'veterinario' }, owner, patient, product, service };
}

/**
 * Borra todo lo marcado [TEST], en orden de dependencias. Se usa en afterAll
 * y en `npm run test:integration:limpiar`, por si una prueba se cortó.
 */
export async function cleanupTestData() {
  const testUsers = (await db.select({ id: users.id }).from(users).where(like(users.email, `%${TEST_EMAIL_DOMAIN}`))).map((u) => u.id);
  const testOwners = (await db.select({ id: owners.id }).from(owners).where(eq(owners.firstName, TEST_MARK))).map((o) => o.id);
  const testPatients = testOwners.length ? (await db.select({ id: patients.id }).from(patients).where(inArray(patients.ownerId, testOwners))).map((p) => p.id) : [];
  const testProducts = (await db.select({ id: products.id }).from(products).where(like(products.name, `${TEST_MARK}%`))).map((p) => p.id);
  const testServices = (await db.select({ id: services.id }).from(services).where(like(services.name, `${TEST_MARK}%`))).map((s) => s.id);
  const testAppointments = testPatients.length ? (await db.select({ id: appointments.id }).from(appointments).where(inArray(appointments.patientId, testPatients))).map((a) => a.id) : [];
  const testInvoices = testOwners.length ? (await db.select({ id: invoices.id }).from(invoices).where(inArray(invoices.ownerId, testOwners))).map((i) => i.id) : [];

  if (testProducts.length) await db.delete(stockMovements).where(inArray(stockMovements.productId, testProducts));
  if (testPatients.length) await db.delete(followupTasks).where(inArray(followupTasks.patientId, testPatients));
  if (testAppointments.length) await db.delete(visitServiceItems).where(inArray(visitServiceItems.appointmentId, testAppointments));
  if (testInvoices.length) {
    await db.delete(payments).where(inArray(payments.invoiceId, testInvoices));
    await db.delete(invoiceItems).where(inArray(invoiceItems.invoiceId, testInvoices));
    await db.delete(invoices).where(inArray(invoices.id, testInvoices));
  }
  if (testPatients.length) await db.delete(medicalRecords).where(inArray(medicalRecords.patientId, testPatients));
  if (testAppointments.length) await db.delete(appointments).where(inArray(appointments.id, testAppointments));
  if (testUsers.length) await db.delete(visitOperations).where(inArray(visitOperations.userId, testUsers));
  if (testServices.length) await db.delete(services).where(inArray(services.id, testServices));
  if (testProducts.length) await db.delete(products).where(inArray(products.id, testProducts));
  if (testPatients.length) await db.delete(patients).where(inArray(patients.id, testPatients));
  if (testOwners.length) await db.delete(owners).where(inArray(owners.id, testOwners));
  if (testUsers.length) await db.delete(users).where(inArray(users.id, testUsers));
}
```

Si al correr aparece una restricción de clave foránea no listada (por ejemplo, `audit_logs` o `communication_events`), sumar su `delete` en el lugar que corresponda y documentarlo con un comentario. **No** usar `TRUNCATE` ni borrar nada que no esté marcado `[TEST]`.

`tests/integration/limpiar.ts`:

```ts
import './setup';
if (!process.env.TEST_DATABASE_URL) { console.error('Define TEST_DATABASE_URL para limpiar datos de prueba.'); process.exit(1); }
const { cleanupTestData } = await import('./fixtures');
await cleanupTestData();
console.log('Datos [TEST] eliminados.');
process.exit(0);
```

- [ ] **Paso 3: Escenarios**

`tests/integration/atencion-sin-cita.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

describe.skipIf(!process.env.TEST_DATABASE_URL)('atención sin cita contra Postgres real', () => {
  let f: Awaited<ReturnType<typeof import('./fixtures')['createFixtures']>>;
  let mod: {
    db: typeof import('../../src/db')['db'];
    openVisit: typeof import('../../src/lib/open-visit')['openVisit'];
    saveVisit: typeof import('../../src/lib/save-visit')['saveVisit'];
    fixtures: typeof import('./fixtures');
    schema: { appointments: any; products: any; invoices: any; stockMovements: any };
  };

  beforeAll(async () => {
    const fixtures = await import('./fixtures');
    await fixtures.cleanupTestData();
    f = await fixtures.createFixtures();
    mod = {
      db: (await import('../../src/db')).db,
      openVisit: (await import('../../src/lib/open-visit')).openVisit,
      saveVisit: (await import('../../src/lib/save-visit')).saveVisit,
      fixtures,
      schema: {
        appointments: (await import('../../src/db/schema/appointments')).appointments,
        products: (await import('../../src/db/schema/inventory')).products,
        invoices: (await import('../../src/db/schema/billing')).invoices,
        stockMovements: (await import('../../src/db/schema/inventory')).stockMovements,
      },
    };
  });
  afterAll(async () => { await mod?.fixtures.cleanupTestData(); });

  it('abre, guarda con prestación y pago, y cierra: cita, factura y stock quedan correctos', async () => {
    const open = { id: randomUUID(), patientId: f.patient.id, occurredAt: new Date(Date.now() - 60_000).toISOString() };
    const opened = await mod.openVisit(f.vet, open);
    const [appt] = await mod.db.select().from(mod.schema.appointments).where(eq(mod.schema.appointments.id, opened.visitId));
    expect(appt).toMatchObject({ origin: 'sin_cita', status: 'en_curso', veterinarianId: f.vet.id });

    const save = { id: randomUUID(), visitId: opened.visitId, expectedUpdatedAt: opened.updatedAt, predecessorId: open.id, action: 'save' as const, version: 2,
      record: { reason: 'Control sin cita' }, items: [{ serviceId: f.service.id, quantity: 1 }], payment: { amount: 20000, method: 'efectivo' as const } };
    const saved = await mod.saveVisit(f.vet, save);
    expect(saved.invoiceId).toBeTruthy();

    const done = await mod.saveVisit(f.vet, { id: randomUUID(), visitId: opened.visitId, expectedUpdatedAt: saved.updatedAt, action: 'complete' });
    expect(done.status).toBe('completada');

    const [product] = await mod.db.select().from(mod.schema.products).where(eq(mod.schema.products.id, f.product.id));
    expect(Number(product.stock)).toBe(9);
    const [invoice] = await mod.db.select().from(mod.schema.invoices).where(eq(mod.schema.invoices.id, saved.invoiceId!));
    expect(invoice.status).toBe('pagada');
    const [closed] = await mod.db.select().from(mod.schema.appointments).where(eq(mod.schema.appointments.id, opened.visitId));
    expect(closed.endAt.getTime()).toBeGreaterThan(closed.scheduledAt.getTime());
  });

  it('reintentar la apertura y el guardado no duplica nada', async () => {
    const open = { id: randomUUID(), patientId: f.patient.id, occurredAt: new Date().toISOString() };
    const a = await mod.openVisit(f.vet, open);
    const b = await mod.openVisit(f.vet, open);
    expect(b.visitId).toBe(a.visitId);
    const save = { id: randomUUID(), visitId: a.visitId, expectedUpdatedAt: a.updatedAt, predecessorId: open.id, action: 'save' as const, version: 2,
      record: { reason: 'Reintento' }, items: [{ serviceId: f.service.id, quantity: 1 }] };
    const first = await mod.saveVisit(f.vet, save);
    const again = await mod.saveVisit(f.vet, save);
    expect(again).toEqual(first);
    const movements = await mod.db.select().from(mod.schema.stockMovements).where(eq(mod.schema.stockMovements.referenceId, first.recordId!));
    expect(movements).toHaveLength(1);
  });

  it('agendar una cita que se solapa con una atención sin cita responde 409', async () => {
    const opened = await mod.openVisit(f.vet, { id: randomUUID(), patientId: f.patient.id, occurredAt: new Date().toISOString() });
    const { POST } = await import('../../src/pages/api/appointments/index');
    const res = await POST({
      locals: { user: f.vet },
      request: new Request('http://localhost/api/appointments', { method: 'POST', body: JSON.stringify({
        patientId: f.patient.id, ownerId: f.owner.id, veterinarianId: f.vet.id, type: 'consulta',
        scheduledAt: new Date(Date.now() + 5 * 60_000).toISOString(), endAt: new Date(Date.now() + 35 * 60_000).toISOString(),
      }) }),
    } as any);
    expect(res.status).toBe(409);
    expect(opened.visitId).toBeGreaterThan(0);
  });
});
```

Notas:
- El segundo escenario usa un paciente que ya tiene una atención abierta en el primero. Eso es válido, porque las atenciones sin cita no se bloquean entre sí.
- El tercero depende del arreglo `70277b4`. Si falla con `Received an instance of Date`, esa regresión volvió.

- [ ] **Paso 4: Correr contra la base**

Agregar `TEST_DATABASE_URL` al `.env` local, con el mismo valor que `DATABASE_URL` de producción, por la decisión del 24-09-2026. **No se commitea**: `.env` está en `.gitignore`.

Ejecutar `npm run test:integration`. Esperado: 3 tests en PASS.

Después, comprobar con `execute_sql` que no quedaron datos de prueba:

```sql
select (select count(*) from owners where first_name = '[TEST]') owners,
       (select count(*) from users where email like '%@alma-test.invalid') users;
```

Esperado: `0, 0`.

Comprobar también que `npm test` no ejecuta estas pruebas: el total de tests es el mismo que antes.

- [ ] **Paso 5: Commit**

```bash
git add vitest.integration.config.ts tests/integration package.json
git commit -m "test: pruebas de integracion de la atencion sin cita contra Postgres real"
```

---

### Tarea 15: Documentación, despliegue y prueba en el teléfono

**Archivos:**
- Modificar: `docs/ESTADO-IMPLEMENTACION.md`, `DOCUMENTACION.md`

- [ ] **Paso 1: Documentar**

- En `DOCUMENTACION.md`, sección de banderas de función: `PUBLIC_FEATURE_ATENCION_SIN_CITA` (encendida por omisión, se apaga con `off`). Agregar también cómo correr `npm run test:integration` y su advertencia: hoy apunta a producción y hay que moverla antes de tener datos reales.
- En `docs/ESTADO-IMPLEMENTACION.md`, agregar una sección «Atención sin cita (24-09-2026)» con lo construido y lo que falta verificar en terreno.

- [ ] **Paso 2: Verificación completa**

Ejecutar, en orden:
1. `npx vitest run`: todo en verde.
2. `npx astro check`: `0 errors`.
3. `npm run build`: build completo.
4. `npm run test:integration`: 3 en PASS.
5. `npx graphify hook-rebuild`.

- [ ] **Paso 3: Commit**

```bash
git add docs/ESTADO-IMPLEMENTACION.md DOCUMENTACION.md
git commit -m "docs: atencion sin cita"
```

- [ ] **Paso 4: Push y despliegue, solo con autorización del usuario**

La migración de la tarea 1 ya está aplicada en producción. Pedir autorización antes de hacer `git push origin main`.

Después del push, esperar a que el deploy de Vercel quede `READY`. Revisar `get_runtime_errors` de la última hora: no debe haber errores nuevos.

- [ ] **Paso 5: Prueba en el teléfono con el usuario**

Guiar al usuario por estos pasos:
1. Con señal, desde la ficha de un paciente: «Atender ahora» → nota → prestación → cobro → cerrar. Comprobar que aparezca en la agenda con «Sin cita», en la cronología del paciente y en cobros.
2. En Hoy: «Preparar sin conexión» → modo avión → «Atender sin cita» → buscar al paciente en el directorio → nota → cerrar → quitar modo avión → sincronizar. Comprobar que la atención quedó con número real y sin duplicados.
3. Anular desde facturación los cobros de prueba, si el usuario lo prefiere.
