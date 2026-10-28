# Seguridad y privacidad · primer piloto

Estado: implementación inicial del 27/10/2026. Esto documenta controles y límites; no certifica una auditoría externa ni la habilitación de integraciones de aseguradoras.

## Identidades y permisos

No se utilizan las credenciales Dani/1234 de la maqueta para datos reales. Cada usuario activa su cuenta con un enlace aleatorio de un uso y vencimiento. El token sólo viaja en el fragmento del enlace y en el POST de activación; se borra del historial visible al abrir. El servidor guarda el hash autorizado en configuración secreta y nunca acepta el rol enviado por el navegador.

Las contraseñas se procesan con HMAC y un pepper separado de la base, seguido de scrypt N=16384, r=8, p=5, sal aleatoria y 32 bytes de resultado. Es una de las configuraciones equivalentes publicadas por OWASP; permite limitar el uso de memoria en Workers. Las contraseñas no se cifran para su posterior lectura.

Por pedido de Mauro, el ingreso utiliza usuario, contraseña y un código personal fijo de ocho dígitos, generado por Turi y confirmado en la misma pantalla. No requiere una app de autenticación. El código se guarda como HMAC con pepper y alcance por usuario, no en texto ni como secreto recuperable. Este esquema combina secretos de conocimiento; no se presenta como MFA. El código se puede reutilizar en los siguientes ingresos hasta una recuperación o reemplazo autorizado. No vence por tiempo, tampoco antes de confirmarlo. Si se cierra la pantalla o vence la sesión de configuración, al ingresar otra vez con la contraseña se presenta el mismo código pendiente. Mientras está pendiente se conserva cifrado y ligado a la cuenta; al confirmarlo se elimina esa copia cifrada y se conserva sólo el HMAC.

Las cuentas ya creadas conservan su contraseña y completan el nuevo paso en una sesión validada con ella. Los endpoints antiguos de TOTP se retiran; al confirmar el nuevo código se vacían el secreto y los códigos de recuperación antiguos. La operación invalida sesiones anteriores.

Recuperación por correo: primero se confirma un correo desde la sesión del titular. Los códigos enviados son aleatorios de seis dígitos, vencen a los 10 minutos, permiten como máximo cinco intentos y se consumen una sola vez. Se almacenan mediante HMAC; el destino se cifra en el desafío. La recuperación exige sólo el correo confirmado y no revela si existe una cuenta. La validación correcta consume el código y crea un permiso de 10 minutos en una cookie HttpOnly, Secure y SameSite=Strict; ese permiso no permite leer datos y sobrevive una recarga. Sólo entonces aparece el formulario para una contraseña nueva, diferente de la anterior. El cambio consume atómicamente el permiso, revoca todas las sesiones y otros desafíos de recuperación y obliga a confirmar un nuevo código personal. Los permisos quedan ligados al correo, contraseña y código personal vigentes: cualquier cambio o suspensión los invalida. No exige recordar el usuario y no deriva a WhatsApp. Un correo sin confirmar no permite recuperar una cuenta. La confirmación comprueba de forma atómica que el destino no esté confirmado para otra cuenta; una duplicidad previa se rechaza sin elegir arbitrariamente a un titular. La solicitud limita envíos por correo e IP, incluso para destinos desconocidos.

El proveedor implementado es Resend mediante HTTPS. Se necesita configurar un remitente verificado y su API key como secretos de producción (`TURI_MAIL_FROM`, `RESEND_API_KEY`). **Ese envío real aún no está configurado.** La UI no ofrece falsas confirmaciones: el inicio de recuperación indica que el servicio no está habilitado. Las pruebas de entrega utilizan un proveedor simulado, sin enviar correos reales.

Sesiones opacas de una hora como máximo y 15 minutos de inactividad; la sesión de configuración vence en 10 minutos. Cookie __Host-, HttpOnly, Secure y SameSite=Strict. CSRF y origen se validan en cada escritura. Límite de intentos por usuario/IP. Cada petición consulta el estado de la sesión en el servidor; la revocación del superadministrador es efectiva en la siguiente petición.

El productor puede operar sólo sobre sus conexiones y registros de cartera. El superadministrador supervisa metadatos, actividad y registros operativos de su organización, y puede cargar gestiones para cuentas activas de ella. No puede leer códigos PAS ni credenciales. No hay endpoint de revelación ni exportación de secretos al navegador.

## Acceso de superadministración

