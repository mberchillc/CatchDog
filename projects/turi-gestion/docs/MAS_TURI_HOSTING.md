# Instalación de Más Turi bajo el dominio de Turi

## Opción recomendada para la infraestructura actual

Mantener la dirección pública **https://www.turi.com.ar/masturi/** en el alojamiento actual de WordPress y conservar Turi Gestión y su API en Cloudflare. El código fuente continúa en GitHub.

El DNS de `turi.com.ar` consulta actualmente `ns1.allytech.com` y `ns2.allytech.com` (verificado el 07/11/2026). Una ruta `/masturi/` no es un registro DNS. Para esta opción no hay que cambiar los nameservers, el correo ni la web principal.

## Archivos para el host

El paquete contiene una carpeta `masturi/` con HTML, estilos, comportamiento, logo, personaje y fuentes. Copiar esa carpeta en la raíz pública del mismo sitio que sirve WordPress, sin reemplazar su `index.php`, su `.htaccess` ni otros archivos.

La entrega actualizada del 09/11/2026 suma 17 logos en `masturi/assets/insurers/`, el carrusel **Nos respaldan**, textos en positivo, íconos de productos y navegación para volver. **Cancelar cotización** limpia los campos, vuelve a la selección inicial y muestra **cotización cancelada** durante tres segundos. El botón corresponde a una consulta que todavía no se envió; después de recibir el resultado se oculta. El carrusel admite flechas, teclado y desplazamiento táctil, y permite pausar la reproducción automática. Si el dispositivo tiene movimiento reducido, comienza pausado.

Las reglas habituales de WordPress dejan pasar directorios y archivos reales. Si el host tiene reglas distintas, pedirle que excluya `/masturi/` del enrutamiento del editor de WordPress. No pegar el HTML dentro de un bloque del editor ni usar un iframe.

La landing llama por HTTPS al endpoint público de Turi Gestión en Cloudflare. El endpoint sólo acepta los orígenes Turi configurados y conserva cifrado, atribución del vendedor, consentimiento e idempotencia. El paquete no contiene secretos ni acceso administrativo.

Si el hosting aplica una política CSP propia, habilitar `connect-src https://turi-gestion-dev.pages.dev` para esta landing. No ampliar el resto de las políticas sin necesidad.

Después de subir:

1. Verificar HTML, logo, personaje y fuentes en `https://www.turi.com.ar/masturi/`.
2. Hacer una consulta real acordada, con consentimiento, y verificar su recepción en el perfil vendedor de Mauro. No cargar datos ficticios en la cartera de Daniel.
3. Definir la URL canónica de producción y las redirecciones antes de promover campañas, evitando versiones indexables duplicadas.
4. Configurar el botón web de la página Facebook Más Turi hacia esa URL, con `utm_source=facebook&utm_medium=social&utm_campaign=masturi`. Luego usar el mismo criterio para IG y LinkedIn.

Página Facebook: `https://www.facebook.com/muchomasturi/`.

Enlace final para el botón y las publicaciones de Facebook, una vez que `/masturi/` esté operativo:

`https://www.turi.com.ar/masturi/?utm_source=facebook&utm_medium=social&utm_campaign=masturi`

La landing ya enlaza a esa página Facebook y registra las campañas que traigan visitas. Las consultas web entran en el perfil vendedor de Mauro; no se mezclan con la cartera propia de Daniel.

La automatización de publicaciones o anuncios por Meta requiere por separado permisos, activos de negocio y credenciales válidas. Un enlace web o un `utm_source` no prueba una conexión Graph API.

## Alternativas

- Un proxy en el hosting o una ruta Worker permiten conservar `/masturi/` con el front end en Cloudflare; exigen acceso a la configuración del servidor o una zona Cloudflare activa.
- `masturi.turi.com.ar` también mantiene la marca bajo Turi y se puede conectar a Pages mediante un dominio personalizado y un CNAME, pero cambia la dirección pública a un subdominio.

Referencia oficial: https://developers.cloudflare.com/workers/configuration/routing/routes/ y https://developers.cloudflare.com/pages/configuration/custom-domains/.
