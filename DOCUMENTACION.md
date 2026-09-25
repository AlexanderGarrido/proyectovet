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
| Agenda | Lista, calendario y recorrido del día |
| Pacientes | Ficha, cronología, responsable, vacunas, recetas, laboratorio, consentimientos |
| Botiquín | Preparación del día, inventario, ubicaciones y movimientos |
| Cobros | Servicios emitidos, pagos y acceso autorizado a reportes |

En móvil las cinco áreas están en una barra inferior filtrada por permisos; en escritorio se conserva el menú lateral. El destino de Botiquín depende del rol: un veterinario llega a su botiquín asignado, administración y recepción al inventario general.

Las rutas históricas de responsables/documentos se conservan para compatibilidad. Administración mantiene Configuración y Reportes en un nivel secundario.

Todas las horas de la agenda, el calendario y la jornada se calculan en `America/Santiago` mediante `clinic-time.ts`, no con el reloj del dispositivo: un teléfono configurado en otra zona muestra las mismas horas.

## Atención: plantillas, antecedentes y cronología

Cada tipo de visita ofrece una plantilla que ordena los campos y sugiere frases. La plantilla aporta estructura y texto editable; **no rellena hallazgos, diagnósticos ni tratamientos**. Un campo vacío queda como no registrado, que no es lo mismo que normal. La nota guarda con qué plantilla y versión se redactó, de modo que editarla después no cambia cómo se lee una consulta anterior.

La cabecera de la visita muestra especie, peso con su fecha de medición, última atención y las alertas registradas para ese paciente. «Sin alertas registradas» y «no se pudieron cargar las alertas» se muestran distinto a propósito: llevan a decisiones opuestas frente a un paciente que podría morder.

`GET /api/patients/:id/timeline` reúne consultas, citas, vacunas, recetas, laboratorio, documentos, cobros y comunicaciones en una sola lista paginada por cursor (`fecha|clave`), con filtros por tipo y permisos aplicados en el servidor: recepción no lee la nota clínica aunque pida ese filtro.

Una corrección posterior al cierre se registra como adenda —un registro nuevo que apunta al original, con autor y fecha—; la nota original nunca se reescribe.

## Prestaciones y cobro

El catálogo de `services` define qué se hace, cuánto cuesta y qué insumos consume. Seleccionar una prestación prepara una propuesta editable: **no mueve stock ni emite cobro hasta confirmar**. El importe lo calcula el servidor con la tarifa vigente; el cliente solo declara qué se realizó y en qué cantidad, así que una copia con precios antiguos no puede fijar el monto.

Un paquete se cobra a su propio precio como una línea; sus prestaciones hijas aportan insumos e indicaciones, no líneas adicionales. Cada prestación realizada queda en `visit_service_items` con el precio del momento y el identificador de la operación que la creó: es la referencia única que impide que la misma atención se cobre otra vez desde el formulario general de facturación. La visita y el formulario general comparten el catálogo y el mismo componente de cálculo.

La pantalla distingue tres hechos distintos: prestación realizada, cobro emitido y pago recibido. Alma emite un documento interno; cualquier integración tributaria es otro proyecto.

## Recorrido y varias mascotas en un domicilio

La cita admite sector y colchón de traslado declarados a mano, y la validación de solapamientos los considera: dos visitas seguidas en extremos opuestos de la ciudad dejan de verse como compatibles. Ningún proveedor de rutas participa; la agenda funciona sin depender de un servicio externo.

Una parada agrupa las citas de un mismo domicilio, **solo cuando el operador lo indica**: dos pacientes con el mismo apellido no comparten casa por sí solos. Cada mascota conserva su consulta y su cobro; el traslado se atribuye a una sola visita del grupo y queda visible allí, sin repartirse entre responsables distintos. Reordenar cambia el orden del recorrido, nunca el horario de una cita confirmada.

## Pendientes y seguimiento

