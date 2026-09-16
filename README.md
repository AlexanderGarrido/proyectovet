# Alma Veterinaria

Aplicación operativa para veterinarios a domicilio. La visita reúne antecedentes, nota clínica, fotos, insumos, cobro y resumen para el responsable. El menú principal es **Hoy · Agenda · Pacientes · Botiquín · Cobros**.

Los responsables se gestionan dentro de Pacientes. No existe registro público ni portal de tutores. Las fichas `owners` se conservan para contactos, domicilios y cobros.

**Stack:** Astro 6 SSR, React 19, Tailwind 4, Drizzle, Better Auth, PostgreSQL/Supabase y Vercel.

## Desarrollo

```sh
npm install
cp .env.example .env
npm run dev
```

Configurar `DATABASE_URL`, `DIRECT_URL`, `BETTER_AUTH_SECRET` y `BETTER_AUTH_URL`. Usar una base de desarrollo separada. `db:seed` y `db:clean` modifican datos; no son parte de los comandos de verificación.

## Actualizar una instalación existente

Antes de desplegar este cambio, aplicar con conexión directa y respaldo previo:

- [Migración de operación a domicilio](docs/migrations/2026-09-16-operacion-domicilio.sql): tiempos de atención, marca de atención sin costo y comprobantes de operaciones idempotentes.
- [Migración anterior de cierre del portal](docs/migrations/2026-09-01-cierre-portal-tutores.sql), solo si sigue pendiente. Esta migración anterior elimina cuentas de tutores; revisar sus instrucciones y datos antes de ejecutarla.

La migración nueva es aditiva; no elimina responsables, pacientes ni historiales. El código nuevo requiere esas columnas/tablas antes de iniciar. No se aplican migraciones automáticamente durante build.

## Trabajo en terreno

En **Hoy**, seleccionar **Preparar sin conexión** mientras hay señal. En el mismo dispositivo se podrá abrir la jornada, iniciar una visita, redactar su atención y dejarla pendiente para sincronizar. El resumen local se puede imprimir/guardar como PDF; mientras está pendiente lleva una marca de borrador.

La sincronización se realiza con la aplicación abierta al recuperar conexión o al pulsar **Sincronizar**. Un conflicto de stock/datos conserva el borrador y requiere revisión. Cerrar sesión borra los datos locales de la cuenta; la interfaz advierte si hay operaciones pendientes.

Los documentos de servidor, enlaces de pago y programación de controles requieren conexión. El modo sin conexión se verifica sobre una compilación de producción servida por HTTPS o localhost.

## Verificación

```sh
npm test
npx astro check
npm run build
```

Los tests usan mocks y almacenamiento IndexedDB de prueba, sin escribir a una base real. Detalle de operación y prueba manual en [DOCUMENTACION.md](DOCUMENTACION.md). Modelo de permisos y sincronización en [SECURITY.md](SECURITY.md).
