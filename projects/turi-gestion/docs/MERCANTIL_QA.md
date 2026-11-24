# Mercantil Andina: primera validación API

Actualizado: 24/11/2026. Mercantil entregó un usuario de TEST y una colección oficial de servicios. Se creó y verificó una suscripción activa al producto Auto en el portal del responsable técnico. La primera autenticación desde Cloudflare falló por el modo `redirect: 'error'`, que Workers no admite. La corrección usa `manual` y rechaza los estados 3xx sin reenviar credenciales. La validación real posterior a esa corrección sigue pendiente; todavía no se acredita conexión de producción.

Tras publicar la corrección se comprobó desde la aplicación la autenticación real de TEST y una coincidencia única de la cuenta del productor. Las primeras consultas de operaciones y cobranzas recibieron una estructura que requiere revisar su compatibilidad; todavía no se acredita una lectura de cartera operativa. El validador admite el indicador de página cero sólo cuando listado, total y páginas son cero; cualquier otra incompatibilidad informa exclusivamente tipos, contadores numéricos y nombres de campos reconocidos, sin copiar el cuerpo del proveedor.

El registro del desarrollador y su Subscription Key son distintos del acceso comercial del productor y del usuario API de TEST. El código, las credenciales y las claves reales se mantienen fuera de este repositorio.

## Alta externa pendiente

El equipo API respondió el 03/11 y entregó su guía de conexión. El procedimiento exige:

1. Registrarse en https://apiportal.mercantilandina.com.ar/ y suscribirse a los productos necesarios.
2. Obtener la Subscription Key desde el perfil.
3. Solicitar al equipo API la creación y vinculación del usuario de test. Informar código PAS, identificación y CUIT del titular/organización, email y teléfono, finalidad y funcionalidades.
4. Recibir el usuario API y su contraseña de test. El registro en el portal no crea por sí solo estas credenciales.

Contacto verificado en el hilo recibido y en la guía: `des-api@lamercantil.com.ar`. Los datos personales y códigos reales del titular no se guardan en este repositorio.

## Implementado

Además de la autenticación, el formulario ofrece **Guardar y consultar TEST**. Primero consulta `/productores/v1/` y exige una coincidencia única entre la cuenta devuelta y el código PAS guardado. Sólo entonces permite consultar operaciones, cobranzas, rechazos o comisiones en `/cartera/v1/`. El parámetro de cuenta se deriva del registro cifrado del titular; no se acepta una cuenta libre enviada por el navegador. Comisiones requiere indicar la rama del proveedor.

Cada consulta admite hasta 31 días y 20 resultados por página. Se comprueba la cuenta de productor de cada resultado antes de mostrar un resumen limitado. Una cuenta distinta, respuesta ambigua, paginación inesperada, fallo de permiso o formato desconocido bloquean el resultado completo. Se revalidan sesión, permisos, autorización y versión antes de entregarlo al navegador. Hay límites de solicitudes, tiempo y tamaño. Los tokens sólo existen durante la solicitud del servidor.

Los resultados de TEST se muestran dentro del formulario y no se importan: no crean clientes, pólizas, cobros, liquidaciones ni solicitudes. El éxito de estas consultas no habilita producción, cotización automática ni emisión. La primera ejecución publicada debe realizarse en el PAS ficticio de Mauro, con los accesos TEST habilitados por Mercantil y separado del perfil y los expedientes reales de Daniel.

Desde Compañías, el productor titular puede abrir **Configurar API de prueba** en Mercantil, registrar su código PAS y guardar el acceso al portal. En la sección de credenciales API puede cargar usuario API, contraseña y Subscription Key. **Guardar y probar acceso QA** valida los datos guardados desde el servidor. Los campos vacíos conservan las credenciales ya guardadas; reemplazar un par de usuario/contraseña requiere ingresar ambos.

El servidor realiza `POST https://apidev.mercantilandina.com.ar/credenciales/v2/`, con `Content-Type: application/x-www-form-urlencoded`, cabecera `Ocp-Apim-Subscription-Key`, `client_id=api-clientes-login`, `grant_type=password`, `username` y `password`. Son los datos del pedido de autenticación publicado en la guía entregada. No se utilizan las claves de ejemplo del PDF.

La prueba requiere una respuesta OAuth con `access_token`. Ante un formato diferente se informa respuesta pendiente de revisión; no se afirma autenticación exitosa. Se impiden redirecciones y se limita tiempo y tamaño de respuesta. Los errores del proveedor no se copian a respuestas o logs.

La configuración se guarda cifrada antes de ejecutar la prueba. Una respuesta válida registra la autenticación de QA; una prueba fallida conserva la configuración y muestra el motivo. El token no se devuelve al navegador ni se persiste. La actualización conserva el código PAS y usa control de versión. Una sesión revocada, cambio de permisos o conexión reemplazada durante la llamada impide guardar.

El Superadmin puede guardar configuración y probar QA en el perfil PAS seleccionado. Los secretos no se devuelven; los cambios conservan al PAS titular y la auditoría identifica al administrador. El relevamiento comercial/técnico se conserva por separado. Las pruebas usan cuentas, códigos y respuestas ficticios en bases locales aisladas.

## Criterio de aceptación pendiente

`qa_auth_verified` significa únicamente que Mercantil aceptó las credenciales de QA. No acredita la atribución del código PAS, consulta de cartera, cotización o emisión. La atribución y el servicio consultado se verifican de nuevo en cada lectura TEST y no se convierten en un estado de conexión de producción.

La colección oficial recibida sirve como contrato de las consultas implementadas. Falta comprobar las credenciales emitidas y sus permisos con respuestas reales de QA. La importación a cartera requiere además mapeo, identificadores estables, control de duplicados y validación posterior. No se infieren URLs privadas ni se usa scraping del portal. La habilitación para operar sobre la cartera real debe confirmarla Mercantil por separado.

## Publicación y datos existentes

La etapa corrige el transporte de autenticación y agrega consultas de TEST al formulario y a un endpoint privado. No incluye migraciones ni escrituras en expedientes. Guardar configuración actualiza exclusivamente la conexión del PAS seleccionado y su versión; un relevamiento de la versión anterior debe revisarse de nuevo. El endpoint de lectura no modifica esa conexión ni importa resultados. El entorno dev contiene datos reales de Daniel, por lo que la validación publicada se mantiene en el PAS de prueba.

Fuentes: [portal de Mercantil](https://apiportal.mercantilandina.com.ar/faqs), [colección oficial recibida](https://drive.google.com/file/d/11-Kp6kvHLhhGpbCOjMpDfC9ZDXsH0QYr/view), [modos de redirección admitidos por Cloudflare](https://developers.cloudflare.com/workers/runtime-apis/request/).

Validación: pruebas de contrato HTTP, errores, límites, ausencia de secretos, permisos, CSRF, aislamiento, cifrado, versiones concurrentes, revocación durante llamada y formulario del PAS. Hasta recibir y probar las credenciales del piloto, no declarar una conexión real operativa.

El 04/11 se completó por correo el dato fiscal solicitado. Las otras nueve fichas están preparadas según [COMPANY_CONNECTIONS.md](COMPANY_CONNECTIONS.md).
