# Turi Gestión

MVP para la operación del productor asesor de seguros: clientes, pólizas, siniestros, tareas, solicitudes y propuestas, documentos PDF/fotos, compañías y supervisión de productores. El alcance y el calendario hacia el 13/11 están en [ROADMAP](docs/ROADMAP.md).

## Probar en la web

- [Administración](https://turi-gestion-demo.mb1312.chatgpt.site/admin/): usuario propio de Super Admin.
- [Ingreso de productores](https://turi-gestion-demo.mb1312.chatgpt.site/privado/): usuario, contraseña y código personal de Turi.
- La dirección pública abre sin una cuenta de ChatGPT. El inicio de sesión de Turi protege la cartera de cada productor.

Desde **Super Admin → Productores → Crear PAS de prueba**, el administrador elige nombre, usuario y contraseña del productor. La plataforma muestra su código personal una sola vez. Después de guardarlo, **Entrar como PAS** usa el ingreso normal y abre la vista de un productor regular. También se puede conservar la administración abierta y entrar al PAS desde una ventana de incógnito. No se reemplazan usuarios existentes.

## Ejecutar fuera de Sites

Se necesita Node.js 24 o posterior. El servidor funciona con SQLite y archivos en disco, usando el mismo Worker, permisos, cifrado, validaciones y pantallas del MVP. No requiere Sites, Cloudflare, cuenta de ChatGPT ni sus servicios para funcionar localmente.

```text
git clone --branch demo/turi-gestion https://github.com/mberchillc/CatchDog.git
cd CatchDog/projects/turi-gestion
npm install --package-lock=false
npm start
```

En Windows también se puede ejecutar `Iniciar-Turi.cmd` dentro de esa carpeta, después de instalar Node.js.

En el primer inicio, la terminal muestra un enlace personal para crear la administración local. Abrirlo, elegir usuario y contraseña y luego usar **Productores → Crear PAS de prueba**. En los siguientes inicios se ingresa por `http://localhost:5173/admin/`. El PAS entra por `http://localhost:5173/privado/`.

Los datos persisten en `.turi-data/`: base SQLite, claves locales y originales cifrados de los documentos. Reiniciar conserva las cuentas, los clientes y los PDF. Esa carpeta está excluida de Git. Para restaurar este entorno se necesita la carpeta completa; conservar sus claves junto con la base y los objetos.

La instancia local comienza vacía y tiene sus propias cuentas. No importa datos ni credenciales de la web publicada. Los ejemplos deben identificarse con `PRUEBA`.

Opciones y publicación independiente: [EJECUCION_INDEPENDIENTE](docs/EJECUCION_INDEPENDIENTE.md). Recorrido sugerido para Mauro y Dani: [PRUEBAS_PAS](docs/PRUEBAS_PAS.md).

## Validar el código

```text
npm run build
npm run test:private
npm test
```

Las pruebas privadas cubren autenticación, recuperación, permisos, aislamiento entre PAS, creación de usuarios por el administrador, clientes, relaciones, documentos, código personal y recorridos de interfaz. El servidor independiente incluye una prueba de crear cuentas, guardar un cliente y PDF, reiniciar y recuperar el original con las mismas claves. La demo ilustrativa mantiene 70 verificaciones.

`npm run dev` es sólo el adaptador de QA en memoria con cuentas ficticias documentadas en `scripts/dev.mjs`; sus datos desaparecen al reiniciar. Para pruebas persistentes se usa `npm start`.

## Correo y claves

La web publicada usa Resend con un remitente verificado; Mauro confirmó la entrega real del correo de recuperación el 28/10/2026. Las pruebas automatizadas simulan el proveedor. Para habilitar el correo en una instancia independiente, configurar `RESEND_API_KEY` y `TURI_MAIL_FROM` sólo en el servidor. Sin ellos se puede operar, pero la recuperación por correo informa que no está disponible. Nunca se guardan claves reales en GitHub.

Los usuarios PAS confirman un correo propio para recuperar el acceso. La recuperación sigue correo → código temporal → nueva contraseña → código personal nuevo. Los controles se describen en [SECURITY](docs/SECURITY.md) y [EMAIL_RECOVERY](docs/EMAIL_RECOVERY.md).

## Código y alojamiento

El código para revisión y pruebas está en la rama `demo/turi-gestion` de `mberchillc/CatchDog`, carpeta `projects/turi-gestion`. El `main` y otros proyectos del repositorio se conservan.

Sites sigue alojando la web pública actual; `.openai/hosting.json` conserva su identidad. El servidor Node independiente no usa autenticación de ChatGPT ni esa configuración de alojamiento. Este repositorio permite probar el MVP fuera de Sites; GitHub por sí mismo no aloja el backend, su base ni los PDF.

Para compartir un enlace independiente con terceros se debe alojar el servidor en un equipo o servicio con HTTPS, almacenamiento persistente y copia de seguridad. La guía independiente describe la configuración. La configuración de la web publicada y sus datos no se migran automáticamente.

La demo pública (`/`) es ilustrativa y usa Dani / 1234 con 230 pólizas ficticias en el navegador. Las funciones del MVP que guardan registros están en `/privado/` y `/admin/`.
