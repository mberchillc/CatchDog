# Multicotización automática — decisión y prueba del MVP
Corte: 28/10/2026. Repositorio CatchDog, Turi Gestión en Cloudflare Pages.

## Objetivo
Un pedido del PAS se transforma en un riesgo normalizado, se completa sólo lo que falta y se consulta en paralelo a las compañías habilitadas. Las propuestas vuelven con origen, referencia, vigencia, moneda, período, cobertura, límites y suma asegurada. El PAS revisa la elección. El comparador manual existente sigue disponible para expedientes anteriores; no es la solución principal de automatización.

## Qué se implementó en esta iteración
- Laboratorio privado en “Multicotizador”, sin modificar usuarios ni expedientes.
- Consulta en texto libre y revisión editable de datos reconocidos. No se inventa código postal, uso, suma asegurada ni versión de catálogo.
- Extracción por reglas limitada, con interfaz de servidor para Workers AI. Sin binding AI y bandera TURI_QUOTE_AGENT_ENABLED=true, no se llama a un modelo y la UI lo informa. No se activaron servicios de IA.
- El agente sólo propone campos presentes en el texto; su salida se valida. No puede generar precios, elegir endpoints, atribuir compañías ni aprobar una propuesta.
- Motor de consultas paralelas con tiempo máximo por conexión, validación de respuesta y fallas independientes.
- Fixture explícito: Chevrolet Celta 1.4 LT 2014, Villa Ballester, terceros completo. Dos compañías ficticias, ARS 41.000 y 46.500 mensuales inventados. No representan compañías reales ni una estimación de mercado.
- El modo real responde API_ACCESS_REQUIRED. No cae silenciosamente a precios simulados.
- Los resultados de prueba viven en memoria; no se guardan en work_offers ni se pueden aprobar/emitir.
- Referencia pública con contexto y motivo de descarte, sin cálculo ni extrapolación a Villa Ballester.

No hay cotizaciones reales por API todavía. No se implementaron endpoints privados inferidos, scraping de portales de productores ni automatizaciones de emisión.

## Acceso comprobado y prioridades
| Compañía | Evidencia primaria | Acceso necesario | Decisión |
| --- | --- | --- | --- |
| Mercantil Andina | Portal anuncia datos vehiculares, cotizar y emitir automotores. FAQ confirma QA. | Registro y suscripción; usuario/contraseña API; clave de suscripción; scopes/producto y documentación concreta. | Primera candidata para QA; acceso pendiente. |
| Federación Patronal | Portal sandbox lista Vehículos, Cotización, Producto, Emisión. Autenticación documentada. | Cliente habilitado, CLIENT_ID/CLIENT_SECRET, usuario y contraseña autorizados, permisos y documentación de Cotización. | Segunda candidata para sandbox; acceso pendiente. |
| Allianz | Documento público de WS de prueba para pólizas/certificados. | Confirmar disponibilidad actual, servicio de cotización automotor, contrato y sandbox. | Evidencia parcial: documentos no demuestran cotización. |
| La Segunda | Portal propio y presencia en integradores; no se confirmó documentación pública suficiente del servicio automotor. | Solicitar API, sandbox, ramo/acción y condiciones. | Pendiente de verificación técnica. |
| Rivadavia | Portal PAS e integraciones comerciales conocidas. | Especificación y habilitación de cotización automotor. | Pendiente de verificación técnica. |
| Sancor Seguros | Portal PAS. Documentación encontrada de Brasil no se aplica a Argentina. | APIs de Argentina, permisos y sandbox. | Pendiente de verificación técnica. |
| San Cristóbal | Sitio Seguro y Portal anuncian cotización/emisión. | Confirmar API delegable para terceros y sandbox. | Pendiente de verificación técnica. |
| Zurich | Canal digital y referencias a ecosistemas de integración. | API automotor Argentina y sandbox autorizado. | Pendiente de verificación técnica. |
| Provincia Seguros | Portal PAS/canal de cotización. | API automotor y sandbox autorizado. | Pendiente de verificación técnica. |
| MAPFRE | Canal digital; no se confirmó API automotor utilizable por Turi. | API Argentina, producto, permisos y sandbox. | Pendiente de verificación técnica. |
| La Holando | Holandonet y documentación de cotizadores. | API automotor, credenciales técnicas y sandbox. | Pendiente de verificación técnica. |
| Experta | Cotizadores/atención a productores. | API automotor, permisos y sandbox. | Pendiente de verificación técnica. |
| Triunfo Seguros | Canal de productores de la lista actual. | Documentación y acceso autorizados. | Pendiente de verificación técnica. |
| ATM Seguros | Su página de estado menciona API ecommerce y consulta de propuesta vehicular. | Documentación, uso por terceros y sandbox; página de estado no concede acceso. | Evidencia parcial; no conectar endpoints internos. |
| La Perseverancia | Portal y procesos de cotización digital. | API automotor y sandbox autorizado. | Pendiente de verificación técnica. |