`followup_tasks` guarda lo que queda por hacer con responsable, vencimiento y paciente. Cerrar una consulta con saldo no la deja incompleta: genera una tarea de cobro, que es otra cosa. Las tareas derivadas del cierre se crean en la misma transacción y llevan una clave de origen única, de modo que reenviar la operación o procesar una cola antigua no las duplica.

Los estados de comunicación son deliberadamente conservadores: *preparado* y *declarado enviado manualmente*. Abrir un enlace de WhatsApp no envía el mensaje ni acredita su entrega; el estado *entregado* solo podría escribirlo una integración que lo pruebe, y hoy no existe ninguna.

## Preparación del botiquín

`GET /api/inventory/kit` calcula faltantes sobre las existencias **del servidor**, no sobre la copia del dispositivo, y separa tres cosas: lo disponible, el mínimo del producto y lo que exige el plan del día. Declara además cuántas visitas no tienen prestaciones planificadas, para que una lista corta no se lea como tranquilizadora. Planificar prestaciones no cobra ni descuenta nada.

## Guardado y funcionamiento sin conexión

La jornada y los borradores se guardan en IndexedDB por usuario. Solo una sesión autenticada activa una identidad local. Las pantallas detectan cierre/cambio de sesión en otras pestañas y dejan de mostrar la jornada anterior.

El service worker almacena exclusivamente la página pública `/sin-conexion` y sus recursos estáticos. No almacena HTML de páginas autenticadas ni respuestas de API. Sin señal, una navegación abre la página pública y esta lee la copia local del usuario activo.

- **Borrador:** autoguardado local después de escribir y guardado inmediato al regresar a la jornada desde la vista offline. “Guardar borrador” permite seguir trabajando sin señal.
- **Pendiente:** una atención cerrada localmente espera confirmación. El inicio y el cierre pueden quedar en cola en ese orden.
- **Sincronizado:** el servidor confirma la operación y la copia local se actualiza antes de retirar el pendiente.
- **Revisión requerida:** un conflicto de versión, stock, permiso o saldo conserva los datos. Revisar la versión actual, corregir y guardar de nuevo.

Cada operación utiliza un UUID estable, un hash de sus datos y una transacción de base de datos. Reenviar la misma operación devuelve su resultado original. Un inicio anterior puede ser referenciado por el cierre: la versión se toma de su comprobante confirmado. Cambios posteriores realizados desde otro dispositivo producen conflicto, no sobrescritura silenciosa.

La transacción cubre nota clínica, fotos, consumo de stock, cobro, pago y estado. Los cobros tradicionales también bloquean la misma cita/factura para evitar carreras con el nuevo espacio de atención.

La copia diaria declara su cobertura: cuántas visitas trajo, cuántos antecedentes por paciente, si algo quedó recortado y qué requiere conexión. Una truncación nunca debe leerse como historial completo.

El centro de sincronización lista cada operación pendiente con su paciente, antigüedad, último intento y qué le pasó, distinguiendo cuatro resultados: fallo transitorio (reintentar es seguro), sesión vencida, rechazo confirmado (corregir y volver a guardar) y **resultado desconocido** (no se sabe si el servidor la aplicó, así que se reenvía el mismo identificador y no se descarta). Varias pestañas se avisan entre sí y solo una envía a la vez.

Las operaciones registran `occurredAt` —hora declarada por el dispositivo, que puede venir de un reloj desajustado— y `receivedAt`, la del servidor. Se guardan separadas porque solo la segunda es comprobable, y los tiempos del cliente no ordenan por sí solos decisiones de dinero o inventario.

Una versión nueva de la aplicación no reemplaza a la que controla pestañas abiertas mientras queden guardados pendientes: el cambio se aplica cuando la cola está vacía.

**Límites deliberados:** la copia es de la jornada preparada, no de toda la base. Una jornada antigua se identifica como tal. Hace falta abrir la aplicación para sincronizar; no se promete sincronización con el navegador cerrado. Una sesión vencida exige volver a iniciar con la misma cuenta. Los controles nuevos, documentos PDF del servidor y proveedores de pago requieren señal. Un pago registrado offline no ejecuta un cobro bancario: registra dinero ya recibido.

