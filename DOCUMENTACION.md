# Operación de Alma Veterinaria

## Recorrido diario

1. **Hoy:** ver visitas propias si se inicia como veterinario, o la jornada del equipo como administración/recepción. Destaca la atención en curso o la primera pendiente, incluso si su horario ya pasó. Los límites del día se calculan en `America/Santiago`.
2. **Preparar sin conexión:** descarga una copia acotada de las visitas del día, contactos, hasta 20 antecedentes y vacunas por paciente, cobros y stock disponible. La fecha de preparación queda visible.
3. **Visita:** desde la cita se puede navegar al domicilio, llamar o preparar un WhatsApp. Iniciar atención registra la hora para calcular tiempos.
4. **Atención:** redactar nota clínica, signos vitales, fotos e insumos. Los responsables se crean/editan desde la ficha o alta de paciente; no requieren cuenta propia.
5. **Cobro y cierre:** registrar el servicio y, opcionalmente, un pago ya recibido. También se puede cerrar dejando saldo pendiente o indicando atención sin costo. La consulta es necesaria para cerrar.
6. **Resumen:** imprimir/guardar como PDF desde el navegador, descargar texto o abrir WhatsApp para revisar y enviar manualmente. El resumen contiene motivo, evaluación e indicaciones; no incluye las observaciones internas.
7. **Seguimiento:** “Programar control” abre la agenda con paciente y profesional en contexto. Recetas, laboratorio y consentimientos conservan paciente, registro clínico cuando existe y enlace de regreso.

## Navegación

| Principal | Contenido |
|---|---|
| Hoy | Jornada, visita actual, pendientes, saldos y tiempo promedio |
| Agenda | Lista/calendario, alta, edición y acceso a la visita |
| Pacientes | Ficha, responsable, vacunas, recetas, laboratorio, consentimientos |
| Botiquín | Inventario, ubicaciones y movimientos |
| Cobros | Servicios emitidos, pagos y acceso autorizado a reportes |

Las rutas históricas de responsables/documentos se conservan para compatibilidad. Administración mantiene Configuración y Reportes en un nivel secundario.

## Guardado y funcionamiento sin conexión

La jornada y los borradores se guardan en IndexedDB por usuario. Solo una sesión autenticada activa una identidad local. Las pantallas detectan cierre/cambio de sesión en otras pestañas y dejan de mostrar la jornada anterior.

El service worker almacena exclusivamente la página pública `/sin-conexion` y sus recursos estáticos. No almacena HTML de páginas autenticadas ni respuestas de API. Sin señal, una navegación abre la página pública y esta lee la copia local del usuario activo.

- **Borrador:** autoguardado local después de escribir y guardado inmediato al regresar a la jornada desde la vista offline. “Guardar borrador” permite seguir trabajando sin señal.
- **Pendiente:** una atención cerrada localmente espera confirmación. El inicio y el cierre pueden quedar en cola en ese orden.
- **Sincronizado:** el servidor confirma la operación y la copia local se actualiza antes de retirar el pendiente.
- **Revisión requerida:** un conflicto de versión, stock, permiso o saldo conserva los datos. Revisar la versión actual, corregir y guardar de nuevo.

Cada operación utiliza un UUID estable, un hash de sus datos y una transacción de base de datos. Reenviar la misma operación devuelve su resultado original. Un inicio anterior puede ser referenciado por el cierre: la versión se toma de su comprobante confirmado. Cambios posteriores realizados desde otro dispositivo producen conflicto, no sobrescritura silenciosa.

La transacción cubre nota clínica, fotos, consumo de stock, cobro, pago y estado. Los cobros tradicionales también bloquean la misma cita/factura para evitar carreras con el nuevo espacio de atención.

**Límites deliberados:** la copia es de la jornada preparada, no de toda la base. Una jornada antigua se identifica como tal. Hace falta abrir la aplicación para sincronizar; no se promete sincronización con el navegador cerrado. Una sesión vencida exige volver a iniciar con la misma cuenta. Los controles nuevos, documentos PDF del servidor y proveedores de pago requieren señal. Un pago registrado offline no ejecuta un cobro bancario: registra dinero ya recibido.

## Métricas operativas

Hoy muestra visitas por atender/completadas, saldo de los cobros de esas visitas y promedio entre `started_at` y `completed_at`. Las atenciones anteriores a esta versión sin esos tiempos no intervienen en el promedio. Un inicio/cierre capturado sin conexión se fecha al confirmarse en servidor; no debe interpretarse como cronometraje exacto del trabajo offline.

## Componentes y endpoints

- `src/components/visits/`: jornada, espacio de atención, resumen y shell offline.
- `src/lib/visits.ts`: lectura de jornada/ficha limitada por rol y veterinario.
- `src/lib/save-visit.ts`: transacción clínica/stock/cobro y comprobante de idempotencia.
- `src/lib/field-storage.ts`: almacenamiento local, cola y sincronización.
- `src/lib/clinic-time.ts`: horario local con cambios estacionales.
- `GET /api/jornada`: jornada del día.
- `GET /api/visits/:id`: contexto de visita para el usuario autorizado.
- `POST /api/visits/:id/sync`: operación validada; exige que `X-Field-User` coincida con la sesión.
- Los endpoints existentes de pacientes, responsables, citas, inventario, documentos y pagos siguen operativos.

## Instalación y despliegue

Configurar conexión PostgreSQL (`DATABASE_URL`; pooler con `prepare:false`), conexión directa para migración (`DIRECT_URL`), autenticación (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`). Mercado Pago y Sentry son integraciones opcionales según sus variables de entorno.

Respaldar y aplicar `docs/migrations/2026-09-16-operacion-domicilio.sql` antes de desplegar. Añade `started_at`, `completed_at`, `no_charge`, `visit_operations` e índices por cita. No es necesario borrar datos ni recrear usuarios para este cambio. El cierre antiguo de cuentas de tutores tiene su propia migración y no se ejecuta automáticamente.

## Verificación manual en una base de prueba

1. Crear paciente y responsable sin correo; crear cita desde su ficha y verificar dirección, paciente y profesional.
2. Editar cita existente; verificar valores iniciales y rechazo de solapamientos.
3. Entrar como veterinario y comprobar que Hoy/Agenda muestran sus visitas; comprobar recepción y administración por separado.
4. Preparar jornada; desactivar red, recargar la URL de una visita, iniciar atención, escribir nota/fotos/insumos y regresar inmediatamente. Comprobar recuperación del borrador.
5. Completar atención con cobro o sin costo; imprimir resumen marcado como pendiente. Restaurar señal y comprobar una sola nota, consumo y pago aun reenviando la operación.
6. Repetir con falta de stock, saldo cambiado o cita editada desde otro dispositivo. Debe conservarse el borrador y mostrarse la revisión requerida.
7. Abrir una segunda pestaña; cerrar sesión en la primera. La jornada anterior debe dejar de mostrarse y no volver a activar la cuenta vieja.
8. Comprobar descarga de receta/laboratorio/consentimiento y control preseleccionado con conexión.

Las pruebas automatizadas cubren contratos, permisos, horario, cola, idempotencia y transacciones simuladas. La prueba de navegador con fixtures verifica la interfaz móvil y service worker; no sustituye probar la migración y los efectos transaccionales contra PostgreSQL de staging.