El propietario puede ingresar en `/admin/` con su usuario y contraseña existentes, sin código personal. El servidor comprueba el rol `superadmin` guardado en D1; un valor de rol en el formulario no concede permisos. Los productores conservan su ingreso con código. Los dos endpoints comparten límites de intentos, validación de origen, contraseñas scrypt, cookies HttpOnly/Secure/SameSite, caducidad y revocación. Las sesiones de administración se identifican dentro del token cuyo hash guarda la base; si la cuenta deja de ser superadministrador, esa sesión se rechaza. No se cambia la contraseña, el código anterior, el correo ni los registros al ingresar por esta vía.

El formulario de administración tiene un único campo de contraseña con `autocomplete=current-password`, usuario identificado y método POST. La decisión de guardar y completar pertenece al navegador y al titular. Turi no guarda contraseñas ni códigos en localStorage.

## Recuperación individual gestionada por el propietario

Durante el piloto, mientras no haya envío transaccional, el propietario del sitio puede autorizar un enlace individual para reemplazar un código perdido. La autorización se configura fuera del sitio, mediante la conexión autenticada del propietario, como secreto `TURI_CODE_RECOVERY_GRANTS`. Contiene ID, cuenta exacta, organización, hash de un token aleatorio de 256 bits y vencimiento. El sitio no emite esos permisos desde una ruta pública. El token original no se guarda en Git, base de datos ni configuración pública.

El enlace lleva el token en el fragmento y lo elimina del historial visible al abrir. Su titular debe ingresar además la contraseña actual. La operación no cambia contraseña, correo, rol, cartera ni documentos. Un desafío de D1 consume el permiso una sola vez, de forma atómica con la invalidación del código anterior y la revocación de sesiones. La nueva sesión sólo permite configurar el código, sin acceso a datos hasta confirmarlo. Se conservan los límites de intentos; un permiso vencido, usado, ajeno o de una cuenta suspendida no permite recuperar el acceso.

El usuario recibe un código personal nuevo, fijo y sin vencimiento, con un botón para copiarlo antes de confirmar. El enlace de recuperación sí tiene vencimiento y un solo uso. No se presenta como recuperación por correo ni como segundo factor independiente. Las autorizaciones deben retirarse de la configuración cuando ya no se necesiten.

## Códigos y conexiones

Cifrado AES-256-GCM con nonce aleatorio por versión. La autenticación del cifrado incluye organización, productor, compañía y versión; mover un dato cifrado a otra cuenta o compañía invalida su lectura. La llave se configura como secreto del entorno; no forma parte de GitHub, HTML, localStorage ni la base de datos.

Se permiten hasta 10 compañías por productor. La comprobación de capacidad está en la misma sentencia SQL que inserta; la combinación productor/compañía es única. Reemplazos usan una versión esperada para impedir sobrescrituras silenciosas. Los códigos se tratan como texto, conservando ceros iniciales.

La primera fase sólo admite códigos PAS. Contraseñas de portal y tokens permanecen bloqueados por configuración y no aparecen en el formulario. Su habilitación requiere permiso, revisión del conector, pruebas del despliegue y decisión documentada. Registrar un código no abre una sesión en una aseguradora ni valida un permiso de cotización.

## Auditoría y minimización

La auditoría registra actor, acción, identificador y fecha. No incluye códigos, claves, contenido de formularios ni tokens de sesión. Los errores públicos son genéricos; no se imprimen cuerpos de solicitudes ni errores de base con parámetros. Los intentos se agrupan en claves hash temporales; no se conserva la IP en texto en esa tabla.

El espacio privado tiene CSP, no-referrer, bloqueo de iframes y respuestas de API sin caché. Ninguna IA recibe códigos o credenciales. La demo pública conserva sólo sus datos ficticios; el espacio privado comienza sin ellos.

## Registros operativos

Clientes, pólizas, siniestros, tareas, solicitudes y propuestas incluyen organización y cuenta responsable. El servidor comprueba el propietario también al crear relaciones: un productor no puede vincular un cliente o una póliza ajenos, aunque conozca el ID. El superadministrador sólo opera dentro de su organización. La atribución de un registro existente no se puede cambiar desde el formulario o el API.

Nombre, contacto, consentimiento, número de póliza, riesgo, importes, cobertura, franquicia, notas y referencias se cifran mediante AES-256-GCM. Cada payload se autentica con organización, propietario, tipo e ID del registro. Las respuestas sólo se descifran después de autorizar la consulta. Las claves siguen fuera de la base y del navegador.