## Atención sin cita

Administración y veterinarios pueden atender a cualquier paciente activo sin haberlo agendado: «Atender ahora» en la ficha del paciente, o «Atender sin cita» en Hoy y en el modo sin conexión. Se abre el mismo espacio de atención de una visita agendada —nota, insumos, prestaciones, cobro, pago y cierre—, ya en curso.

Por debajo se crea una cita con `origin = 'sin_cita'` a la hora real de inicio, mediante `POST /api/visits/open`: una operación con UUID y comprobante, igual que las demás, así que reintentarla no crea otra atención. No se bloquea por solapamientos (ya ocurrió), pero las citas que se agenden después sí la cuentan como tiempo ocupado. Al cerrarla, su hora de fin pasa a ser la real. La agenda, Hoy y el centro de sincronización la muestran con la etiqueta «Sin cita».

- **Con señal:** la apertura va directo al servidor y la pantalla lleva a `/citas/:id`.
- **Sin señal:** la copia del día trae un directorio de pacientes activos (hasta 2000, con alertas y sus 3 últimas consultas y vacunas; solo para administración y veterinarios). La visita nace en el dispositivo con un número provisorio negativo; la apertura queda primera en la cola y la nota se encadena a ella. Al sincronizar, el servidor entrega el número real y el dispositivo lo reemplaza en la cola, el borrador y la copia; si se corta a la mitad, lo retoma en el siguiente envío. Si la apertura se rechaza (por ejemplo, el paciente se desactivó), la apertura y lo que depende de ella quedan en «Revisión requerida» y el borrador se conserva.

**Descartar.** Una atención sin cita (o consulta pasada) abierta por error se descarta con «Descartar atención», mientras no tenga nota, cobro ni guardados en cola más allá de su apertura. Se borra por completo; no queda como cancelada. Si todavía no llegó al servidor, solo se retira del dispositivo; si ya llegó, `POST /api/visits/:id/discard` revalida todo en una transacción y la borra (requiere señal).

**Consulta pasada.** «Registrar consulta pasada» (pestaña Consultas de la ficha) pide fecha y hora y abre el mismo espacio de atención, con `origin = 'pasada'`: la nota clínica toma esa fecha (se ordena bien en la cronología), cerrar no mueve la hora de fin y no cuenta en el promedio de duración de la jornada porque no se midió en vivo. Acepta cualquier fecha pasada y requiere señal. El formulario anterior (`/historial/nuevo`) se eliminó.

## Métricas operativas

Hoy muestra visitas por atender/completadas, saldo de los cobros de esas visitas y promedio entre `started_at` y `completed_at`. Las atenciones anteriores a esta versión sin esos tiempos no intervienen en el promedio. Un inicio/cierre capturado sin conexión se fecha al confirmarse en servidor; no debe interpretarse como cronometraje exacto del trabajo offline.

## Componentes y endpoints

