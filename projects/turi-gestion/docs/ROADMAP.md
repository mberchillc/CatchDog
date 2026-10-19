# Etapas de TURI Gestión

La demo permite revisar la disposición de las herramientas y ensayar la rutina con Daniel. El próximo paso es observar una jornada real y acordar una primera automatización medible.

| Etapa | Entrega | Condición para avanzar |
| --- | --- | --- |
| Maqueta actual | Tablero, cartera, siniestros, administración, captación y agente contextual de muestra. | Daniel prueba los recorridos y valida prioridades, palabras y distribución. |
| Piloto operativo | Autenticación real, permisos por productor, API propia y persistencia D1. | Comprobar aislamiento, auditoría, restauración y atribución al código PAS. |
| Primera fuente de alertas | Un buzón autorizado o API de una compañía. Normalización, deduplicación, fechas y vínculo al expediente. | Medir que la novedad llega completa, conserva la fuente y no duplica tareas; mostrar fallos y última actualización. |
| Gestión documental | Adjuntos durables y privados, extracción con fuentes y confirmación de datos dudosos. | Validar formatos, acceso, retención y que los requisitos pendientes estén reunidos antes de aprobar. |
| Agente con herramientas | Un proveedor inicial, recuperación de contexto y acciones acotadas sobre el backend. | Confirmar permisos, presupuesto, registro de acciones y aprobación del PAS para decisiones que lo requieran. |
| Primera cotización real | Un producto de una compañía con autorización y requisitos documentados. | Validar precios, monedas, vigencias, coberturas, errores, límites e idempotencia. |
| Administración conectada | Conciliación de una liquidación real y exportaciones para control. | Validar reglas por régimen y jurisdicción con la documentación y responsables correspondientes. |
| Escala | Más compañías, productores y procesos según uso observado. | No agregar integración sin sostener aislamiento, trazabilidad y recuperación. |

## Orden propuesto para el piloto

Primero alertas de vencimiento y pagos, luego seguimiento de siniestros. Continuar con liquidaciones y comprobantes. Marketing y asistencia IA aprovechan el contexto ya ordenado. La cotización integrada depende de permisos y capacidades concretas de cada compañía.

Para cada fuente, decidir entre API, correo autorizado o un proceso asistido. Un enlace a un portal no equivale a integración; no se da por disponible una API por lo que afirma una página comercial. La automatización de portales se evalúa aparte con autorización, términos y compatibilidad técnica.

## Seguridad y atribución

La clave de demo debe eliminarse antes de usar datos reales. Autenticación y autorización se resuelven en servidor. Las claves de aseguradoras y de IA se almacenan con protección y alcance por productor; nunca en el navegador ni en GitHub. Cada operación conserva su PAS, compañía, código verificado, versión y registro de aprobación. Cambios relevantes requieren revisión de la versión vigente.

Documentos y conversaciones pertenecen al productor autorizado. No se comparten contextos entre cuentas. Consentimiento de marketing, atención del seguro y permisos de integración son decisiones separadas.

Se requieren copias de base y documentos, prueba de restauración y reconciliación de operaciones externas antes de reactivar tareas. La exportación del navegador de esta demo no sustituye ese respaldo.

## Revisión con Daniel

Probar una renovación, un impago y un siniestro sin movimiento. Medir minutos activos y cantidad de entradas a otros sistemas; distinguir espera de compañía de trabajo manual. Recoger tres ejemplos de avisos reales con datos anonimizados antes de diseñar el primer conector. Confirmar qué acciones prepara el agente y cuáles requieren decisión profesional.
