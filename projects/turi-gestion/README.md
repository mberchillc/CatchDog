# TURI Gestión

Demo navegable centrada en la operación cotidiana del productor asesor de seguros. El punto de partida es el perfil de Daniel Stern, organización Turi, con 230 pólizas ficticias. Prioriza alertas, cartera, siniestros, administración y oportunidades comerciales.

Demo con acceso por enlace: https://turi-gestion-demo.mb1312.chatgpt.site

Acceso de muestra: **Dani / 1234**. Es una selección de recorrido en el navegador, no autenticación segura. No ingresar datos reales.

## Piloto privado · implementación del 27/10

El acceso real se abre en `/privado/`. Hay dos roles: `dani` (productor) y `mauro` (superadministrador). Cada uno usa un enlace personal de activación, define una contraseña de 14 caracteres o más y confirma el código personal de ocho dígitos generado por Turi. No se comparte la clave de la demo.

El espacio privado abre directamente un entorno operativo con navegación propia: Mi día, Clientes, Pólizas, Siniestros, Cotizaciones, Agenda y administración, Documentos, Compañías, Productores (superadmin) y Actividad. Las altas y modificaciones se guardan en D1, con atribución al titular de la cartera. Empieza vacío; no importa las 230 pólizas ficticias de la demo.

Ya permite registrar clientes y consentimiento comercial, pólizas existentes, expedientes de siniestro con próximo paso, tareas por área, pedidos de cotización y propuestas recibidas de compañías. Mi día consolida tareas, seguimientos de siniestros, pagos pendientes registrados y próximos vencimientos. No recibe todavía comunicaciones push de aseguradoras.

Las propuestas se comparan con moneda, importe, período, cobertura, franquicia, fuente y vigencia. Sólo el productor titular puede aprobar la revisión de una propuesta vigente; esa aprobación no emite una póliza ni otorga cobertura. El superadministrador puede operar y supervisar registros de la organización, filtrar por cuenta y cargar gestiones atribuidas a un productor activo, sin leer sus códigos PAS.

Compañías conserva hasta 10 códigos PAS cifrados por productor y agrega relevamiento de permiso, canal, documentación y avance técnico. Reemplazar un código deja su relevamiento pendiente de revisión. Ninguna ficha puede declarar un conector operativo sólo por guardar datos. Las APIs y el formulario público conectado siguen el calendario de [ROADMAP](docs/ROADMAP.md). La carga de contraseñas de portal y tokens está deshabilitada hasta validar cada conexión.

La recuperación por correo tiene un circuito de confirmación y códigos de un uso. El envío real queda pendiente de configurar `RESEND_API_KEY` y `TURI_MAIL_FROM`; sin ellos la interfaz informa que todavía no está habilitado y no afirma haber enviado correos.

Controles y límites: [SECURITY](docs/SECURITY.md). Variables secretas: ver `.env.example`; nunca guardar sus valores en este repositorio.

## Revisión del espacio privado

1. Ingresar en `/privado/` con la cuenta propia. Se conserva usuario, contraseña y código personal sin vencimiento.
2. Crear un cliente desde Mi día. El superadministrador elige la cuenta responsable; por defecto usa su propio espacio.
3. Registrar una póliza existente para ese cliente, o crear una tarea con fecha y prioridad.
4. Abrir un siniestro vinculado a la póliza y registrar el próximo seguimiento.
5. Crear una solicitud de cotización; abrir su expediente y cargar propuestas transcritas de una fuente verificable. Comparar condiciones y periodicidad del importe.
6. Desde la cuenta del PAS titular, revisar una propuesta vigente y registrar su aprobación. La emisión se completa fuera de este piloto en la compañía.
7. Dani registra sus códigos en Compañías; ambos pueden relevar el permiso y los próximos pasos de la integración. El administrador supervisa sin revelar códigos.
8. Recargar o ingresar desde otra computadora para recuperar los registros del servidor. Actividad conserva actor, fecha e identificador sin contenido de formularios.

Límite inicial: 500 registros por sección y organización. No hay importación masiva ni integración contable/fiscal todavía. Agenda permite seguir tareas administrativas; no liquida comisiones ni presenta impuestos.

## Documentos privados por productor

En Documentos se suben PDF y fotos por cliente. También hay accesos directos desde las listas de clientes, pólizas y siniestros. El PAS ve sus archivos; el Superadministrador ve los de la organización y conserva la cuenta responsable al cargarlos. Una póliza o un siniestro sólo se pueden vincular a documentos del mismo cliente y cuenta.