- `src/components/visits/`: jornada, espacio de atención (controlador `useVisitDraft` + vistas `VisitHeader`, `ClinicalNote`, `SuppliesEditor`, `VisitHistory`, `VisitCheckout`), centro de sincronización, cobertura, pendientes y resumen.
- `src/components/layout/MobileNavigation.tsx`: barra inferior por permisos; `src/components/common/SyncStatus.tsx`: estado real de los datos.
- `src/lib/timeline.ts`: cronología del paciente con paginación por cursor.
- `src/lib/services.ts`: resolución de prestaciones y precios contra el catálogo.
- `src/lib/routes.ts`: paradas, orden del recorrido y domicilios guardados.
- `src/lib/followups.ts` y `src/lib/kit.ts`: pendientes derivados del cierre y faltantes del botiquín.
- `src/lib/features.ts`: banderas de función para el despliegue gradual.
- `src/lib/visits.ts`: lectura de jornada/ficha limitada por rol y veterinario.
- `src/lib/save-visit.ts`: transacción clínica/stock/cobro y comprobante de idempotencia.
- `src/lib/field-storage.ts`: almacenamiento local, cola y sincronización.
- `src/lib/clinic-time.ts`: horario local con cambios estacionales.
- `GET /api/jornada`: jornada del día.
- `GET /api/visits/:id`: contexto de visita para el usuario autorizado.
- `POST /api/visits/:id/sync`: operación validada; exige que `X-Field-User` coincida con la sesión.
- `POST /api/visits/open`: abre una atención sin cita o una consulta pasada (`origin`), idempotente por UUID; mismas exigencias de sesión.
- `POST /api/visits/:id/discard`: descarta una atención sin cita o consulta pasada sin nota ni cobro.
- `GET /api/patients/:id/timeline`: cronología paginada y filtrada por rol.
- `GET|POST|DELETE /api/patients/:id/alerts`: alertas del paciente; retirar marca resuelta, no borra.
- `GET|POST /api/services` y `GET|POST /api/clinical-templates`: catálogo y plantillas.
- `GET|POST|PUT /api/routes`: recorrido del día, paradas y reordenación.
- `GET|POST|PUT /api/tasks` y `GET|POST /api/communications`: pendientes y comunicaciones declaradas.
- `GET|PUT /api/inventory/kit`: faltantes del botiquín y prestaciones previstas por cita.
- Los endpoints existentes de pacientes, responsables, citas, inventario, documentos y pagos siguen operativos.

## Instalación y despliegue

