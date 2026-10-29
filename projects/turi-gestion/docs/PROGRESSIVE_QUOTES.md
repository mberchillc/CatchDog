# Estimación inicial y cotización Turi — 29/10/2026

El PAS puede describir el vehículo o completar marca/modelo y pulsar «Estimar con lo que tengo». Todos los otros datos son opcionales. La respuesta numérica se muestra arriba del formulario, recibe el foco y queda guardada con el pedido. Un pedido completamente vacío también se guarda, pero pide identificar el vehículo para calcular.

## Cálculo y procedencia
- Fiat Chronos se normaliza a Fiat Cronos. Cronos terceros completo: piso publicado de ARS 85.000 (Matías Ferri, 17/09/2026), combinado con techo general de gama media ARS 130.000 (SegurosOnline, 23/06/2026). Punto medio redondeado: ARS 108.000 mensuales. Es una construcción orientativa, no un rango textual cotizado por una compañía.
- Peugeot 208 y Toyota Hilux usan sus rangos publicados; otros modelos usan bandas generales por cobertura y segmento explícito, o gama baja/media cuando no está clasificada la versión.
- No se inventan coeficientes por localidad, edad, año, valor asegurado, granizo o cristales. Su efecto pendiente figura como supuesto.
- Granizo/cristales no se presentan incluidos en el precio base cuando la fuente no los confirma. El antecedente de Google sigue identificado como resumen de IA para el perfil específico del Celta.
- Cuota actual y objetivo comercial no modifican el estimador.
- Biblioteca de ocho fuentes revisadas: no hay búsqueda web en vivo ni consulta tarifada a aseguradoras. Mercantil Andina y Federación Patronal siguen sin conexión habilitada.

## Guardado y PDF
La estimación completa, fecha, fuentes y método se guardan en el payload cifrado del pedido. El reintento idempotente devuelve exactamente esa instantánea. Retomar no recalcula silenciosamente; actualizar incrementa versión y calcula una nueva referencia.

«Descargar cotización Turi · PDF» recupera primero la última versión autorizada del servidor. Se bloquea al editar sin guardar o si otra pantalla reemplazó la versión. Usa logo Turi, importe, rango, datos, campos pendientes, fuentes y «Valor aproximado sujeto a aprobación final». No contiene el objetivo comercial interno y no otorga cobertura. El PDF se genera en el navegador, sin enviar datos a un servicio externo.

Generador pdf-lib 1.17.1 distribuido con su licencia MIT en public/vendor, servido desde el mismo origen. No requiere claves ni dependencias del servidor. No se necesita migración adicional.

## Verificación
62 pruebas de operación, documentos, cotizaciones y productores; 27 pruebas adicionales de seguridad y recuperación. Aprobadas localmente. Incluyen Cronos/Caseros, texto libre, modelos distintos, cambios de cobertura, vacío, reintentos, cifrado, versiones, aislamiento por PAS, navegación, descarga y PDF de dos páginas con logo. El PDF se extrajo y renderizó para verificar sus dos páginas. Flujo de navegador probado con PAS regular local: calcular y descargar.

La verificación del entorno publicado se registra por separado, con datos sintéticos aislados. Nunca se usa la presencia de un menú como prueba de que una integración funciona.
