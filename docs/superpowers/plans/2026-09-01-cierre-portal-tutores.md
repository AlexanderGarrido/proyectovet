# Cierre del Portal de Tutores — Fase 1 · Plan de Implementación

> **Para trabajadores agénticos:** OBLIGATORIO: implementar este plan con superpowers:subagent-driven-development (si hay subagentes) o superpowers:executing-plans. Los pasos usan checkbox (`- [ ]`) para seguimiento.

**Goal:** Eliminar por completo el portal de tutores, el rol `tutor` y el registro público self-service; dejar el sistema como una app 100 % de staff, sin features nuevas.

**Architecture:** Es un cambio de *remoción*. Se borra la superficie tutor (páginas, componentes, endpoints `/api/client/*`, flujo de invitación), se estrecha el modelo de roles a `admin | veterinario | recepcionista`, y se sustituye el único camino de alta de cuentas (el signup público, que creaba `tutor`) por un alta interna solo-admin. Los datos de clientes (`owners`, `patient_co_owners`) se conservan: "tutor" sigue siendo la etiqueta del dueño en la UI de staff; lo que desaparece es el *rol de login*. Las cuentas con rol `tutor` se **borran** de la base de datos (decisión del negocio).

**Tech Stack:** Astro 4 (SSR, `output: 'server'`), better-auth (email+password, adapter Drizzle), Drizzle ORM + PostgreSQL/Supabase, drizzle-kit para migraciones, Vitest, React islands, Tailwind.

**Fuera de alcance (fases posteriores):** generador de informes PDF, entidad `procedures`, tabla `reports`, envío por WhatsApp. Este plan NO los toca.

---

## Decisiones ya tomadas por el negocio

1. Cuentas con rol `tutor`: **borrar** (no desactivar). Sus fichas `owners` se conservan con `user_id = NULL`.
2. Envío de informes: manual primero — **no se implementa en Fase 1**.
3. Los informes **persistirán** (tabla `reports`) — **Fase 2, no aquí**.
4. `procedures` será entidad propia — **Fase 2, no aquí**.

## Decisión abierta (confirmar antes de la Task 6)

- **Co-tutores (`patient_co_owners` + `CoOwnersSection`)**: es una feature *de staff* (marca "esta mascota tiene más de un dueño"). El plan la **conserva** y solo le quita la rama `tutor`. Si el negocio no la quiere, se elimina en un plan aparte — no bloquea esta fase.

---

## Estructura de archivos

### Se ELIMINAN (archivos completos)

| Archivo | Motivo |
|---|---|
| `src/pages/register.astro` | Registro público |
| `src/components/auth/RegisterForm.tsx` | Registro público |
| `src/pages/dashboard/mascota/[id].astro` | Ficha clínica del portal tutor |
| `src/components/dashboard/ClientPortal.tsx` | Portal tutor |
| `src/components/dashboard/AddPetDialog.tsx` | Auto-registro de mascotas por el tutor |
| `src/components/dashboard/EditContactDialog.tsx` | Auto-edición de contacto por el tutor |
| `src/components/dashboard/PetProfile.tsx` | Solo lo usa `dashboard/mascota/[id].astro` |
| `src/lib/portalData.ts` | Query del portal tutor |
| `src/pages/api/client/portal.ts` | API portal |
| `src/pages/api/client/pets.ts` | API portal |
| `src/pages/api/client/profile.ts` | API portal |
| `src/pages/api/owners/[id]/invite.ts` | Flujo de invitación |
| `src/pages/api/invites/redeem.ts` | Flujo de invitación |
| `src/components/patients/OwnerInviteButton.tsx` | Flujo de invitación |
| `src/db/schema/invites.ts` | Tabla `owner_invites` |
| `src/lib/ownership.ts` | `canTutorAccessPatient` / `getOwnerIdForUser` — sin llamadores tras la fase |

Tras borrar: `src/pages/api/client/` y `src/pages/api/invites/` quedan vacíos → eliminar los directorios.

### Se MODIFICAN