“Pendiente de verificación” no significa que la compañía no tenga API. Tener un cotizador web tampoco demuestra que exista una API de terceros abierta.
Para todos: confirmar por escrito si el QA puede usarse sin código PAS y qué habilitación/atribución exige producción. Credenciales técnicas y código comercial del PAS son cosas distintas.

## Fuentes verificadas
- https://apiportal.mercantilandina.com.ar/
- https://apiportal.mercantilandina.com.ar/faqs
- https://api-sandbox.fedpat.com.ar/servicios.html
- https://api-sandbox.fedpat.com.ar/documentacion-autenticacion.html
- https://api-sandbox.fedpat.com.ar/solicitar-api-access.html
- https://marketing.allianz.com.ar/EspecificacionesWS.pdf
- https://www.sancristobal.com.ar/institucional/con-tu-sitio-seguro-ahora-podes-mas
- https://status.atmseguros.com.ar/
- https://lps.com.ar/novedades/202608/lps-turismo-nuevas-coberturas-a-la-medida-de-cada-viaje/
- Contexto anterior: Page “01 Mercado y APIs”, 10/10/2026, https://chatgpt.com/space/page_b1c318c3810081918ffdba9c644e689b
- Alternativa de agregador: https://absanetservices.net/ anuncia API y varias compañías. Falta verificar licencia para integrar, sandbox, permisos por PAS, costos, SLA y exportación. No está conectado.

## Caso Celta y búsqueda pública
https://cemiberica.com/seguros-auto/precios/ publica una tabla de enero de 2026: ARS 24.700–48.000/mes para terceros completo en autos chicos de 3 puertas (incluye Celta). Sus condiciones son San Miguel de Tucumán y vehículos de hasta cinco años. Se descarta como tarifa del Celta 2014 de Villa Ballester. Otras cifras en la misma página difieren; no se mezclan.
Una publicación de Atlas Broker para Celta 2014 corresponde a Capital Federal CP1290 y no acredita fecha tarifaria vigente. No se reutiliza.
Google puede devolver un número sin que sea la cotización del riesgo indicado. No hay un precio actual verificable para este caso en la evidencia consultada.

## Contrato de conector real (siguiente paso tras habilitación)
1. Catalogar localidad/CP y versión exacta con identificadores del proveedor. Confirmar faltantes con el PAS, sin volver a cargar lo conocido.
2. Autenticar únicamente desde servidor con secretos; separar credenciales QA/producción y productor/organización.
3. Mapear el riesgo al esquema DOCUMENTADO del proveedor. No se adivinan URLs ni campos.
4. Normalizar respuesta con sourceType=insurer_api, insurerId, environment, requestId, providerQuoteId, receivedAt, validUntil, premiumCents, currency, period, coverageCategory, insuredValue, limits, exclusions y fuente original protegida.
5. Persistir en expediente atribuido al PAS y tenant correctos, con trazabilidad e idempotencia; mantener aprobación humana y sin emisión automática.
6. Aceptación: un solo pedido, dos respuestas QA con referencias reales, error parcial sin perder la otra respuesta, ninguna contraseña en navegador, ninguna oferta de prueba aprobable como real.

El motor actual sólo acepta respuestas simulation. El adaptador y la persistencia reales se implementarán contra contratos verificados, no contra este fixture.

## Próximos hitos para el 13/11
1. Solicitar acceso QA de Mercantil Andina y sandbox de Federación Patronal; confirmar condiciones para pruebas sin código PAS. Preparar alternativa de agregador si demora la habilitación.
2. Reemplazar cada fixture por adaptador documentado y probar el caso con respuesta real de sandbox antes de declararlo integrado.
3. Prueba con Dani y PAS regular: misma carga, comparación por coberturas/límites, tiempos y errores; conectar formulario público al expediente y cerrar permisos antes del congelamiento.

## Verificación adicional del sandbox de Federación Patronal
Se abrió en navegador la documentación de Cotizacion 2.1.1 y se obtuvo el OpenAPI público desde https://api-sandbox.fedpat.com.ar/v1/cotizacion-api/api-docs. Servidor declarado: https://api-sandbox.fedpat.com.ar/v1. Operación de alta: POST /cotizador-automotores/. Requiere autenticación; no se ejecutó una cotización. El esquema exige fecha_desde, medio_pago, razon_social, contratante y vehiculo. Vehículo requiere anio, infoauto, localidad_de_guarda y tipo_vehiculo; contratante requiere condicion_iva. Los códigos se resuelven contra catálogos y no se sustituyen por valores inventados. Otros requisitos pueden depender de validaciones de negocio y permisos.
El formulario solicitar-api-access.html devuelve Cannot GET el 28/10/2026. Se identificó soporte@fedpat.com.ar como API Support en el OpenAPI y en la documentación de cotización para pedir derivación al alta de integraciones.

