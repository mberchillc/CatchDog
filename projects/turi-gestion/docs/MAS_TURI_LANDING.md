# Landing Más Turi

## URL y objetivo

- Vista publicada por el proyecto de desarrollo: `https://turi-gestion-dev.pages.dev/masturi/`.
- Ruta prevista en la web madre: `https://www.turi.com.ar/masturi/`.
- Responsable de las consultas: usuario `mauro` de Turi Gestión.
- Contacto visible: WhatsApp `+54 11 7303 6399` y `mberchillc@gmail.com`.

La landing recibe tráfico de navegación, asistentes de IA y redes. Conserva `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` y el referer. Cada consulta queda cifrada dentro de `work_quote_intakes`, atribuida al propietario configurado por `TURI_MASTURI_OWNER_USERNAME`.

## Alcance de la primera versión

- Diez coberturas principales abren directamente su formulario: auto, camioneta, moto, hogar, comercio, caución, accidentes personales, responsabilidad civil, vida y salud.
- El selector **Busco otra cosa** suma veinte coberturas especiales y una opción abierta **Otro** con el campo **Contanos qué necesitás**.
- Auto y camioneta: estimación mensual orientativa basada en la biblioteca de fuentes revisadas de Turi Gestión.
- Los demás ramos generan una solicitud guiada para revisión personal. No se muestra un precio sin fuente o API válida.
- Resultado con seguimiento por WhatsApp y correo.
- Consentimiento obligatorio, campo trampa, límite por IP, control estricto de origen e idempotencia.
- Las consultas aparecen en **Cotizaciones** del titular con origen, datos de contacto y campaña.

La estimación no es una oferta, no aprueba el riesgo y no confirma cobertura. La emisión requiere revisión del productor y aceptación de la aseguradora.

## Integración con WordPress

DNS no puede apuntar una ruta como `/masturi`; sólo puede apuntar dominios o subdominios.

Opciones, por orden recomendado:

1. Si `turi.com.ar` está proxied por Cloudflare, usar un Worker o regla de origen para servir `/masturi/*` desde el proyecto Pages, conservando `https://www.turi.com.ar/masturi/`.
2. Usar `masturi.turi.com.ar` como dominio personalizado del proyecto Pages. Esta opción sí se resuelve sólo con DNS.
3. Hacer reverse proxy desde el host de WordPress hacia la ruta Pages.
4. Copiar la landing al host de WordPress. En ese caso deben copiarse también las fuentes, el logo y el personaje, y declarar `data-api-base="https://turi-gestion-dev.pages.dev"` en el elemento `<html>`. El endpoint acepta únicamente los orígenes Turi configurados.

No usar un `iframe`: las cabeceras de seguridad de Turi Gestión bloquean el embebido y es preferible mantener una URL navegable, medible y accesible.

## URLs de campaña

- Redes: `/masturi/?utm_source=instagram&utm_medium=social&utm_campaign=lanzamiento`
- IA: `/masturi/?utm_source=chatgpt&utm_medium=assistant&utm_campaign=cotizador`
- Navegación: `/masturi/?utm_source=turi&utm_medium=website&utm_campaign=menu`
- Producto directo: `/masturi/?tipo=auto&utm_source=facebook&utm_medium=paid_social&utm_campaign=autos`

No incluir datos personales en parámetros de URL.