| Archivo | Cambio |
|---|---|
| `src/lib/auth.ts` | Quitar `ensureOwnerForUser` y el `databaseHooks.user.create.after`; `role.defaultValue` → `'recepcionista'` |
| `src/db/schema/users.ts` | `UserRole` union sin `'tutor'`; `role` default `'recepcionista'`; comentario en `userRoleEnum` (el valor `'tutor'` queda huérfano a propósito — ver Task 7) |
| `src/lib/permissions.ts` | Quitar entrada `tutor` de `permissions`; quitar rama `tutor` de `getNavItems`; eliminar `STAFF_ROUTES` (sin uso tras middleware) |
| `src/middleware.ts` | Quitar import y bloque `STAFF_ROUTES` / `role === 'tutor'` |
| `src/lib/guard.ts` | Sin cambios de lógica; revisar comentarios que mencionan `tutor`/`:own` (opcional) |
| `src/lib/schemas.ts` | Borrar `registerSchema` + `RegisterFormData`, `clientProfileSchema` + `ClientProfileInput`, `clientPetSchema` + `ClientPetInput`; `userUpdateSchema.role` enum sin `'tutor'` |
| `src/components/auth/LoginForm.tsx` | Quitar el `<p>` "¿No tienes cuenta? Regístrate" (líneas ~67-72) |
| `src/pages/dashboard/index.astro` | Quitar `isTutor`, el import de `ClientPortal` y `getPortalData`, `portalData`, y la rama `{isTutor ? <ClientPortal/> : ...}` — dejar solo el panel de staff |
| `src/components/layout/Header.tsx` | `roleLabels` sin `tutor`; `canSearch` → siempre `true` (quitar `userRole !== 'tutor'`) |
| `src/components/admin/UserList.tsx` | `roleLabels`/`roleColors` sin `tutor`; quitar `<option value="tutor">`; añadir alta de usuario (Task 8) |
| `src/pages/configuracion/index.astro` | Quitar la tarjeta "Tutores" que cuenta `u.role === 'tutor'` (líneas ~33-36) |
| `src/pages/api/appointments/index.ts` | Quitar rama `if (user!.role === 'tutor')` (líneas ~36-43) |
| `src/pages/api/appointments/[id].ts` | Quitar ramas `if (user!.role === 'tutor')` (GET ~48-52; y las de PUT/DELETE si las hay) |
| `src/pages/api/medical/vaccines.ts` | Quitar import `canTutorAccessPatient` y rama `tutor` (líneas ~9, ~30-33) |
| `src/pages/api/patients/[id]/vaccine-card.ts` | Quitar rama `if (user.role === 'tutor')` (líneas ~33-40), dejar solo `STAFF_ROLES` |
| `src/pages/api/patients/[id]/co-owners.ts` | Quitar import `canTutorAccessPatient` y rama `tutor` en GET (líneas ~8, ~22-25) |
| `src/db/seed.ts` | Quitar los 2 usuarios `role: 'tutor'` (`client1Id`, `client2Id`) o convertirlos en `owners` sin cuenta |
| `src/pages/api/users/index.ts` | Añadir handler `POST` solo-admin (Task 8) |
| `src/lib/schemas.ts` | Añadir `userCreateSchema` (Task 8) |

### Se MODIFICAN (tests)

| Archivo | Cambio |
|---|---|
| `src/lib/permissions.test.ts` | Borrar `describe('tutor')` y los casos `tutor` de `requiresOwnershipCheck`; añadir caso: rol desconocido → `hasPermission` = `false` |
| `src/pages/api/__tests__/roles.test.ts` | Cambiar `tutorUser.role` a `'desconocido'`; el bloque sigue probando "rol sin permiso → 403" |
| `src/pages/api/__tests__/idor-regression.test.ts` | Reescribir: quitar mocks de `lib/ownership`; los casos "tutor" que probaban scoping `:own` se eliminan; conservar los "staff sí puede" y "listado sin filtro rechaza rol sin permiso" (renombrando `tutorUser` → `outsiderUser` con `role: 'desconocido'`) |
| `src/pages/api/__tests__/idor-regression-round3.test.ts` | `tutorUser` → `outsiderUser` (`role: 'desconocido'`); el bloque "bloqueados para tutor" pasa a "bloqueados para rol sin permiso"; conservar intacto "el staff correspondiente sigue teniendo acceso" |
| `src/pages/api/__tests__/auth.test.ts` | Sin cambios (prueba 401 sin sesión) — solo verificar que compila |

### Se CREAN

| Archivo | Responsabilidad |
|---|---|
| `drizzle/migrations/XXXX_cierre_portal_tutores.sql` | Migración: `DROP TABLE owner_invites`, `UPDATE owners SET user_id = NULL ...`, `DELETE FROM users WHERE role = 'tutor'`, `ALTER COLUMN role SET DEFAULT 'recepcionista'` |
| `src/components/admin/NewUserDialog.tsx` | Formulario de alta de usuario interno (Task 8) |

---

## Task 1: Deshabilitar el registro público self-service

**Files:**
- Modify: `src/lib/auth.ts`
- Delete: `src/pages/register.astro`, `src/components/auth/RegisterForm.tsx`
- Modify: `src/components/auth/LoginForm.tsx`
- Modify: `src/lib/schemas.ts` (quitar `registerSchema` / `RegisterFormData`)
- Modify: `src/middleware.ts` (quitar `/register` de `publicRoutes`)

- [ ] **Step 1: Deshabilitar signup en better-auth**

En `src/lib/auth.ts`, dentro de `emailAndPassword`, añadir `disableSignUp: true`:

```ts
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    // No hay recuperación de contraseña por email (sin dominio/SMTP verificado).
    // Si un usuario olvida su contraseña, un administrador se la restablece
    // desde el panel de Usuarios (PUT /api/users/[id] con campo `password`).
  },
```

- [ ] **Step 2: Quitar el hook que creaba la ficha de tutor al registrarse**

En `src/lib/auth.ts`:
- Borrar la función `ensureOwnerForUser` (líneas ~22-35) y su bloque de comentario (~7-21).
- Borrar por completo la clave `databaseHooks` del objeto `betterAuth({...})` (líneas ~99-112).
- Quitar el import ya sin uso: `import { owners } from '../db/schema/patients';`.