Configurar conexión PostgreSQL (`DATABASE_URL`; pooler con `prepare:false`), conexión directa para migración (`DIRECT_URL`), autenticación (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`). Mercado Pago y Sentry son integraciones opcionales según sus variables de entorno.

Respaldar y aplicar, en orden, `docs/migrations/2026-09-16-operacion-domicilio.sql` y `docs/migrations/2026-09-18-experiencia-veterinaria.sql` antes de desplegar. La segunda es aditiva: agrega plantillas, alertas, catálogo de prestaciones, domicilios, recorridos, pendientes y comunicaciones, más columnas con valor por omisión. No borra ni reescribe datos.

Para desactivar una interfaz nueva se usan banderas de función (`src/lib/features.ts`, variables `PUBLIC_FEATURE_*` con el valor `off`), **nunca borrando sus tablas**: una tabla vacía se vuelve a llenar, una eliminada se lleva por delante lo ya registrado. La atención sin cita se apaga con `PUBLIC_FEATURE_ATENCION_SIN_CITA=off`: desaparecen los botones, `POST /api/visits/open` responde 404 y la copia del día deja de traer el directorio.

`docs/migrations/2026-09-24-atencion-sin-cita.sql` agrega el enum `appointment_origin` y la columna `appointments.origin` (por omisión `agendada`); `2026-09-25-consulta-pasada.sql` le suma el valor `pasada`. Ambas son aditivas y deben aplicarse antes de desplegar ese código. Con la bandera apagada tampoco se puede registrar una consulta pasada.

**Pruebas de integración.** `npm run test:integration` corre contra un Postgres real las transacciones que las pruebas unitarias simulan (apertura, guardado con prestación y pago, cierre, reintentos y solapamiento de agenda). Solo corre con `TEST_DATABASE_URL`; sin ella se salta, y ni `npm test` ni el build la ejecutan. Crea sus propios datos marcados `[TEST]` y los borra al terminar; `npm run test:integration:limpiar` elimina restos si una prueba se cortó. **Hoy `TEST_DATABASE_URL` apunta a producción, que solo tiene datos de prueba: antes de atender clientes reales, apuntarla a una base aparte.**

`npm run db:seed-catalog` carga un catálogo mínimo de prestaciones y las tres plantillas. Escribe en la base real y sus precios son marcadores de posición: revisarlos con el veterinario antes del piloto.

La primera migración añade `started_at`, `completed_at`, `no_charge`, `visit_operations` e índices por cita. No es necesario borrar datos ni recrear usuarios para este cambio. El cierre antiguo de cuentas de tutores tiene su propia migración y no se ejecuta automáticamente.

## Verificación manual en una base de prueba

1. Crear paciente y responsable sin correo; crear cita desde su ficha y verificar dirección, paciente y profesional.
2. Editar cita existente; verificar valores iniciales y rechazo de solapamientos.
3. Entrar como veterinario y comprobar que Hoy/Agenda muestran sus visitas; comprobar recepción y administración por separado.
4. Preparar jornada; desactivar red, recargar la URL de una visita, iniciar atención, escribir nota/fotos/insumos y regresar inmediatamente. Comprobar recuperación del borrador.
5. Completar atención con cobro o sin costo; imprimir resumen marcado como pendiente. Restaurar señal y comprobar una sola nota, consumo y pago aun reenviando la operación.
6. Repetir con falta de stock, saldo cambiado o cita editada desde otro dispositivo. Debe conservarse el borrador y mostrarse la revisión requerida.
7. Abrir una segunda pestaña; cerrar sesión en la primera. La jornada anterior debe dejar de mostrarse y no volver a activar la cuenta vieja.
8. Comprobar descarga de receta/laboratorio/consentimiento y control preseleccionado con conexión.

9. Abrir una visita en un teléfono de 360–390 px: comprobar que la barra inferior no tapa el botón de cierre, que el teclado no oculta los campos y que el zoom del navegador no esconde acciones.
10. Configurar el dispositivo en otra zona horaria y comparar Hoy, la agenda y el calendario: las horas deben coincidir entre sí.
11. Con red disponible pero API caída, abrir ficha, recetas y laboratorio: debe decir «no se pudo cargar» con reintento, nunca «no hay datos».
12. Registrar una alerta de paciente y abrir su visita: debe aparecer en la cabecera. Cortar la API y comprobar que dice que no pudo consultarlas, no que no tiene.
13. Recorrer la cronología paginando hasta el final con elementos de la misma fecha: sin duplicados ni elementos perdidos. Repetir con recepción: no debe ver consultas ni documentos.
14. Cerrar una visita con una prestación del catálogo y reenviar la misma operación: una sola nota, un solo consumo, un solo cobro y una sola línea de prestación.
15. Intentar cobrar esa misma cita desde facturación general: debe rechazarla por cobro activo.
16. Cambiar el precio de la prestación después de cerrada: la atención histórica conserva el importe cobrado.
17. Cerrar con saldo pendiente y comprobar que aparece una tarea de cobro; reenviar el cierre y comprobar que sigue habiendo una sola.
18. Agrupar dos mascotas del mismo domicilio en una parada, atribuir el traslado a una de ellas y verificar que cada paciente conserva su consulta y su cobro.
19. Reordenar paradas y confirmar que ningún horario de cita cambió.
20. Declarar prestaciones previstas para el día y revisar los faltantes del botiquín: debe distinguir el faltante por mínimo del que exige el plan, y declarar las visitas sin plan.
21. Cortar la red durante un envío, recuperar señal y revisar el centro de sincronización: la operación debe aparecer como resultado desconocido y reenviarse con el mismo identificador.
22. Abrir dos pestañas, sincronizar en una y comprobar que la otra actualiza su lista de pendientes sin recargar.
23. Desplegar una versión nueva con guardados pendientes: no debe reemplazar la versión activa hasta que la cola quede vacía.
24. Apagar una bandera de función (`PUBLIC_FEATURE_*=off`) y comprobar que la interfaz desaparece y los datos ya registrados siguen intactos al volver a encenderla.

Las pruebas automatizadas cubren contratos, permisos, horario, cola, clasificación de fallos de sincronización, idempotencia, resolución de prestaciones, deduplicación de pendientes, cálculo de cobro y faltantes, y transacciones simuladas. No sustituyen probar la migración y los efectos transaccionales contra un PostgreSQL de staging con datos anteriores a la migración, ni la prueba en los teléfonos objetivo.
