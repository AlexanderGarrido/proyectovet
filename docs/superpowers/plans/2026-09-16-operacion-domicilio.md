# Operación a domicilio — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for isolated tasks. No commits or database mutations. Steps use checkboxes for tracking.

**Goal:** Completar desde el móvil la jornada, atención, cobro y seguimiento de visitas, con protección ante cortes de conexión.

**Architecture:** Mantener endpoints y formularios actuales. Añadir una lectura agregada de jornada y un espacio de visita con operación transaccional idempotente y cola local. Compartir tipos de jornada entre servidor, UI y almacenamiento offline.

**Tech Stack:** Astro 6, React 19, Drizzle, PostgreSQL, IndexedDB, service worker, Vitest.

**Spec:** docs/superpowers/specs/2026-09-16-operacion-domicilio-design.md

## Global Constraints

- No commits, cambios de rama, despliegues ni migraciones externas.
- Conservar owners y relaciones clínicas; menú de cinco entradas principales.
- America/Santiago; operaciones offline aisladas por usuario e idempotentes.
- No cachear HTML autenticado ni API en el service worker.

## Task 1: Navegación, responsables y formularios existentes

- [x] Simplificar permissions/getNavItems, añadir accesos secundarios contextuales desde Pacientes y Cobros.
- [x] Integrar alta/edición del responsable en ficha/alta de paciente; conservar enlaces de compatibilidad.
- [x] Corregir AppointmentForm: cargar cita al editar, paciente preseleccionado al crear/control, dirección, conservar profesional al editar, errores de red.
- [x] Corregir InvoiceForm: recibir y validar contexto de cita/owner, transmitir appointmentId, errores de red.
- [x] Conservar contexto en receta/laboratorio/consentimiento y retorno a visita.
- [x] Probar lógica de contexto y navegación; informar archivos y resultados.

## Task 2: Jornada, visita y sincronización (controlador)

- [x] Crear tipos `VisitSnapshot`, `DaySnapshot`, `VisitOperation` compartidos y utilidades de día en Santiago.
- [x] Crear tablas de operaciones y tiempos de cita + migración aditiva.
- [x] Crear `/api/jornada` y `/api/visits/[id]` con lecturas limitadas y permisos por rol; historia, cobros y stock real.
- [x] Crear `/api/visits/[id]/sync`: transacción, bloqueo de cita, clave por usuario, hash del payload, validación de pertenencia, descuento de stock atómico, cobro y estado consistentes.
- [x] Crear inicio Hoy y espacio de atención móvil con antecedentes, formulario, fotos, insumos, cobro, resumen imprimible y seguimiento.
- [x] Implementar almacenamiento por usuario, cola ordenada, reintentos sin duplicados, errores recuperables, página offline pública y service worker de shell sin datos.
- [x] Probar días/horarios, validación, operaciones duplicadas, saldo, stock y cola.

## Task 3: Calidad y cierre

- [x] Corregir errores existentes de tipos y de guardado de pacientes; resolver inconsistencias de permisos.
- [x] Documentar nuevo flujo, migración, preparación offline, límites y pruebas manuales.
- [x] Ejecutar Vitest, astro check y build; revisar integración y corregir hallazgos.
- [x] Ejecutar `npx graphify hook-rebuild`; no incluir artefactos locales de graphify en cambios propuestos.

## Registro de ejecución

Ruling: trabajar en el checkout actual y dejar cambios sin commit, según instrucciones de git del usuario. La aprobación del diseño está en «implementa todo»; no se requiere reconfirmar.

Ruling: un único subagente implementador por vez y controlador en archivos separados. Formularios y navegación no comparten archivos con el espacio nuevo de atención. Los tipos de jornada y operaciones son responsabilidad del controlador.

| Interfaz / tarea | Comprobación |
|---|---|
| 1 → 2 | Rutas de cita y query `patientId`, `appointmentId`, `ownerId`, `returnTo` conservadas. |
| 2 → 3 | Migración aditiva y casos offline se documentan y prueban después de integrar. |
| 1 | Pruebas de comportamiento de contexto/nav; sin cambios a tablas de operaciones. |
| 2 | Única operación estable para efectos clínicos/stock/pago, sin efectos externos al reintentar. |
| 3 | Verificar cambio completo y base existente; no desplegar. |


## Cierre de implementación — 16 de septiembre de 2026

- Vitest: 21 archivos, 241 pruebas aprobadas. Incluye contratos formulario/API, permisos, calendario, pagos, transacciones simuladas e IndexedDB.
- `astro check`: 0 errores, 0 warnings, 57 hints no bloqueantes.
- `npm run build`: compilación de producción completada, incluida la página pública sin conexión.
- Navegador Edge móvil (390 × 844), servido desde el build con datos ficticios: preparación del service worker, recarga de visita sin red, inicio y cierre en cola, recuperación al volver inmediatamente, envío ordenado al recuperar señal y aislamiento entre pestañas.
- Prueba adicional de sincronización manual del inicio: conserva el borrador clínico que se está escribiendo.
- PDF local: una página con marca de borrador e indicaciones, sin la navegación de la aplicación.
- Revisión independiente: corregidos los hallazgos de pérdida de borrador y las carreras de cobro; verificados nuevamente los recorridos afectados.
- `git diff --check`: sin errores de espacios. Los avisos de normalización LF/CRLF corresponden a la configuración local de Git.
- `npx graphify hook-rebuild`: ejecutado, pero falla con `could not determine executable to run`. El grafo local no se pudo regenerar; no se propone ni se incluye como parte del cambio.

### Antes de producción

Aplicar y verificar la migración aditiva `docs/migrations/2026-09-16-operacion-domicilio.sql` en una base de pruebas antes de desplegar. Las transacciones se probaron con mocks; no se ejecutó una migración ni se modificó una base externa. Los escenarios de navegador usan fixtures y no sustituyen la prueba integrada con autenticación y PostgreSQL real. Cambios locales sin commit ni despliegue.

### Actualización posterior: migración aplicada

El 16 de septiembre de 2026, con la autorización explícita «aplica la migracion», se aplicó la migración a la base configurada en `DIRECT_URL`. Se guardó previamente un snapshot JSON consistente de las 26 tablas del esquema público en `backups/pre-operacion-domicilio-2026-09-16T07-20-23-187Z.json`, excluido de Git. Este snapshot contiene datos y metadatos del esquema público; no es un respaldo completo de toda la plataforma Supabase.

La migración se confirmó en una transacción y después se verificaron las tres columnas de citas, la tabla `visit_operations`, su clave primaria y foránea y los dos índices por cita. SHA-256 del SQL aplicado: `7c974caf39593a7fbe289a1ef0510fa97bfa0ca9a2525e591102419e35d09e14`. Queda pendiente el despliegue de la aplicación y su validación funcional integrada; no se ejecutó la migración antigua de eliminación de cuentas de tutores.
