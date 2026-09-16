# Seguridad de Alma Veterinaria

## Acceso

La aplicación es de uso interno: `admin`, `veterinario`, `recepcionista`. Better Auth valida sesiones y el middleware bloquea cuentas desactivadas y roles ajenos al equipo. El registro público está deshabilitado; el administrador crea cuentas internamente.

El modelo de permisos está en `src/lib/permissions.ts`. El veterinario puede gestionar pacientes y responsables, documentar atención, usar botiquín y registrar cobros. La nueva jornada y el espacio de visita restringen al veterinario a citas asignadas. Administración y recepción conservan visión de equipo; las notas clínicas de la jornada solo se incluyen para administración/veterinario. Recepción no puede escribir notas ni cerrar la atención clínica en el endpoint nuevo.

Las fichas `owners` no son cuentas de acceso. Conservarlas mantiene contactos, domicilios y relaciones con mascotas y facturas.

## Escrituras e integridad

- Esquemas Zod para datos de operaciones y formularios. Las APIs de citas comprueban relación paciente/responsable, veterinario y solapamientos.
- Drizzle parametriza las consultas. Las citas y cobros se bloquean dentro de la transacción antes de verificar versiones/saldos.
- `visit_operations` conserva clave de usuario + UUID, hash y resultado. Los reintentos exactos son idempotentes; reutilizar una clave con otro contenido produce conflicto.
- La consulta, fotos, stock, cobro, pago y estado de una operación se confirman o revierten juntos. El stock no puede quedar negativo.
- El endpoint de sincronización exige `X-Field-User` igual a la sesión actual. Una operación de una cuenta no se envía como otra cuenta después de un cambio de sesión.
- Los pagos manuales y webhook de Mercado Pago bloquean la factura antes de releer pagos. El webhook verifica firma y consulta el pago al proveedor; una referencia ya procesada no se registra nuevamente.

## Datos en el dispositivo

Solo “Preparar sin conexión” descarga la jornada. Los datos y borradores usan claves por usuario en IndexedDB. Las pantallas escuchan cambios de identidad y se ocultan al cerrar/cambiar sesión en otra pestaña. Al cerrar sesión se eliminan los datos de campo de esa cuenta; se solicita confirmación si ello descartaría operaciones pendientes.

El service worker cachea la página pública sin datos y recursos de aplicación, nunca HTML autenticado ni APIs. La copia local contiene información clínica y de contacto: utilizar dispositivos del equipo con bloqueo de pantalla. No se proporciona cifrado local adicional al almacenamiento del navegador. Borrar datos del navegador elimina borradores y pendientes no sincronizados.

Los borradores del formulario médico histórico tienen claves por usuario en su almacén separado; no se deben confundir con operaciones sincronizadas de visita.

## Protecciones HTTP y límites

Middleware añade CSP, HSTS, X-Frame-Options, X-Content-Type-Options y Referrer-Policy. Los límites de solicitudes usan PostgreSQL: 10/min para autenticación y 60/min para escrituras por IP. El limitador existente permite continuar si su consulta falla; no es una garantía de bloqueo durante una interrupción de la base.

Las rutas públicas especiales son login/auth, cron con su secreto, webhook con firma y shell offline sin datos. No registrar payloads clínicos en logs. No versionar `.env`, respaldos ni datos reales de pruebas.

## Verificación

Ejecutar `npm test`, `npx astro check`, `npm run build` y los recorridos de `DOCUMENTACION.md` en staging. Las pruebas de transacciones usan mocks y verifican la coordinación del código; la prueba contra PostgreSQL real forma parte de la validación previa al despliegue.
