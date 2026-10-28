# Exploración del cotizador por cobertura y compañía

Pedido de Daniel Stern transmitido por Mauro el 27/10/2026. Prioridad: después de publicar PDF y fotos privados. El explorador se implementó en el espacio privado del PAS de Cloudflare dev el 28/10/2026. Trabaja sobre propuestas registradas y conserva la aprobación del productor; la conexión del formulario público y los conectores de aseguradoras siguen en sus etapas previstas.

## Cambio acordado

La presentación de tres opciones ayuda a simplificar la decisión final, pero antes debe existir una exploración de las propuestas disponibles. El cliente o el PAS podrá empezar por una cobertura (por ejemplo, terceros completo) y ver las compañías que la ofrecen, o elegir una compañía y recorrer sus coberturas. Ambos filtros se pueden combinar y limpiar. Tres recomendaciones no deben ocultar las demás alternativas que realmente estén disponibles.

## Recorrido a implementar

1. Cargar los datos mínimos del riesgo y advertir cuándo una propuesta es preliminar o requiere datos adicionales.
2. Mostrar un explorador con dos formas de entrada: por cobertura o por compañía. Explicar cuántas propuestas devolvieron las fuentes consultadas, cuáles están pendientes y qué falló.
3. Aplicar los filtros sobre ese conjunto. Si no hay coincidencias, permitir cambiar filtros o pedir asesoramiento; no inventar precios ni coberturas.
4. Comparar las alternativas elegidas con compañía, cobertura, límites, franquicia, importe, moneda, período, vigencia y fuente. Mostrar diferencias materiales aunque el nombre de la cobertura coincida.
5. Conservar el expediente, sus documentos y atribución al PAS. La revisión y aprobación siguen siendo del productor; el último clic del cliente no emite cobertura legal.

Los nombres de coberturas varían entre aseguradoras. Hace falta mapear categorías comparables sin perder condiciones originales. El filtro no puede equiparar dos productos sólo por contener las palabras «terceros completo». La selección de una compañía muestra sus productos disponibles para ese riesgo; no implica mostrar su catálogo completo si la fuente no lo devuelve.

## PASAP como referencia

Fuente oficial revisada el 27/10/2026: https://pasap.com.ar/

PASAP declara multicotización, emisión, CRM/cartera, autogestión, documentación, cobranzas y seguimiento de siniestros; publica siete compañías integradas. Se toma como referencia del problema del PAS y de amplitud operativa. La web comercial no verifica qué API permite cada ramo, las condiciones para usar códigos propios ni el comportamiento de su comparador autenticado. No se inspeccionó una cuenta privada ni se solicitaron credenciales de PASAP.

La decisión de Turi sobre explorar por compañía/cobertura proviene del mensaje de Daniel. No se atribuye ese recorrido a PASAP sin haberlo verificado dentro de la plataforma.

## Criterios de aceptación

- Se puede explorar por cobertura, por compañía y por ambos criterios, mostrando recuentos y selección vigente.
- El usuario puede ver todas las propuestas disponibles o quitar los filtros; las recomendaciones no recortan silenciosamente el conjunto.
- Se distingue entre resultados verificados, gestión asistida, respuestas pendientes y ejemplos de demo.
- Precios de diferente moneda o período no se ordenan como si fueran equivalentes.
- Selección, comparación y borrador conservan las condiciones y fuentes de esa versión.
- Cualquier CTA de atención humana continúa hacia https://wa.me/5491130216824.

## Implementación del 28/10/2026

- Cotizaciones → Ver expediente: filtros combinables de compañía, categoría de cobertura y vigencia; recuento del conjunto completo y opción para quitar filtros.
- Selección de propuestas conservada al filtrar y comparación lado a lado, sin limitar la oferta a tres resultados. La selección se revisa cuando cambia la versión de una propuesta.
- Los importes se agrupan por moneda y período; la comparación avisa cuando difieren. Se muestran cobertura original, límites, franquicia, vigencia, fuente, notas y estado.
- La categoría de búsqueda la confirma el PAS al registrar o editar una propuesta. Los registros anteriores quedan sin clasificar hasta esa revisión; no se infieren equivalencias a partir de palabras similares.
- Seguimiento manual por compañía: pendientes, incidencias y ausencia de propuesta. El recuento de propuestas recibidas se obtiene del expediente. No se afirma una consulta automática que no ocurrió.
- Campos nuevos opcionales dentro de los payloads cifrados existentes; sin migración destructiva ni cambios a contraseñas, sesiones o atribución. Ediciones antiguas conservan los campos nuevos.
- Verificadas 41 pruebas de exploración, operación, permisos, documentos y alta de PAS. QA de navegador con seis propuestas claramente ficticias en una base local aislada.