- Formatos: PDF, JPG/JPEG, PNG, WebP y HEIC/HEIF de iPhone. Hasta 20 archivos por carga, 10 MB por archivo y 1 GB / 1.000 archivos por cuenta, incluida la papelera.
- El original se guarda cifrado en R2. D1 conserva las relaciones y los metadatos cifrados. Ni nombres de cliente ni de archivo se usan como claves públicas de objetos.
- Fotos JPG/PNG/WebP: vista previa al solicitarla. PDF y HEIC/HEIF: descarga del original para abrirlo en una herramienta compatible. No se modifica ni recomprime el archivo.
- Permite corregir descripción, categoría, notas y expediente relacionado; el propietario permanece fijo. La papelera conserva el original y permite restaurarlo. No hay borrado definitivo ni purga automática en esta etapa.
- La lista se pagina de a 60; los filtros de cuenta y cliente se aplican en servidor. La búsqueda por texto trabaja sobre la página visible, indicado en el campo.
- Una carga fallida no aparece como guardada. Los reintentos de la misma operación no duplican un archivo confirmado. Reservas, cuota y leases controlan concurrencia y recuperación.

El chat, OCR y lectura de documentos con IA siguen pendientes. Tampoco se afirma escaneo antivirus ni sanitización completa de PDFs. El servidor valida extensión, firma básica, longitud y checksum; los PDFs se sirven como descarga, nunca como contenido activo incrustado.

## Próximo ajuste del cotizador

Después de documentos, incorporar la exploración por cobertura y/o compañía antes de elegir propuestas. Ver [criterios de exploración](docs/QUOTE_EXPLORATION.md), con el pedido de Dani del 27/10 y PASAP como referencia comercial. Ese ajuste todavía no está implementado y no habilita integraciones por sí mismo.

## Recorrido de revisión de la demo pública

1. Elegir **Soy productor** e ingresar con Dani / 1234.
2. En **Mi día**, abrir una alerta, ver su fuente, preparar un mensaje, posponerla o marcarla resuelta.
3. En **Mis pólizas**, buscar por nombre, identificador o patente y filtrar por compañía y ramo. Abrir una ficha o exportar CSV.
4. En **Siniestros**, abrir SIN-2401 y registrar un avance. El contador de días se actualiza y la alerta asociada se cierra.
5. Abrir **Mi link de cotización** y probar el recorrido del cliente. Se puede comenzar sin nombre ni edad. Un caso especial pasa a evaluación experta; no se inventa una tarifa.
6. Completar contacto e intención con datos ficticios. Descargar el PDF ilustrativo y volver a **Cotizaciones** para revisar el borrador como PAS.
7. Completar los controles y aprobar la simulación. No se solicita una aprobación adicional de Admin Turi y no se emite cobertura.
8. Explorar **Administración**, **Marketing y ventas**, **Agente Turi** y las guías de **Capacitación**.
9. En el agente, consultar siniestros sin novedades o adjuntar un .txt ficticio y preguntar por su contenido.
10. En **Mi perfil y respaldo**, exportar los datos de muestra, restaurarlos o reiniciar la demo.

**Soy cliente** abre una vista breve de seguros de muestra y contacto con su productor. Los formularios y las guías por ramo son herramientas del productor, sin desarrollar un negocio B2C independiente.

## Qué funciona y qué está simulado

| Función | Alcance de esta versión |
| --- | --- |
| Cartera | 230 pólizas, 230 clientes ficticios, búsqueda, filtros, fichas y exportación. |
| Alertas | Siete avisos iniciales de muestra, fechas, prioridad, resolución, posposición e historial local. |
| Siniestros | Cinco casos; contador desde el último avance, actualización de estado, notas y próximo paso. |
| Cotización | URL propia, datos mínimos y ejemplos ficticios. Años de auto de 2026 a 2000; “Modelo anterior” deriva a evaluación especial sin tarifa automática. |
| Atención humana | Todos los botones de ayuda abren WhatsApp web o app en +54 9 11 3021-6824. El usuario envía su mensaje desde WhatsApp. |
| Solicitud | Crea oportunidad, borrador y alerta del PAS en el mismo navegador. No notifica por correo. |
| PDF | Documento ilustrativo con marca de agua y aviso de cobertura no emitida. No es una póliza. |
| Revisión | Checklist e intención de la solicitud; aprobación simulada del propio PAS, sin emisión. |
| Administración | Comisiones, retenciones, comprobantes y agenda ficticios. No calcula ni presenta impuestos reales. |
| Marketing | Oportunidades, seguimiento y borradores de comunicación. No envía ni publica contenido. |
| Agente | Respuestas por reglas que consultan registros y textos .txt del perfil. No hay LLM ni herramientas externas conectadas. |
| Proveedores IA | Cuatro alternativas, documentación y preferencia de muestra. No conexión real ni captura de claves. |
| Compañías | Quince logos y enlaces oficiales externos. Algunos enlaces llevan a la página oficial de productores cuando no se fijó un login estable. No SSO. |
| Persistencia | Cambios guardados en localStorage del navegador; exportación/restauración de demo. No sincroniza usuarios, dispositivos ni solicitudes de clientes externos. |

La marca y la tipografía se basan en el sitio de Turi. El retrato fue suministrado por Mauro. El personaje ilustrado del agente es una propuesta inicial generada para esta demo.