Las modificaciones requieren la versión esperada. Solicitudes y propuestas cerradas no se modifican. La aprobación exige que el actor sea el PAS titular, contacto del cliente, propuesta vigente y confirmación explícita. La escritura valida las versiones de solicitud y propuesta en la misma sentencia; no se acepta una aprobación sobre una propuesta cambiada. Registrar una revisión no emite ni confirma cobertura legal.

El relevamiento de una compañía separa permiso, canal y avance técnico. No permite declarar una integración automática como conectada. Si cambia la versión del código PAS, el relevamiento se muestra pendiente de revisar. Sus notas y el enlace de documentación se cifran; no deben contener contraseñas ni tokens.

La primera versión admite hasta 500 registros por sección y organización, con capacidad comprobada en la inserción. No incluye exportaciones ni importación masiva de registros privados. Los documentos se gestionan en el módulo privado descrito debajo. No hay enlace público que pueda escribir en una cartera privada. Las fechas del tablero derivan de registros internos; no se han conectado avisos de aseguradoras.

## PDF y fotos privados

El original se cifra con AES-256-GCM antes de guardarse en R2, con nonce aleatorio y autenticación de organización, propietario e ID. El blob binario tiene una cabecera de versión; el tamaño y SHA-256 del original se verifican al recibirlo y al devolverlo. Nombre, descripción, categoría, notas y checksum van en metadatos cifrados en D1. Las claves físicas son aleatorias y no incluyen nombres o códigos PAS. No existe una URL pública ni un endpoint de bucket accesible desde el navegador.

Lecturas, vistas previas y escrituras requieren sesión completa. El PAS sólo opera sobre sus archivos; el Superadministrador opera dentro de su organización. Cada relación comprueba cliente, póliza y siniestro de la misma cuenta. Se revalida la sesión y el expediente después de leer una carga, antes de confirmarla. No se aceptan credenciales o cambio de propietario desde el formulario. CSRF y origen se verifican también para el cuerpo binario.

Se permite PDF, JPEG, PNG, WebP y HEIC/HEIF, con extensión y firma básica concordantes. El lector del cuerpo aplica un límite de 10 MB sin confiar en Content-Length. Se compara el hash declarado con los bytes recibidos. Los PDFs se descargan con Content-Disposition attachment; la vista previa sólo permite JPEG/PNG/WebP. Descargas y APIs llevan no-store y nosniff. La imagen de vista previa se conserva sólo en memoria del navegador y su URL temporal se revoca al cerrar.

Cada cuenta dispone de 1 GB y 1.000 archivos, incluyendo papelera y reservas activas. La capacidad se verifica dentro de la escritura SQL; sólo se admite una transferencia activa por cuenta y dos en todo el piloto para acotar memoria del Worker. Las reservas vencen a los 15 minutos. La confirmación de D1 y auditoría es atómica; si un intento falla, se libera la reserva y se intenta quitar su blob. Una confirmación perdida se reconcilia antes de borrar para preservar un archivo ya confirmado. Un intento vencido no puede sobrescribir o eliminar el que lo reemplaza.

La papelera es reversible e impide la descarga hasta restaurar. No hay borrado definitivo, purga ni retención automática todavía. Los metadatos de carga viajan en el cuerpo binario, fuera de las cabeceras que puede registrar el proveedor. Nombres y contenidos no van a auditoría ni a registros de errores; sólo actor, acción, ID y fecha. Las pruebas de almacenamiento usan un bucket simulado, incluyendo errores de escritura, alteraciones y confirmaciones perdidas. No se han conectado antivirus, OCR ni un proveedor de IA. La validación de firma no sustituye un análisis antimalware.

R2 conserva originales, pero no se da por probada una estrategia independiente de backup. La prueba de recuperación del MVP debe incluir D1, objetos y las claves que permiten descifrarlos; restaurar sólo la base deja archivos inaccesibles. Definir retención, purga y reconciliación de reservas/blobs antes de ampliar el piloto.

## Recuperación y operación antes de ampliar el piloto

