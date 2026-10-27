# Turi Gestión · MVP al 13 de noviembre de 2026

Fecha de inicio: 27/10/2026. Responsable de producto: Mauro Berchi. Socio y validador operativo: Daniel Stern. Implementación: CatchDog con Codex. Las fechas son hitos de trabajo; los accesos externos dependen de cada aseguradora.

## Resultado que vamos a entregar

Un piloto privado para Daniel: cuenta propia, código personal de acceso, hasta 10 códigos PAS resguardados, cartera y expedientes básicos, bandeja de tareas y un recorrido de cotización trazable. Mauro tendrá cuenta de superadministrador para supervisar usuarios, estados y auditoría. El PAS aprueba cada solicitud antes de avanzar a una emisión real.

**10 códigos cargados no equivalen a 10 integraciones.** El código PAS identifica al productor; la cotización puede requerir un usuario de portal, autorización, un token/API o un acuerdo de integración. La meta inicial es validar 1–2 conexiones para un producto concreto. Sólo se anuncian como conectadas cuando pasan pruebas reales con Daniel. El resto usa un recorrido asistido claramente indicado.

## Calendario y condiciones de entrega

| Fechas | Hito | Trabajo | Responsable / evidencia para cerrar |
| --- | --- | --- | --- |
| 27–30/10 | Cuentas y conexiones | Espacio privado, activaciones individuales, contraseña propia, código personal, permisos en servidor, base relacional, cifrado y auditoría. Dani registra hasta 10 compañías con sus códigos. | CatchDog implementa; Mauro y Dani activan sus cuentas y verifican los primeros registros. El 1234 de la demo no habilita el piloto. |
| 31/10–03/11 | Acceso real por compañía | Relevar las 10 compañías; distinguir código PAS, usuario, autorización y canal. Elegir dos compañías y un ramo inicial. Conseguir documentación, permisos y ambiente de prueba. | Dani aporta el canal y la autorización; CatchDog valida técnicamente. Cada compañía tiene estado y evidencia. Decisión de alcance el 03/11. |
| 04–08/11 | Operación de punta a punta | Conectar cartera básica y tareas al backend. Formulario único de cotización, trabajos por compañía, comparación de propuestas y estados de error. Adjuntos y borradores privados; aprobación del PAS. Carga asistida donde no hay integración habilitada. | CatchDog implementa; Dani prueba un caso normal, uno especial y una compañía sin respuesta. No se mezclan precios de muestra con propuestas reales. |
| 09–11/11 | Pruebas con Dani | Probar otra computadora, aislamiento de cuentas, recuperación de acceso, vencimiento de sesiones y restauración de una copia. Validar códigos sin alteraciones y atribución del PAS. Medir tiempos de una renovación y una cotización. | Dani valida la operación; Mauro acepta el alcance. Revisión de seguridad y privacidad antes de habilitar claves o tokens de compañías. |
| 12/11 | Cierre | Corregir incidencias que impiden trabajar, congelar alcance, registrar versión y preparar guía breve. | Sin fallos críticos abiertos; evidencia de pruebas y limitaciones visibles. |
| 13/11 | Entrega MVP | Piloto utilizable, cuentas activas, compañías relevadas, cotización integrada donde haya permiso y recorrido asistido para el resto. Manual y lista priorizada de la siguiente versión. | Demostración conjunta con un caso acordado y aceptación de Mauro y Daniel. |

## Lo que comenzamos a implementar el 27/10