## Estructura

- `public/`: maqueta y frontend privado; `worker/`: backend de cuentas, conexiones, operación y documentos privados. `dist/` es salida generada, no fuente.
- `docs/schema.sql`: modelo relacional inicial para productores, compañías, códigos propios, clientes, pólizas, alertas, siniestros y borradores.
- `docs/seed.sql`: fixture SQLite completa con datos ficticios. Incluye el esquema; no ejecutar después de `schema.sql` en la misma base sin limpiar.
- `scripts-data.py`: genera la fixture y el dataset del frontend.
- `docs/company-sources.json`: fuentes de accesos y recursos de marca.
- `docs/ROADMAP.md`: etapas y criterios para pasar del prototipo al piloto.
- `tests/demo.test.cjs`: pruebas de DOM y recorridos con JSDOM.

La maqueta conserva su fixture en el navegador. El espacio privado utiliza tablas propias en D1 para cuentas, sesiones, conexiones, auditoría, clientes, pólizas, siniestros, tareas, pedidos, propuestas, relevamientos y documentos; no importa automáticamente la cartera ficticia.

## Desarrollo y validación

Para pruebas: `pnpm install`, `node scripts/build-worker.mjs`, `node tests/demo.test.cjs` y `node --test tests/security.test.mjs tests/workspace.test.mjs tests/documents.test.mjs`. Para cambios de esquema: `node node_modules/drizzle-kit/bin.cjs generate`. El build incrusta los recursos de `public/` en el Worker y conserva la configuración de D1; las migraciones se publican con el flujo Sites.

La demo conserva 70 verificaciones funcionales. El acceso y la operación privada pasan 41 escenarios de seguridad e integración con el Worker y migraciones reales en SQLite: permisos, cifrado, relaciones, versiones, CSRF, recuperación con correo simulado y recorridos de Superadministrador y PAS. El flujo del PAS cubre pedido → propuesta → aprobación sin emisión. Los archivos tienen 16 escenarios propios: aislamiento, original idéntico, formatos, integridad, cuotas, reintentos, cargas simultáneas, fallos de DB/R2, revocación durante transferencia y recorrido de interfaz. R2 se simula en las pruebas; la conexión de producción se verifica al desplegar. El PDF ilustrativo de la demo ya fue renderizado para revisar su marca de agua.

La interfaz privada se revisó visualmente en Chrome con vistas estáticas de QA, aisladas de la base de producción. Para repetir: `node scripts/build-worker.mjs`, `node tests/render-workspace.mjs`, luego `sites-preview start /workspace/sites/turi-gestion` en el entorno administrado. El adaptador `scripts/dev.mjs` sirve el mismo Worker con una base y bucket en memoria y cuentas ficticias locales; `/_visual/home` y las demás vistas de QA son estáticas. Ni las fixtures ni sus credenciales funcionan en producción. No se iniciaron sesiones con las contraseñas personales de Mauro o Dani.

La publicación se gestiona con Sites sobre Cloudflare. El enlace abre sin cuenta de ChatGPT. El usuario Dani y la clave 1234 son parte del recorrido de muestra; no constituyen autenticación segura. El código para revisión se guarda en la rama `demo/turi-gestion` de `mberchillc/CatchDog`, bajo `projects/turi-gestion`. El `main` de CatchDog no se modifica.

## Fuentes de producto y diseño

Las notas de la reunión del 19 de octubre de 2026 y el pedido posterior de Mauro gobiernan el alcance: herramienta para el productor, administración primero, pilotos incrementales y estética actual de Turi. No se trasladan como requisitos los pasajes de la transcripción que confunden el proyecto con una plataforma de entrenamiento.

Las páginas comerciales se toman como referencia declarada, sin verificar resultados ni acceso a sus integraciones:

- [Turi](https://www.turi.com.ar/): identidad, tono y atención experta.
- [VISION PAS](https://visionpas.com/): cartera, oportunidades, renovaciones y contexto compartido.
- [Apizeal](https://apizeal.com/): pólizas, comisiones, comunicaciones y capacitación; su oferta corresponde a otros mercados y ramos.
- [Cooper](https://www.askcooper.ai/): propuesta de asistencia a lo largo del flujo asegurador. Sus cifras y afirmaciones de automatización no se adoptan como hechos comprobados.
- [San Cristóbal](https://www.sancristobal.com.ar/cotizar-auto/): referencia de recorrido de cotización. Su formulario dinámico no pudo inspeccionarse íntegramente; esta demo no copia sus campos ni su tarificación.
- [OpenAI](https://help.openai.com/en/articles/8156019), [Claude](https://platform.claude.com/docs/en/home), [Gemini](https://ai.google.dev/gemini-api/docs), [Copilot Studio](https://learn.microsoft.com/es-es/microsoft-copilot-studio/): documentación para evaluar conexiones, permisos y consumo. No se promete reutilizar una suscripción de chat como acceso automático a la API.