## Validación local
49 pruebas aprobadas (extracción, control del agente, fixture restringido, concurrencia y fallas parciales, auth/CSRF, aislamiento PAS, expedientes, documentos y alta de productores). Recorrido comprobado en navegador con un PAS regular local. Build Pages correcto. Esta iteración permanece local para revisión; no se subió a la rama que publica Cloudflare.

## Orientación comercial: captar y retener al cliente · 28/10/2026
La multicotización debe ayudar al PAS a conseguir una propuesta competitiva. La inteligencia de precios de fuentes públicas es una línea de trabajo propia y puede avanzar mientras se tramitan los accesos de aseguradoras.

### Recorrido objetivo
1. Recuperar del expediente o póliza la cuota actual, compañía, cobertura, suma asegurada, límites y adicionales. Pedir sólo los datos que falten; la lectura automática de pólizas es una capacidad pendiente de implementación.
2. Registrar una meta comercial elegida por el PAS y un conjunto de coberturas mínimas. Una meta no es un precio que Turi pueda prometer.
3. Buscar referencias públicas y registrar fuente primaria, fecha de publicación/consulta, rango, vehículo/zona/perfil aplicables y faltantes. La respuesta de un buscador con IA puede orientar la búsqueda; su resumen no reemplaza la evidencia subyacente.
4. Consultar a las compañías habilitadas con el mismo riesgo. Distinguir cotizaciones de producción, respuestas de sandbox, estimaciones públicas y simulaciones de interfaz. Una referencia pública nunca se atribuye a una aseguradora como oferta ni habilita aprobación/emisión.
5. Ordenar primero las propuestas válidas que cumplen la cobertura mínima y el objetivo; luego las que cumplen cobertura pero no llegan al precio objetivo. Mostrar alternativas con menor protección o equivalencia pendiente como tales, con sus diferencias antes de elegir.
6. Presentar al PAS ahorro mensual y porcentual frente a la cuota actual. El ahorro anual sólo se expresa condicionado a que ambas cuotas y condiciones se mantengan durante el período. Evaluar precio regular y duración de promociones, no sólo el primer mes.
7. Si ninguna propuesta alcanza el objetivo, informar el mejor resultado real obtenido y el motivo; el sistema no cambia la tarifa ni completa el vacío con un importe inventado.

### Comparabilidad para la revisión del PAS
- Misma versión/año del vehículo, zona, uso y período de pago; antigüedad de los datos y vencimiento de la propuesta.
- Tipo de cobertura, suma asegurada, RC, robo/incendio, granizo y cristales, franquicias, topes, exclusiones y asistencia.
- Condiciones y duración de descuentos, requisitos de pago y costos incluidos.
- Si faltan condiciones de la póliza actual o de la propuesta, mostrar equivalencia pendiente; un precio menor por sí solo no acredita una mejora equivalente.
- La interfaz puede explicar cada diferencia en lenguaje simple. Las condiciones relevantes se presentan al PAS y al cliente; el tamaño de la compañía no prueba por sí solo el precio ni la calidad de la cobertura.

### Evidencia y limitaciones de la referencia compartida
- Google AI Mode: https://share.google/aimode/EZgPXRuG0yjR2pDdQ. Se leyó la conversación compartida: consulta por Celta 1.4 LT modelo 2012 en Villa Ballester; el caso anterior del MVP decía 2014. Confirmar el año antes de cotizar; no modificar el expediente por inferencia.
- La tabla generada por Google presenta terceros completo con granizo/cristales a ARS 75.000–90.000/mes. Es una estimación de buscador, sin compañía tarifante ni referencia de cotización.
- Fuente primaria de precios revisada: https://segurosonline.com.ar/blog/precio-seguro-auto, publicación 23/06/2026. Publica terceros completo ARS 60.000–90.000/mes para gama baja/usado del AMBA. No confirma en esa tabla la combinación exacta de granizo/cristales ni el precio de ese Celta concreto.
- Condiciones a revisar: https://www.allianz.com.ar/blog-allianz/todo-riesgo-terceros.html explica que los adicionales y límites dependen del plan/póliza; no hay un precio único para todos los riesgos.

### Estado de implementación
Este apartado fija el criterio de producto. El laboratorio existente sigue usando dos compañías ficticias y no tiene búsqueda web automática ni cotización real activadas. Falta implementar la obtención de referencias con procedencia, vincular la póliza actual y agregar objetivo/ahorro al comparador. Las credenciales de aseguradoras siguen pendientes de habilitación.
Los importes reales y datos personales comunicados por el usuario para este caso no se precargan en el código público ni se incorporan al repositorio.

## Implementación posterior · 29/10/2026
La cotización progresiva, las fuentes y el objetivo comercial ya se implementaron localmente. El estado anterior de laboratorio con dos ofertas ficticias queda como antecedente técnico; la interfaz principal ahora guarda pedidos iniciales y muestra referencias, sin esas ofertas ficticias. Estado y publicación pendientes detallados en PROGRESSIVE_QUOTES.md.
