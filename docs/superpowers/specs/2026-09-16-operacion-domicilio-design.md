# Operación veterinaria a domicilio

Diseño autorizado por «implementa todo», después de la revisión del proyecto.

## Resultado

La visita concentra antecedentes, nota clínica, insumos, fotos, cobro, resumen y seguimiento. La navegación principal es Hoy, Agenda, Pacientes, Botiquín y Cobros. Responsables se gestionan dentro de Pacientes; se conservan sus datos y las rutas antiguas por compatibilidad.

## Decisiones

- Mantener Astro, React, Drizzle y PostgreSQL y la identidad visual existente.
- Hoy muestra la jornada del veterinario autenticado; administración/recepción conserva visión de equipo. Usar explícitamente America/Santiago.
- Un espacio de atención por cita permite registrar consulta y cobro, ver antecedentes, completar la visita, descargar/imprimir un resumen y programar control conservando paciente/responsable.
- Guardar una atención mediante una operación transaccional con identificador estable. Los reintentos devuelven el resultado original y nunca descuentan stock ni registran pagos dos veces. Ante conflicto de stock o datos, conservar la operación local y mostrar el error.
- El trabajo sin conexión requiere preparar la jornada en el dispositivo. Guardar solo datos de la jornada por usuario; una página pública sin datos y un service worker permiten abrir la copia local. Borrar datos locales al cerrar sesión y aislar usuarios. Mostrar antigüedad y estado de sincronización. No cachear HTML autenticado ni respuestas de API en el service worker.
- El cobro offline es registro de efectivo/transferencia ya recibido, pendiente de validación del servidor. Los enlaces de proveedores de pago y documentos PDF de servidor necesitan conexión. El resumen de visita puede imprimirse localmente.
- Corregir los formularios existentes: permisos coherentes, contexto, edición/preselección, dirección, errores de red y tipos. Actualizar documentación y añadir pruebas de los recorridos críticos.
- Preparar una migración SQL aditiva y revisable. No ejecutar migraciones contra una base externa ni publicar ni hacer commits en esta tarea.

## Verificación

Pruebas de agenda por usuario/horario, preselección y permisos; operaciones idempotentes con rollback; colas offline por usuario, errores y reintentos; tipo y build completos. Revisión independiente del cambio final. Métricas iniciales: pendientes de cierre, pendientes de cobro y tiempo entre inicio y cierre de visita.
