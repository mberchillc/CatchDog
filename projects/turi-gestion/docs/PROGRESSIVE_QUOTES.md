# Cotización progresiva y fuentes de orientación
Estado: implementado y probado el 29/10/2026. Publicación en Turi dev autorizada por el titular; verificación del despliegue registrada en el cierre de esta conversación.

## Comportamiento
- El PAS puede pedir una orientación inicial desde el primer paso, sin campos obligatorios y sin cliente previamente cargado.
- Descripción libre con lectura inicial por reglas; completar datos conocidos conserva los valores ingresados por el PAS. La conexión con IA sigue desactivada.
- Campos opcionales de vehículo, ubicación, cobertura, granizo/cristales; uso, guarda, combustible, puertas, GNC, alarma, edad, siniestros, valor, pago e IVA.
- Compañía actual, cuota mensual y objetivo permiten calcular el ahorro buscado. No se precargan importes ni datos del caso familiar real.
- Se guarda un pedido inicial cifrado en work_quote_intakes, atribuido a usuario y organización. Puede retomarse en Cotizaciones y actualizarse con control de versión.
- La clave de reintento evita duplicados ante una respuesta perdida. El hash del contenido usa HMAC con secreto del servidor.
- Los pedidos iniciales no se convierten en work_offers ni habilitan aprobación o emisión.
- Los campos desconocidos permanecen desconocidos. Datos iniciales pendientes y requisitos técnicos de cada compañía se muestran sin bloquear la orientación.
- Mercantil Andina y Federación Patronal siguen sin conexión habilitada: el pedido todavía no se envía a esas APIs.

## Fuentes incorporadas
La biblioteca versionada está en public/quote-sources.json. Es una selección revisada, no una búsqueda automática en vivo.
1. Google AI Mode, búsqueda compartida: https://share.google/aimode/EZgPXRuG0yjR2pDdQ. Antecedente Celta 1.4 LT 2012, Villa Ballester, sin choques. Tabla de IA: RC 35–55 mil, TC 60–75 mil, TC con granizo/cristales 75–90 mil ARS/mes. No es respuesta de una aseguradora.
2. SegurosOnline: https://segurosonline.com.ar/blog/precio-seguro-auto. Publicación 23/06/2026, usados/gama baja AMBA; TC 60–90 mil ARS/mes. No confirma adicionales en esa tabla.
3. SegurLine: https://www.segurline.com.ar/seguro-chevrolet-celta. Confirma que describe TC y Full con adicionales; sin tarifa reutilizable.
4. BBVA: https://www.bbva.com.ar/economia-para-tu-dia-a-dia/ef/seguros/cuanto-sale-un-seguro-de-auto.html. Variables del vehículo, conductor, cobertura y entorno.
5. Sancor: https://www.sancorseguros.com.ar/auto. Información oficial de productos; no se extrapolan promociones.
6. Santander: https://www.santander.com.ar/personas/seguros/seguro-de-auto. Promociones por canal y duración; no se aplican automáticamente a Turi.
7. Allianz: https://www.allianz.com.ar/blog-allianz/todo-riesgo-terceros.html. Coberturas, adicionales, límites y franquicias.
Las fuentes incluyen alcance, revisión, fecha de publicación cuando está disponible y límites de aplicabilidad.

## Aplicabilidad del marco
El antecedente de Google sólo se asocia al pedido cuando se identifica Chevrolet Celta, localidad y cobertura. Se muestran diferencias explícitas de localidad/año/versión y datos desconocidos. No se ajusta una prima ni se infiere un precio por compañía.
Para otro vehículo, o datos insuficientes, se conserva el pedido y se muestra que aún no hay un rango asociado. El acceso a las fuentes permanece disponible.
La fuente de precios primaria y el resumen de IA permanecen separados; el rango con adicionales no se atribuye a la tabla de SegurosOnline.

## Archivos principales
- worker/multiquote.js: validación, preparación, orientación, persistencia, idempotencia y versiones.
- public/multiquote.js / .css: formulario progresivo, marco, fuentes, objetivo y resultados.
- public/quote-sources.json: biblioteca con procedencia.
- worker/workspace.js / public/workspace.js: listado y recuperación de pedidos.
- drizzle/0005_progressive_quote_intakes.sql, db/schema.ts y snapshot: tabla nueva, sin cambiar tablas o usuarios existentes.
- tests/progressive-quotes.test.mjs: flujo con backend, aislamiento, campos incompletos, reintentos, cifrado, navegación y cambio de sesión.

## Verificación
56 pruebas distintas aprobadas entre cotizador, expedientes, comparación, documentos y productores. Incluyen pedir con todos los campos vacíos, completar más tarde sin duplicar, retomar en Cotizaciones, rechazar datos ajenos/CSRF/versiones incorrectas y evitar exposición de una respuesta pendiente al cambiar de cuenta.
Build Pages correcto. Verificación visual con PAS local regular; datos de prueba en memoria.

## Publicación autorizada
El titular revisó las capturas y autorizó publicar en Turi dev el 29/10/2026. El procedimiento aplica la migración aditiva a turi-gestion-dev-db, publica la rama demo/turi-gestion y verifica un pedido incompleto y su recuperación con un PAS regular.
Destino: https://turi-gestion-dev.pages.dev/privado/#view=multiquote
No declarar la consulta de aseguradoras activa hasta obtener y validar las credenciales de sandbox/QA.