- Espacio privado separado de la demo pública, sin exigir cuenta de ChatGPT.
- Usuarios `dani` (productor) y `mauro` (superadministrador), activados mediante enlaces personales de un solo uso. Cada uno elige su contraseña y confirma su código personal.
- Base relacional para usuarios, sesiones, conexiones, auditoría y límites de intentos.
- Códigos PAS cifrados con AES-256-GCM en el servidor, aislados por productor y compañía. Hasta 10 compañías distintas por productor, con control de versiones para reemplazos.
- Sesiones con cookies HttpOnly/Secure, código personal obligatorio, cierre por inactividad y revocación desde el superadministrador.
- Recuperación por correo con códigos de un uso y verificación de titularidad. El envío real está pendiente de conectar el servicio transaccional.
- El superadministrador supervisa metadatos y actividad; no puede leer códigos o contraseñas del productor.
- La carga de claves y tokens de portales queda bloqueada hasta validar cada conector y el flujo desplegado. En esta primera entrega se registran códigos PAS.
- Caso Turi Gestión con mockups en Desarrollos de CatchDog, identificado como producto en desarrollo.

## Entorno operativo incorporado el 27/10

La cuenta privada ya abre el tablero de trabajo, con navegación propia y datos persistidos en D1. Clientes, pólizas existentes, siniestros, tareas, pedidos de cotización y propuestas recibidas pueden crearse y modificarse. Los datos personales, condiciones e importes se cifran. El Superadministrador supervisa la organización y conserva la atribución de cada cuenta; el PAS opera su propia cartera.

Mi día consolida pendientes, seguimientos de siniestros, pagos registrados y próximos vencimientos. Compañías permite relevar permiso, canal, documentación y avance técnico sin confundirlo con un conector habilitado. El PAS puede registrar la revisión de una propuesta vigente, sin emisión de cobertura.

Esto adelanta la base de cartera y la ruta asistida previstas para el 04–08/11. Siguen pendientes: importación de cartera, formulario público conectado al PAS, archivos privados, notificaciones reales, servicio transaccional de correo, respaldo con restauración probada y los primeros conectores autorizados. La administración de esta etapa organiza tareas; no liquida comisiones ni presenta impuestos. La rama IA y marketing automatizado continúa después de validar la operación básica.

Siguiente trabajo: Dani registra las primeras compañías y aporta un caso anonimizado de renovación/cotización. Con ese caso se valida el recorrido asistido, se definen los campos del formulario público y se prepara la importación de su cartera. Antes del 03/11 debemos tener elegidas dos compañías, un ramo y el canal autorizado para probar.

## Decisión obligatoria del 3 de noviembre

Para cada candidata necesitamos: compañía y ramo, titular del código, acceso vigente, canal técnico, documentación, permiso para integrar, datos requeridos y forma de probar. Si no hay acceso verificable, esa compañía no entra como cotizador automático en el MVP del 13/11. Su gestión queda asistida: registro del pedido, enlace al portal, propuesta adjunta, comparación y seguimiento. No se sortea un CAPTCHA ni se promete SSO a partir de un código PAS.

## Criterios de aceptación

1. Dani y Mauro ingresan con cuentas diferentes, contraseña propia y código personal.
2. Un usuario sin sesión o de otro productor no puede leer, modificar ni borrar conexiones ajenas.
3. Dani registra, reemplaza y quita hasta 10 códigos; se conservan ceros iniciales y atribución. Las respuestas y auditorías no exponen códigos completos.
4. Cada compañía muestra por separado: código registrado, permiso revisado, conector probado y cotización disponible. No hay “conectado” sólo por guardar datos.
5. Un pedido produce propuestas comparables con compañía, cobertura, precio/moneda, vigencia, franquicia, fecha y fuente. Un fallo parcial no cancela ni falsea otras respuestas.
6. La ruta asistida es operativa y visible cuando una integración no está habilitada.
7. No se emite cobertura por el último clic del cliente. El PDF conserva “Pendiente de aprobación / Esto no es una póliza”.
8. Copias y recuperación: restauración comprobada, custodio de claves definido y retención documentada. No alcanza con exportar localStorage.
9. La demo pública y el piloto privado se distinguen; el piloto no muestra precios ficticios como tarifas reales.

## Próxima versión, después del MVP

Más compañías y ramos, comunicaciones push consolidadas, automatización contable, lectura avanzada de documentos y agente conversacional con herramientas. La maqueta actual muestra la visión; sus módulos no se consideran conectados sólo por verse en pantalla.
