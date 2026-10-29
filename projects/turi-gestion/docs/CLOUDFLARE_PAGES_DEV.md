# Entorno de desarrollo en Cloudflare Pages

Proyecto: `turi-gestion-dev`, cuenta Cloudflare de CatchDog.

Ingreso de productores: https://turi-gestion-dev.pages.dev/privado/

Administración: https://turi-gestion-dev.pages.dev/admin/ El entorno tiene D1 y R2 propios; no usa la base, los documentos ni las claves del sitio en Sites.

## Git y compilación

- Repositorio: `mberchillc/CatchDog`.
- Rama: `demo/turi-gestion`.
- Carpeta raíz: `projects/turi-gestion`.
- Comando: `node scripts/build-pages.mjs`.
- Salida: `dist-pages`.
- Variables de compilación: `NODE_VERSION=24`, `SKIP_DEPENDENCY_INSTALL=1`.

El empaquetado utiliza el mismo Worker y los mismos recursos del MVP mediante el modo avanzado de Pages (`_worker.js`). No crea otra implementación de autenticación o permisos. Todas las rutas pasan por el Worker y conservan sus cabeceras de seguridad.

`wrangler.jsonc` declara la compatibilidad de Node y los bindings DB y BUCKET. Los identificadores de recursos no son credenciales. Las claves reales se configuran exclusivamente como secretos de Cloudflare; no van al repositorio, al build ni al navegador.

## Datos y secretos

- D1: `turi-gestion-dev-db`, binding `DB`.
- R2 privado: `turi-gestion-dev-documentos`, binding `BUCKET`.
- Secretos obligatorios: `TURI_AUTH_PEPPER` y `TURI_VAULT_KEY`.
- Para el primer ingreso del administrador: permiso temporal `TURI_ADMIN_PASSWORD_RESET_GRANTS`, ligado a la cuenta creada sólo en dev. El titular elige su contraseña mediante el enlace personal; no hay contraseña administrativa predeterminada.
- Correo: `RESEND_API_KEY` y `TURI_MAIL_FROM` se configuraron como secretos cifrados del entorno de desarrollo. La clave de Resend tiene sólo permiso de envío para `notificaciones.catchdog.net`; el remitente es `Turi Gestión <acceso@notificaciones.catchdog.net>`.
- `TURI_PUBLIC_URL=https://turi-gestion-dev.pages.dev` hace que el texto del correo enlace al entorno correcto.

Las migraciones de `drizzle/` se aplican únicamente a esta base con `wrangler d1 migrations apply turi-gestion-dev-db --remote`. No apuntar ese comando a una base ajena.

## Uso y validación

El administrador entra por `/admin/`, crea los PAS de prueba desde Productores y cada PAS entra por `/privado/`. El enlace de ingreso de productores puede compartirse con terceros: sólo requieren una cuenta Turi, sin cuenta de ChatGPT ni GitHub.

Verificar en cada publicación: ingreso de PAS, creación de cliente, subida de un PDF, descarga del original y rechazo de acceso a administración desde la cuenta PAS. El flujo también se verificó con Wrangler Pages y el motor local de Cloudflare, usando D1 y R2 locales.

La raíz `/` abre la entrada al MVP privado. La demo ilustrativa con acceso Dani/1234 fue retirada el 29/10/2026. El alta real de productores se realiza con una invitación personal: cada uno elige sus credenciales y recibe una cartera vacía.

Validación de correo (28/10/2026): las 12 pruebas de recuperación pasan, incluidos códigos incorrectos, vencidos, uso único, límites de intentos, revocación de sesiones y enlaces por entorno.

## Carga múltiple y cuentas de prueba

Las cuentas de Sites y Cloudflare son independientes. Crear los PAS desde la administración del mismo entorno donde se harán las pruebas. El PAS de prueba solicitado se habilitó con rol productor en Cloudflare sin importar datos de Sites.

Documentos permite reunir hasta 20 archivos por lote, hasta 10 MB por archivo, seleccionando varios juntos, agregando selecciones sucesivas o arrastrando archivos. La bandeja muestra miniaturas, permite quitar pendientes y conserva la selección al fallar. Reintentar omite los confirmados y conserva el identificador de los intentos pendientes. Los formatos aceptados y el almacenamiento cifrado original se conservan. HEIC/HEIF se previsualizan cuando el navegador puede decodificarlos; si no, se informa y se permite guardar el original.

Validación (28/10/2026): 19 pruebas de documentos y selección pasan, incluida carga múltiple contra el backend, aislamiento por PAS, originales, vistas previas, límites, rechazo de contenido no permitido y recuperación tras interrupción.