- Definir con Mauro la custodia y recuperación de TURI_VAULT_KEY y TURI_AUTH_PEPPER. Sin la llave no se recuperan códigos, registros ni archivos cifrados. La copia de base por sí sola no alcanza.
- Verificar retención y acceso a Time Travel de D1 en el entorno concreto. No se da por contratado un plazo por la documentación pública.
- Probar una restauración en una base separada, con sus claves y objetos, y registrar fecha/resultado antes del 11/11. Nunca restaurar directamente sobre la base activa durante una prueba.
- Invalidar sesiones después de un incidente o recuperación; reconciliar tareas externas antes de reanudarlas.
- Habilitar el servicio de correo, confirmar los destinatarios y probar entrega real antes de considerar disponible la recuperación. Un código fijo personal no es un código TOTP ni un segundo factor independiente.
- Definir retención de auditoría y limpieza de límites temporales. Rotar llaves con migración versionada; no reemplazar una llave activa sin un plan de recifrado.
- Revisión independiente de seguridad antes de exponer más usuarios, claves de compañía, documentos reales o decisiones automatizadas.

## Fuentes técnicas

- OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP Cryptographic Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html
- Cloudflare Workers crypto: https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/
- D1: https://developers.cloudflare.com/d1/worker-api/d1-database/
- OWASP File Upload: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- Cloudflare R2 Workers API: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
- D1 Time Travel: https://developers.cloudflare.com/d1/reference/time-travel/

## Contraseña del superadministrador por permiso del propietario

El propietario del Site puede emitir fuera de la aplicación un permiso aleatorio de 256 bits, con vencimiento, ligado a un superadministrador existente y al hash de su contraseña actual. Se configura sólo su hash y los metadatos como secreto TURI_ADMIN_PASSWORD_RESET_GRANTS. No hay un endpoint público para emitirlo. El enlace personal abre `/admin/crear-contrasena/`. El token llega por fragmento, se quita inmediatamente de la URL y se intercambia mediante POST por una cookie HttpOnly, Secure y SameSite=Strict limitada al vencimiento del permiso. No se guarda en localStorage o sessionStorage. La cookie permite retomar al actualizar en el mismo navegador; cada lectura revalida permiso, uso, cuenta y credencial. Puede abrirse el enlace original en otro navegador, sujeto al mismo uso único. El titular elige la contraseña en la pantalla; no necesita conocer la anterior ni confirmar primero su correo.

El Worker verifica token, vencimiento, cuenta, organización, rol activo y versión de contraseña. La transacción reclama el permiso una sola vez, cambia sólo password_hash, revoca sesiones e invalida desafíos anteriores. El código personal y el correo se conservan. La sesión nueva sigue exigiendo el rol superadmin actual. La auditoría contiene la acción sin tokens ni contraseñas. Este permiso deja de ser válido tras su uso o cualquier cambio de contraseña.

## Invitaciones adicionales de productores

TURI_PAS_INVITATIONS es un secreto opcional controlado por el propietario. Agrega invitaciones sin leer ni reemplazar TURI_INVITATIONS. Sólo admite entradas con role=producer; los roles enviados desde el formulario no se usan. La activación mantiene la contraseña elegida por el titular y la confirmación del código personal normal. Una invitación consumida no sobrescribe una cuenta existente. La denominación de prueba no cambia permisos ni aislamiento.

## Alta de PAS por el administrador

POST /api/pilot/admin/producers requiere una sesión completa de superadministrador, CSRF y el mismo origen. El servidor fija rol producer y la organización del administrador; ignora roles, IDs y organizaciones del formulario. Valida usuario y contraseña, rechaza duplicados sin modificar cuentas y guarda únicamente hashes de contraseña y código personal. La creación y su auditoría se hacen en una transacción con verificación de rol vigente. El código se entrega una sola vez al creador y no se registra en auditoría. La cuenta puede entrar después con la autenticación PAS normal. El navegador conserva las credenciales nuevas sólo en memoria hasta entrar como PAS o cerrar el diálogo; no se guardan en almacenamiento local.

## Servidor independiente

El adaptador Node usa el mismo Worker con SQLite y originales cifrados en disco. Sus claves se generan al primer inicio, se conservan en un archivo privado excluido de Git y deben respaldarse junto con la base y los objetos. El primer administrador requiere un permiso aleatorio mostrado en la terminal, origen válido y conexión de localhost; el alta inicial queda cerrada cuando existe un usuario. No se aceptan hosts arbitrarios ni cabeceras de IP aportadas por clientes. El adaptador limita el cuerpo y serializa las solicitudes para mantener las transacciones locales. El acceso externo debe usar HTTPS mediante el proxy del alojamiento elegido. No sustituye una revisión independiente ni un despliegue probado en ese alojamiento.
