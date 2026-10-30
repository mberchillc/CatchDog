# Pólizas y Históricos recuperables

## Ficha de póliza

La ficha conserva el detalle de cobertura anterior y agrega tipo de cobertura, forma de pago y su referencia, localidad/provincia, refacturación, endosos repetibles (número, fecha, tipo y detalle) y fecha/motivo de baja. Son registros administrativos del PAS: no modifican una póliza en la aseguradora. Una baja nueva con estado `cancelled` requiere fecha y motivo; un registro cancelado anterior sin esos campos puede seguir editándose.

Los campos nuevos son opcionales para consumidores anteriores de la API. Si una pestaña anterior los omite al guardar, el servidor conserva sus valores actuales. Las pólizas existentes no se reescriben al desplegar. Los datos nuevos permanecen en el payload cifrado de `work_policies`.

## Importes

`public/amounts.js` se comparte entre el navegador y el Worker. Convierte formatos como `56318,58`, `56.318,58` y `56,318.58` a enteros de centavos, sin redondeo binario. Un único separador seguido de tres cifras se interpreta como agrupador de miles cuando la agrupación es válida. La vista muestra el importe interpretado antes de guardar; la ficha de póliza conserva además `amountText` para que al reabrirla mantenga la notación ingresada. Entradas inválidas no se guardan ni se redondean silenciosamente.

El mismo análisis se utiliza al cargar propuestas, informar cobros, completar sumas de formularios y registrar importes orientativos del multicotizador. Los importes numéricos que usa la API siguen siendo centavos enteros.

## Archivo recuperable

- El tacho envía clientes, pólizas, siniestros, tareas y expedientes a Históricos, con nota opcional. Formularios de emisión y pedidos iniciales también pueden archivarse.
- `POST /api/pilot/work/archive/{type}/{id}` recibe `action`, `expectedVersion` y, para archivar, `note`.
- `GET /api/pilot/work/archive` devuelve registros archivados del PAS; Super Admin conserva la supervisión de su organización. No devuelve snapshots completos ni payloads.
- La migración `0009_record_archives.sql` agrega solamente `work_record_archives` y `work_record_archive_events`. No actualiza, elimina ni reclasifica filas existentes.
- Cada archivo conserva un snapshot cifrado completo del registro, la nota, fecha, actor y versión. Los eventos de archivo y restauración quedan registrados. Restaurar sólo cambia la marca de archivo: no reemplaza la fila original por una copia ni duplica el registro.
- La API general conserva los registros con metadata `archive` para que los nombres de relaciones existentes sigan resolviendo. La interfaz los excluye de las listas, indicadores y nuevas vinculaciones. Una póliza ya vinculada a un cliente que luego se archiva puede seguir editándose; no se permite crear nuevas vinculaciones con un registro archivado.
- Archivar una póliza no la cancela en la compañía; no cambia su estado administrativo. Archivar un cliente no archiva automáticamente sus pólizas, casos, cobros o documentos.
- Archivar un caso de emisión pausa su enlace público y retira sus avisos. La respuesta recibida, versiones y originales se conservan. Restaurar permite usar el enlace hasta su vencimiento original y vuelve a mostrar los avisos pendientes.
- Los documentos conservan la papelera recuperable existente, por separado.
- El consentimiento comercial no cambia por archivar/restaurar. Históricos no envía campañas ni mensajes.
- No hay purga ni limpieza automática. La política de conservación y una eventual eliminación definitiva requieren revisión y autorización de Mauro antes de tocar datos de Daniel. El almacenamiento archivado sigue ocupando espacio y no libera las cuotas del piloto.

## Verificación

`tests/policy-archive.test.mjs` cubre formatos de importes, edición con nuevos campos y pestañas anteriores, baja, endosos, snapshots, aislamiento entre productores y organizaciones, CSRF, versiones, restauración, competencia entre edición/archivo, pausa de enlaces/avisos, integridad de originales y pedidos iniciales. La revisión visual se realiza sólo con el PAS ficticio local. La publicación y sus pruebas remotas requieren la revisión previa acordada con Mauro.