- [ ] **Step 3: `role.defaultValue` → `'recepcionista'`**

En `src/lib/auth.ts`, `user.additionalFields.role`:

```ts
      role: {
        type: 'string',
        required: false,
        defaultValue: 'recepcionista',
        input: false,
      },
```

- [ ] **Step 4: Borrar la página y el formulario de registro**

```bash
git rm src/pages/register.astro src/components/auth/RegisterForm.tsx
```

- [ ] **Step 5: Quitar el enlace a /register del login**

En `src/components/auth/LoginForm.tsx`, borrar el bloque:

```tsx
      <p className="text-center text-sm text-muted-foreground">
        No tienes cuenta?{' '}
        <a href="/register" className="text-primary hover:underline">
          Registrate
        </a>
      </p>
```

Dejar el `<p>` de "¿Olvidaste tu contraseña?".

- [ ] **Step 6: Quitar los schemas de registro**

En `src/lib/schemas.ts`, borrar el bloque `// ── Auth: Registro ──` completo: `registerSchema` y `export type RegisterFormData`.

- [ ] **Step 7: Sacar `/register` de las rutas públicas**

En `src/middleware.ts` línea 10:

```ts
const publicRoutes = ['/', '/login', '/api/auth', '/api/cron', '/api/payments/webhook'];
```

(`/api/auth` se mantiene: better-auth ya rechaza el sign-up con `disableSignUp`, y sign-in sigue necesitando esa ruta.)

- [ ] **Step 8: Verificar typecheck**

Run: `npx astro check`
Expected: sin errores por imports colgados de `RegisterForm` / `registerSchema`. (Los errores de `ClientPortal` etc. se resuelven en tasks siguientes — si `astro check` mezcla todo, anotar y continuar; la verificación dura es la Task 9.)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: deshabilitar registro publico self-service"
```

---

## Task 2: Eliminar el flujo de invitación de tutores

**Files:**
- Delete: `src/pages/api/owners/[id]/invite.ts`, `src/pages/api/invites/redeem.ts`, `src/components/patients/OwnerInviteButton.tsx`, `src/db/schema/invites.ts`
- Modify: `src/pages/tutores/[id].astro` (quitar `<OwnerInviteButton>`)

- [ ] **Step 1: Borrar los archivos del flujo de invitación**

```bash
git rm src/pages/api/owners/[id]/invite.ts src/pages/api/invites/redeem.ts src/components/patients/OwnerInviteButton.tsx src/db/schema/invites.ts
```

- [ ] **Step 2: Quitar el uso de `OwnerInviteButton` de la ficha de tutor**

En `src/pages/tutores/[id].astro`:
- Borrar el import: `import { OwnerInviteButton } from '../../components/patients/OwnerInviteButton';` (línea 3).
- Borrar el `<OwnerInviteButton client:visible ... />` (línea ~75) y, si queda un contenedor/encabezado ("Portal del tutor" / "Invitación") huérfano alrededor, borrarlo también. Leer 15 líneas de contexto antes de editar.

- [ ] **Step 3: Verificar que `src/pages/api/invites/` quedó vacío y eliminarlo**

Run: `ls src/pages/api/invites/`
Expected: vacío → `rmdir src/pages/api/invites` (o `git status` confirmará que ya no se rastrea nada dentro).

- [ ] **Step 4: Verificar typecheck**

Run: `npx astro check`
Expected: sin errores nuevos por `OwnerInviteButton` / `ownerInvites`. Puede seguir habiendo errores de otras tasks pendientes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: eliminar flujo de invitacion de tutores"
```

---

## Task 3: Eliminar la UI del portal de tutores

**Files:**
- Delete: `src/pages/dashboard/mascota/[id].astro`, `src/components/dashboard/ClientPortal.tsx`, `src/components/dashboard/AddPetDialog.tsx`, `src/components/dashboard/EditContactDialog.tsx`, `src/components/dashboard/PetProfile.tsx`
- Modify: `src/pages/dashboard/index.astro`

- [ ] **Step 1: Confirmar que `PetProfile` no se usa fuera del portal**

Run: `grep -rn "PetProfile" src --include="*.astro" --include="*.tsx" | grep -v "components/dashboard/PetProfile.tsx"`
Expected: solo `src/pages/dashboard/mascota/[id].astro` (que también se borra). Si aparece otro consumidor, detenerse y reportar.

- [ ] **Step 2: Borrar los componentes y la página del portal**

```bash
git rm "src/pages/dashboard/mascota/[id].astro" src/components/dashboard/ClientPortal.tsx src/components/dashboard/AddPetDialog.tsx src/components/dashboard/EditContactDialog.tsx src/components/dashboard/PetProfile.tsx
```

Run: `ls "src/pages/dashboard/mascota"` → si queda vacío, se elimina solo al no rastrear archivos.

- [ ] **Step 3: Simplificar `dashboard/index.astro` — quitar la rama tutor**

