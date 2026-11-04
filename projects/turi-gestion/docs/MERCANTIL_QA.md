# Mercantil Andina: primera validación API

Actualizado: 04/11/2026. La autenticación de QA está implementada; todavía no se ejecutó con credenciales emitidas para el piloto.

## Alta externa pendiente

El equipo API respondió el 03/11 y entregó su guía de conexión. El procedimiento exige:

1. Registrarse en https://apiportal.mercantilandina.com.ar/ y suscribirse a los productos necesarios.
2. Obtener la Subscription Key desde el perfil.
3. Solicitar al equipo API la creación y vinculación del usuario de test. Informar código PAS, identificación y CUIT del titular/organización, email y teléfono, finalidad y funcionalidades.
4. Recibir el usuario API y su contraseña de test. El registro en el portal no crea por sí solo estas credenciales.

Contacto verificado en el hilo recibido y en la guía: `des-api@lamercantil.com.ar`. Los datos personales y códigos reales del titular no se guardan en este repositorio.

## Implementado

Desde Compañías, el productor titular puede abrir **Configurar API de prueba** en Mercantil, registrar su código PAS y guardar el acceso al portal. En la sección de credenciales API puede cargar usuario API, contraseña y Subscription Key. **Guardar y probar acceso QA** valida los datos guardados desde el servidor. Los campos vacíos conservan las credenciales ya guardadas; reemplazar un par de usuario/contraseña requiere ingresar ambos.

El servidor realiza `POST https://apidev.mercantilandina.com.ar/credenciales/v2/`, con `Content-Type: application/x-www-form-urlencoded`, cabecera `Ocp-Apim-Subscription-Key`, `client_id=api-clientes-login`, `grant_type=password`, `username` y `password`. Son los datos del pedido de autenticación publicado en la guía entregada. No se utilizan las claves de ejemplo del PDF.

La prueba requiere una respuesta OAuth con `access_token`. Ante un formato diferente se informa respuesta pendiente de revisión; no se afirma autenticación exitosa. Se impiden redirecciones y se limita tiempo y tamaño de respuesta. Los errores del proveedor no se copian a respuestas o logs.

La configuración se guarda cifrada antes de ejecutar la prueba. Una respuesta válida registra la autenticación de QA; una prueba fallida conserva la configuración y muestra el motivo. El token no se devuelve al navegador ni se persiste. La actualización conserva el código PAS y usa control de versión. Una sesión revocada, cambio de permisos o conexión reemplazada durante la llamada impide guardar.

La vista de supervisión recibe únicamente estado y versión. El relevamiento comercial/técnico se conserva por separado. Las pruebas usan cuentas, códigos y respuestas ficticios en bases locales aisladas.

## Criterio de aceptación pendiente

`qa_auth_verified` significa únicamente que Mercantil aceptó las credenciales de QA. Todavía no acredita la atribución del código PAS, consulta de cartera, cotización o emisión. Esas capacidades permanecen deshabilitadas.

Para el primer pull se necesita además la especificación vigente de cartera/pólizas, permisos de consulta y una respuesta verificable del productor habilitado. Primero se comprueba una respuesta en QA y su atribución; la importación a cartera requiere mapeo, identificadores estables, control de duplicados y validación posterior. No se infieren URLs privadas ni se usa scraping del portal.

## Publicación y datos existentes

La etapa agrega el endpoint de autenticación y su formulario. No aplica migraciones, cambia cuentas ni modifica expedientes existentes. Al usarla con éxito, el titular actualiza exclusivamente su conexión de Mercantil y su versión; un relevamiento de la versión anterior debe revisarse de nuevo.

Validación: pruebas de contrato HTTP, errores, límites, ausencia de secretos, permisos, CSRF, aislamiento, cifrado, versiones concurrentes, revocación durante llamada y formulario del PAS. Hasta recibir y probar las credenciales del piloto, no declarar una conexión real operativa.

El 04/11 se completó por correo el dato fiscal solicitado. Las otras nueve fichas están preparadas según [COMPANY_CONNECTIONS.md](COMPANY_CONNECTIONS.md).
