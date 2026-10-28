# Ejecutar Turi Gestión independientemente

## Inicio y persistencia

Requisitos: Node.js 24 o posterior y dependencias instaladas en la carpeta del proyecto (`npm install --package-lock=false`). `npm start` prepara el Worker y abre un servidor en localhost. No necesita credenciales de Sites ni cuenta de ChatGPT.

La primera ejecución imprime una dirección de configuración con un permiso aleatorio temporal. Sólo permite crear el primer administrador desde localhost; no existe una contraseña administrativa predeterminada. El permiso no se guarda en Git ni en la base. Tras crear el administrador, la ruta de primer inicio queda cerrada. Si se pierde ese enlace antes de crear la cuenta, reiniciar el servidor genera uno nuevo.

El administrador crea PAS desde **Productores → Crear PAS de prueba**. Todos son usuarios con rol `producer` en la misma organización local, con carteras separadas. La contraseña la elige el operador; el código personal se muestra una sola vez. Los demás PAS no pueden leer una cartera ajena ni acceder a administración.

Los datos se conservan en `.turi-data/` por defecto:

- `database.sqlite` y sus archivos auxiliares: cuentas, sesiones, auditoría y registros del MVP.
- `keys.json`: llaves privadas necesarias para autenticar y descifrar; no compartir ni publicar.
- `objects/`: originales cifrados de los documentos.

Para una copia consistente, detener el servidor y copiar la carpeta completa. No reemplazar las llaves de una base ya creada. Las bases y claves de la web en Sites no se importan a esta instancia.

## Configuración del servidor

| Opción | Uso |
| --- | --- |
| `PORT` o `--port` | Puerto; valor inicial 5173. |
| `TURI_DATA_DIR` | Directorio privado persistente. |
| `--host` | Interfaz; por defecto 127.0.0.1. |
| `TURI_PUBLIC_ORIGIN` | URL HTTPS pública exacta cuando existe un proxy externo. |
| `RESEND_API_KEY` y `TURI_MAIL_FROM` | Secretos opcionales de correo transaccional. |

Ejemplo local: `node scripts/serve.mjs --port 5174`. Preparar antes el Worker con `npm run build` si no se usa `npm start`.

## Compartir con terceros

1. Crear primero la administración desde localhost, sin `TURI_PUBLIC_ORIGIN`.
2. Instalar el servidor en un alojamiento con disco persistente y acceso HTTPS mediante un proxy configurado por su operador. GitHub Pages no ejecuta este backend.
3. Configurar `TURI_DATA_DIR` en un volumen privado persistente y `TURI_PUBLIC_ORIGIN=https://dominio-elegido.example` con la dirección real del alojamiento.
4. Ejecutar el servidor detrás del proxy. El navegador del visitante sólo necesita la dirección pública y su cuenta Turi. No necesita cuenta GitHub ni ChatGPT.
5. Si el proxy está en otro equipo o contenedor, usar `--host 0.0.0.0` y restringir el acceso directo al puerto. El primer inicio público se rechaza hasta que exista un administrador.
6. Verificar ingreso como PAS, alta de cliente, carga/descarga de PDF y recuperación de correo en el alojamiento real antes de usarlo para una demostración.

Las cookies conservan Secure, HttpOnly y SameSite=Strict. Para compartir el acceso fuera de localhost se necesita HTTPS. El adaptador verifica el Host configurado y el origen de los cambios; no confía en cabeceras de IP enviadas por el visitante. Las solicitudes se procesan en orden para respetar las transacciones de SQLite en este piloto.

Este cambio prepara un backend independiente y persistente; no publica por sí solo un servicio externo ni migra los datos guardados en Sites.