En `src/pages/dashboard/index.astro`:
- Borrar imports: `ClientPortal` (línea 8) y `getPortalData` (línea 9).
- Borrar `const isTutor = user.role === 'tutor';` (línea 29) y el comentario + `const portalData = isTutor ? ... : null;` (líneas ~31-37).
- En `roleGreeting` (líneas ~22-27), quitar `tutor: 'Mi Portal',`.
- Reemplazar `if (!isTutor) {` (línea ~46) por ejecución incondicional: quitar el `if (!isTutor) {` y su `}` de cierre (línea ~81), dejando el bloque de queries de staff siempre activo.
- En el JSX: reemplazar `{isTutor ? ( <ClientPortal .../> ) : ( <> ... </> )}` (líneas ~108-223) por solo el contenido del `<>...</>` de staff.
- Quitar el ternario de la línea ~102: `{isTutor ? 'Aquí puedes ver...' : 'Aquí tienes un resumen de hoy.'}` → dejar `'Aquí tienes un resumen de hoy.'`.

- [ ] **Step 4: Verificar typecheck**

Run: `npx astro check`
Expected: `dashboard/index.astro` compila; sin referencias a `ClientPortal`/`getPortalData`/`isTutor`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: eliminar UI del portal de tutores"
```

---

## Task 4: Eliminar las APIs `/api/client/*` y `portalData`

**Files:**
- Delete: `src/pages/api/client/portal.ts`, `src/pages/api/client/pets.ts`, `src/pages/api/client/profile.ts`, `src/lib/portalData.ts`
- Modify: `src/lib/schemas.ts`

- [ ] **Step 1: Confirmar que no quedan llamadores de `/api/client/`**

Run: `grep -rn "/api/client/" src`
Expected: vacío (los componentes que llamaban se borraron en Task 3). Si aparece algo, detenerse.

- [ ] **Step 2: Confirmar que no quedan llamadores de `getPortalData`**

Run: `grep -rn "getPortalData\|portalData" src`
Expected: vacío.

- [ ] **Step 3: Borrar los archivos**

```bash
git rm src/pages/api/client/portal.ts src/pages/api/client/pets.ts src/pages/api/client/profile.ts src/lib/portalData.ts
```

`src/pages/api/client/` queda vacío.

- [ ] **Step 4: Quitar los schemas del portal**

En `src/lib/schemas.ts`, borrar el bloque `// ── Portal del tutor (self-service) ──`: `clientProfileSchema` + `ClientProfileInput` + `clientPetSchema` + `ClientPetInput`.

- [ ] **Step 5: Verificar typecheck**

Run: `npx astro check`
Expected: sin errores por `clientPetSchema` / `clientProfileSchema` / `getPortalData`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: eliminar APIs /api/client y portalData"
```

---

## Task 5: Estrechar el modelo de roles a solo-staff

**Files:**
- Modify: `src/db/schema/users.ts`, `src/lib/permissions.ts`, `src/middleware.ts`, `src/components/layout/Header.tsx`, `src/components/admin/UserList.tsx`, `src/pages/configuracion/index.astro`, `src/lib/schemas.ts`

- [ ] **Step 1: `UserRole` sin `tutor`**

En `src/db/schema/users.ts`:
- Línea 65: `export type UserRole = 'admin' | 'veterinario' | 'recepcionista';`
- Línea 16: `role: userRoleEnum('role').notNull().default('recepcionista'),`
- Sobre `userRoleEnum` (líneas 3-8) añadir comentario, dejando el valor `'tutor'` en el enum de Postgres (se retira de la BD en Task 7, no aquí):

```ts
// NOTA: el valor 'tutor' permanece en el enum de Postgres por compatibilidad
// de la migración (retirar un valor de un enum PG es una operación cara). El
// rol tutor está retirado del producto: no se referencia en el código y no
// hay filas que lo usen tras la migración de cierre del portal.
export const userRoleEnum = pgEnum('role', [
  'admin',
  'veterinario',
  'recepcionista',
  'tutor',
]);
```

- [ ] **Step 2: `permissions.ts` — quitar rol tutor, `getNavItems` y `STAFF_ROUTES`**

En `src/lib/permissions.ts`:
- Borrar la clave `tutor: [ ... ]` del objeto `permissions` (líneas ~59-68).
- En `getNavItems`, borrar la rama `if (role === 'tutor') { return [...] }` (líneas ~121-126) y su comentario.
- Borrar `export const STAFF_ROUTES = [ ... ];` (líneas ~99-111) y su comentario — deja de usarse tras el Step 3.

- [ ] **Step 3: `middleware.ts` — quitar el bloqueo por ruta de staff**

En `src/middleware.ts`:
- Borrar el import línea 5: `import { STAFF_ROUTES } from './lib/permissions';`
- Borrar el bloque de líneas ~106-118:

```ts
    // Bloquear tutores en rutas de staff (páginas de gestión interna).
    const role = (session.user as any).role;
    if (role === 'tutor') {
      const isStaffRoute = STAFF_ROUTES.some(
        (route) => pathname === route || pathname.startsWith(route + '/')
      );
      if (isStaffRoute) {
        if (pathname.startsWith('/api/')) {
          return jsonError(403, 'Acceso restringido');
        }
        return context.redirect('/dashboard');
      }
    }
```

Conservar el bloque de cuenta desactivada (`isActive === false`) que está justo antes.

- [ ] **Step 4: `Header.tsx`**

En `src/components/layout/Header.tsx`:
- `roleLabels` (líneas ~15-20): quitar `tutor: 'Tutor',`.
- Línea ~27: `const canSearch = userRole !== 'tutor';` → borrar la variable y usar la búsqueda siempre. Si `canSearch` se usa en el JSX para renderizar condicionalmente el buscador, quitar esa condición (ahora todos son staff). Leer contexto y simplificar.

- [ ] **Step 5: `UserList.tsx` — quitar tutor de labels y del selector**

En `src/components/admin/UserList.tsx`:
- `roleColors` / `roleLabels` (líneas ~7-16): quitar la entrada `tutor`.
- Líneas ~154-156: quitar `<option value="tutor">Tutor</option>`.

- [ ] **Step 6: `configuracion/index.astro` — quitar la tarjeta "Tutores"**

En `src/pages/configuracion/index.astro`, borrar el bloque de tarjeta (líneas ~33-36) que muestra `allUsers.filter(u => u.role === 'tutor').length`. Ajustar el grid si contaba columnas fijas.

- [ ] **Step 7: `userUpdateSchema` sin `tutor`**

En `src/lib/schemas.ts` línea ~278:

```ts
  role:     z.enum(['admin', 'veterinario', 'recepcionista']).optional(),
```

- [ ] **Step 8: Verificar typecheck**

Run: `npx astro check`
Expected: los usos de `user.role` compilan contra el union estrechado. Si aparece un `'tutor'` residual en algún `.astro`/`.tsx` no listado, corregirlo aquí.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: estrechar modelo de roles a admin/veterinario/recepcionista"
```

---

## Task 6: Quitar las ramas `tutor` de los endpoints de staff compartidos

**Files:**
- Modify: `src/pages/api/appointments/index.ts`, `src/pages/api/appointments/[id].ts`, `src/pages/api/medical/vaccines.ts`, `src/pages/api/patients/[id]/vaccine-card.ts`, `src/pages/api/patients/[id]/co-owners.ts`
- Delete: `src/lib/ownership.ts`

> Nota: NO tocar los `requireUnscopedPermission` — siguen sirviendo como defensa en profundidad (rechazan cualquier rol sin el permiso directo).

- [ ] **Step 1: `appointments/index.ts` GET**

Borrar el bloque (líneas ~36-43):

```ts
  // SEGURIDAD (IDOR): un tutor solo puede ver las citas de su propia ficha ...
  if (user!.role === 'tutor') {
    const [owner] = await db.select({ id: owners.id }).from(owners).where(eq(owners.userId, user!.id));
    if (!owner) return jsonOk([]);
    conditions.push(eq(appointments.ownerId, owner.id));
  }
```

Si tras esto `owners` deja de usarse en el archivo, quitar el import.

- [ ] **Step 2: `appointments/[id].ts`**

Leer el archivo completo. Quitar toda rama `if (user!.role === 'tutor')` en GET (líneas ~48-52) y en PUT/DELETE si existieran. El guard `requirePermission(user, 'appointments', ...)` ya cubre el acceso de staff.

- [ ] **Step 3: `medical/vaccines.ts` GET**

- Quitar el import línea 9: `import { canTutorAccessPatient } from '../../../lib/ownership';`
- Quitar el bloque líneas ~30-33:

```ts
  if (user!.role === 'tutor') {
    const allowed = await canTutorAccessPatient(user!.id, Number(patientId));
    if (!allowed) return jsonError(403, 'Sin permiso');
  }
```

- [ ] **Step 4: `patients/[id]/vaccine-card.ts` GET**

Reemplazar el bloque (líneas ~33-40):

```ts
  if (user.role === 'tutor') {
    const [owner] = await db.select().from(owners).where(eq(owners.userId, user.id));
    if (!owner || patient.ownerId !== owner.id) {
      return new Response('Sin permiso', { status: 403 });
    }
  } else if (!STAFF_ROLES.includes(user.role)) {
    return new Response('Sin permiso', { status: 403 });
  }
```

por:

```ts
  if (!STAFF_ROLES.includes(user.role)) {
    return new Response('Sin permiso', { status: 403 });
  }
```

Si `owners` deja de usarse, quitar el import.

- [ ] **Step 5: `patients/[id]/co-owners.ts` GET**

- Quitar el import línea 8: `import { canTutorAccessPatient } from '../../../../lib/ownership';`
- Quitar el bloque líneas ~22-25:

```ts
  if (user!.role === 'tutor') {
    const allowed = await canTutorAccessPatient(user!.id, patientId);
    if (!allowed) return new Response(JSON.stringify({ error: 'Sin permiso' }), { status: 403 });
  }
```

- [ ] **Step 6: Borrar `lib/ownership.ts`**

Run: `grep -rn "lib/ownership\|canTutorAccessPatient\|getOwnerIdForUser" src --include="*.ts" --include="*.tsx" | grep -v ".test."`
Expected: vacío. Entonces:

```bash
git rm src/lib/ownership.ts
```

- [ ] **Step 7: Verificar typecheck**

Run: `npx astro check`
Expected: sin errores por `lib/ownership`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: quitar ramas de rol tutor en endpoints de staff"
```

---

## Task 7: Podar y reescribir la suite de tests

**Files:**
- Modify: `src/lib/permissions.test.ts`, `src/pages/api/__tests__/roles.test.ts`, `src/pages/api/__tests__/idor-regression.test.ts`, `src/pages/api/__tests__/idor-regression-round3.test.ts`

@superpowers:test-driven-development — aquí el "test" es el propio suite: debe quedar verde y seguir protegiendo los invariantes de seguridad que sí siguen vigentes (staff RBAC, rechazo de rol sin permiso, "listado sin filtro no acepta rol solo-`:own`").

- [ ] **Step 1: `permissions.test.ts`**

- Borrar el `describe('tutor', ...)` completo (líneas ~62-88).
- En `describe('requiresOwnershipCheck')`, borrar los 3 casos `tutor → true ...` (líneas ~93-103).
- Añadir un caso nuevo en `describe('hasPermission')`:

```ts
  describe('rol desconocido / retirado', () => {
    it('niega todo para un rol que no existe en la tabla de permisos', () => {
      expect(hasPermission('tutor' as any, 'patients', 'read')).toBe(false);
      expect(hasPermission('desconocido' as any, 'appointments', 'read')).toBe(false);
    });
  });
```

- [ ] **Step 2: Ejecutar `permissions.test.ts`**

Run: `npx vitest run src/lib/permissions.test.ts`
Expected: PASS, sin referencias a `tutor` como rol válido.

- [ ] **Step 3: `roles.test.ts`**

- Cambiar `const tutorUser = { id: 'user-1', name: 'Cliente Test', email: 'tutor@test.com', role: 'tutor' };` por `role: 'desconocido'` y renombrar la constante a `outsiderUser` (y sus usos).
- Actualizar el texto de `describe(...)` y de los `it(...)`: "403 para rol sin permiso" en vez de "para rol tutor".
- Conservar los casos de veterinario/recepcionista → 403 en `/api/users`.

- [ ] **Step 4: `idor-regression.test.ts`**

- Quitar `vi.mock('../../../lib/ownership', ...)`, `canTutorAccessPatientMock` y todo lo que lo referencia (líneas ~34-35, ~66, y los `describe` "IDOR — GET /api/vaccines" e "IDOR — GET /api/patients/:id/co-owners" que dependían del scoping `:own`).
- Renombrar `tutorUser` → `outsiderUser` con `role: 'desconocido'`.
- Conservar y mantener verdes:
  - `C1` PUT/DELETE `/api/appointments/:id` → 403 para rol sin permiso; "permitido para recepcionista".
  - `C2` `/api/invoices/payment` → 403 rol sin permiso; permitido vet/recepcionista.
  - "Regresión — listados sin filtro" → 403 para `outsiderUser`.
  - `POST /api/owners` → 403 para `outsiderUser`.
- Los casos GET `/api/appointments/:id` "404 cuando la cita pertenece a OTRO tutor / 200 cuando SÍ pertenece" se eliminan (probaban scoping `:own` que ya no existe); conservar "200 para staff".

- [ ] **Step 5: `idor-regression-round3.test.ts`**

- `const tutorUser = { id: 'tutor-1', role: 'tutor' };` → `const outsiderUser = { id: 'x-1', role: 'desconocido' };` y renombrar usos.
- Cambiar los títulos del `describe`/`it` de "bloqueados para tutor" → "bloqueados para rol sin permiso".
- Conservar **intacto** el `describe('IDOR ronda 3 — el staff correspondiente sigue teniendo acceso', ...)`.

- [ ] **Step 6: Ejecutar toda la suite**

Run: `npm run test`
Expected: PASS. 0 fallos. Anotar el nº total de tests antes/después (bajará; documentar cuántos y por qué en el mensaje de commit).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: podar casos de rol tutor y re-enfocar en RBAC de staff"
```

---

## Task 8: Reemplazar el registro público por alta de usuarios interna (solo admin)

> Necesario porque el único camino de alta de cuentas era `/register` (siempre creaba `tutor`, luego un admin lo promovía). Sin esto, tras la Fase 1 no habría forma de crear staff desde la UI.

**Files:**
- Modify: `src/pages/api/users/index.ts` (añadir `POST`)
- Modify: `src/lib/schemas.ts` (añadir `userCreateSchema`)
- Create: `src/components/admin/NewUserDialog.tsx`
- Modify: `src/components/admin/UserList.tsx` (montar el diálogo)
- Test: `src/pages/api/__tests__/roles.test.ts` (caso nuevo)

- [ ] **Step 1: Escribir el test que falla**

En `src/pages/api/__tests__/roles.test.ts` añadir:

```ts
import { POST as usersPOST } from '../users/index';

describe('POST /api/users — alta interna', () => {
  it('403 para no-admin', async () => {
    const res = await usersPOST(makeContext({ ...outsiderUser, role: 'veterinario' }));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/pages/api/__tests__/roles.test.ts -t "alta interna"`
Expected: FAIL — `usersPOST is not a function` (aún no existe el export).

- [ ] **Step 3: `userCreateSchema`**

En `src/lib/schemas.ts`:

```ts
export const userCreateSchema = z.object({
  name:     z.string().min(1, 'El nombre es requerido').max(200),
  email:    z.string().email('Correo inválido').max(200),
  password: z.string().min(8, 'Mínimo 8 caracteres').max(100),
  role:     z.enum(['admin', 'veterinario', 'recepcionista']),
  phone:    z.string().max(30).optional().or(z.literal('')),
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;
```

- [ ] **Step 4: Handler `POST` en `src/pages/api/users/index.ts`**

Usar la API server-side de better-auth para crear la cuenta (hashea la contraseña y crea la fila `accounts`), y luego fijar el rol explícito. Seguir el patrón de guard del `GET` del mismo archivo (`ADMIN_ONLY.includes(user.role)`).

```ts
import { auth } from '../../../lib/auth';
import { userCreateSchema, zodError, parseJsonBody } from '../../../lib/schemas';
import { eq } from 'drizzle-orm';
import { users } from '../../../db/schema/users';
import { logAudit } from '../../../lib/audit';

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  if (!ADMIN_ONLY.includes(user.role)) {
    return new Response(JSON.stringify({ error: 'Sin permiso' }), { status: 403 });
  }

  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;
  const result = userCreateSchema.safeParse(parsed.data);
  if (!result.success) return zodError(result.error);
  const { name, email, password, role, phone } = result.data;

  const created = await auth.api.signUpEmail({
    body: { name, email, password, phone: phone || undefined },
  }).catch((e: any) => ({ error: e?.message ?? 'No se pudo crear la cuenta' }));
  if ('error' in created) {
    return new Response(JSON.stringify({ error: created.error }), { status: 400 });
  }

  const newId = (created as any).user?.id;
  await db.update(users).set({ role }).where(eq(users.id, newId));
  await logAudit({ userId: user.id, userName: user.name, action: 'user.create', entityType: 'user', entityId: newId, metadata: { email, role } });

  return new Response(JSON.stringify({ id: newId, email, role }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
```

Verificar que `db`, `ADMIN_ONLY` y `APIRoute` ya están importados en el archivo; si no, añadirlos. Confirmar la firma exacta de `auth.api.signUpEmail` con la versión de better-auth instalada (`grep '"better-auth"' package.json`; si la firma difiere, consultar `node_modules/better-auth` o la doc via el MCP de contexto).

> `disableSignUp: true` (Task 1) afecta al endpoint HTTP `/api/auth/sign-up`, no a `auth.api.signUpEmail` server-side. Verificar en la doc de la versión instalada; si también lo bloqueara, crear la fila con `db.insert(users)` + `auth.api` para setear credenciales, o el helper `auth.api.createUser` del plugin admin.

- [ ] **Step 5: Ejecutar el test**

Run: `npx vitest run src/pages/api/__tests__/roles.test.ts -t "alta interna"`
Expected: PASS (403 para no-admin).

- [ ] **Step 6: `NewUserDialog.tsx`**

Crear `src/components/admin/NewUserDialog.tsx`: formulario (`react-hook-form` + `zodResolver(userCreateSchema)`) con campos name/email/phone/password + `<select>` de rol (admin/veterinario/recepcionista). `POST /api/users`; on-success llama `onCreated()`. Seguir el estilo de los diálogos existentes en `src/components/dashboard/*` (usar `Button`, `Input`, `Label` de `src/components/ui`).

- [ ] **Step 7: Montar el diálogo en `UserList.tsx`**

Añadir `<NewUserDialog onCreated={reload} />` junto al encabezado de la lista, donde `reload` re-hace el `fetch('/api/users')` existente.

- [ ] **Step 8: Verificar typecheck + tests**

Run: `npx astro check && npm run test`
Expected: sin errores; suite verde.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: alta de usuarios interna solo-admin (reemplaza el registro publico)"
```

---

## Task 9: Migración de base de datos + seed

**Files:**
- Delete (efecto de Task 2): `src/db/schema/invites.ts` → drizzle detecta `DROP TABLE owner_invites`
- Create: `drizzle/migrations/XXXX_cierre_portal_tutores.sql` (data cleanup, a mano)
- Modify: `src/db/seed.ts`

@superpowers:verification-before-completion — ninguna afirmación de "migración aplicada" sin pegar la salida del comando.

- [ ] **Step 1: Generar la migración de esquema**

Run: `npm run db:generate`
Expected: un archivo nuevo en `drizzle/migrations/` con `DROP TABLE "owner_invites";` y `ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'recepcionista';`. Revisar el `.sql` generado — **no debe** contener nada que intente quitar el valor `'tutor'` del tipo enum `role` (si lo hace, editar el `.sql` para eliminar esas líneas; mantener `'tutor'` en el enum PG).

- [ ] **Step 2: Añadir la limpieza de datos a la migración**

Editar el `.sql` recién generado y anteponer (antes del `DROP TABLE`):

```sql
-- Cierre del portal de tutores: las cuentas de tutor se eliminan; sus fichas de
-- cliente (owners) se conservan, desvinculadas de cualquier login.
UPDATE "owners" SET "user_id" = NULL
  WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "role" = 'tutor');

DELETE FROM "users" WHERE "role" = 'tutor';
-- (sessions y accounts caen por ON DELETE CASCADE de su FK a users.id)
```

- [ ] **Step 3: Aplicar la migración**

Run: `npm run db:push` (o el flujo de aplicación de migraciones que use el proyecto — confirmar en `package.json` / README; `db:push` empuja el esquema, para SQL a mano puede requerir aplicarlo con `psql`/cliente Supabase).
Expected: sin error. Pegar la salida.

- [ ] **Step 4: Verificar el estado de la BD**

Run (via `npm run db:studio` o consulta directa):
```sql
SELECT role, count(*) FROM users GROUP BY role;
SELECT count(*) FROM owners WHERE user_id IS NULL;
SELECT to_regclass('owner_invites');  -- espera NULL
```
Expected: 0 filas con `role = 'tutor'`; `owner_invites` no existe.

- [ ] **Step 5: Limpiar `seed.ts`**

En `src/db/seed.ts`:
- Quitar del array `db.insert(users).values([...])` (líneas ~59-65) las 2 filas con `role: 'tutor'` (`client1Id`, `client2Id`).
- Buscar más abajo en el archivo usos de `client1Id` / `client2Id` (p. ej. al crear `owners` o `patients`): reemplazarlos por inserciones de `owners` **sin** `userId` (clientes sin cuenta), para que el seed siga poblando pacientes/citas de ejemplo. Leer el archivo completo antes de editar.

- [ ] **Step 6: Probar el seed en limpio**

Run: `npm run db:clean && npm run db:seed`
Expected: termina sin error; `SELECT role, count(*) FROM users GROUP BY role;` no muestra `tutor`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: migracion de cierre del portal — borrar cuentas tutor y tabla owner_invites"
```

---

## Task 10: Verificación final de la fase

@superpowers:verification-before-completion

- [ ] **Step 1: Grep de residuos de `tutor` como rol**

Run:
```bash
grep -rniE "role.*==.*'tutor'|'tutor'.*role|=== 'tutor'|role: 'tutor'|:read:own|:own\b|canTutorAccessPatient|getPortalData|ClientPortal|OwnerInviteButton|/api/client/|ownerInvites" src --include="*.ts" --include="*.tsx" --include="*.astro"
```
Expected: solo coincidencias en tests (los `'desconocido'`/comentarios) y el comentario intencional en `users.ts`. Cualquier otra cosa se corrige antes de cerrar.

- [ ] **Step 2: Typecheck**

Run: `npx astro check`
Expected: `0 errors`. Pegar la línea de resumen.

- [ ] **Step 3: Suite completa**

Run: `npm run test`
Expected: todos los archivos PASS. Pegar el resumen de vitest.

- [ ] **Step 4: Build de producción**

Run: `npm run build`
Expected: `astro build` termina sin error; no hay rutas rotas hacia `/register`, `/dashboard/mascota/[id]`, `/api/client/*`.

- [ ] **Step 5: Humo manual con el dev server**

Run: `npm run dev`, y con el navegador del panel:
- `GET /login` → sin enlace "Regístrate".
- `GET /register` → 404.
- `GET /dashboard/mascota/1` → 404.
- `GET /api/client/portal` → 404.
- Login como admin → `/dashboard` muestra el panel de staff; `/configuracion` sin tarjeta "Tutores"; `UserList` con botón "Nuevo usuario" y sin opción "Tutor" en el `<select>` de rol.
- `/tutores/1` → sin botón "Generar link de invitación".

Documentar cada resultado.

- [ ] **Step 6: Actualizar el grafo de conocimiento**

Run: `npx graphify hook-rebuild`
Expected: termina sin error (el CLAUDE.md del proyecto lo pide tras modificar código).

- [ ] **Step 7: Commit final / tag de fase**

```bash
git add -A
git commit -m "chore: cierre de la Fase 1 — portal de tutores eliminado" --allow-empty
```

---

## Riesgos y notas para el implementador

- **`auth.api.signUpEmail` vs `disableSignUp`** (Task 8): el punto más incierto. Verificar contra la versión instalada de better-auth *antes* de escribir el handler; si `disableSignUp` también bloquea la llamada server-side, usar el plugin `admin` de better-auth (`auth.api.createUser`) o inserción directa + credenciales. Es lo único que puede requerir consultar doc externa (usar el MCP de contexto de librerías).
- **Enum de Postgres**: NO intentar quitar `'tutor'` del tipo `role` en esta fase. Quitar un valor de un enum PG obliga a recrear el tipo y reescribir la columna; el valor huérfano es inocuo. Si se quiere limpiar, va en un plan de mantenimiento aparte.
- **Orden de la migración**: primero `UPDATE owners` (desvincular), luego `DELETE users` (cascada a sessions/accounts), luego `DROP TABLE owner_invites`. Si se invierte, el `DELETE` puede chocar con la FK `owners.user_id`.
- **`owners.userId`**: se conserva la columna (nullable). Retirarla es cosmético y va en otra fase.
- **Co-tutores**: si el negocio confirma que tampoco quiere `patient_co_owners`, es un plan separado; este no depende de esa decisión.
- **Backups**: correr `npm run db:backup` antes de la Task 9.
