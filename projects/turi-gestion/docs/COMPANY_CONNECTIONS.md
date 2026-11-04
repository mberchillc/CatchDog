# Diez conexiones prioritarias del piloto

Revisión: 04/11/2026. Selección operativa dentro del catálogo existente de Turi, combinando relevancia para el trabajo del PAS y evidencia del canal de integración. El orden de las fichas indica prioridad de trabajo para este piloto. El catálogo conserva quince compañías y las conexiones anteriores.

| Compañía | Evidencia técnica | Canal para avanzar |
| --- | --- | --- |
| Mercantil Andina | Guía recibida, endpoint de autenticación de QA y campos documentados. Prueba de autenticación implementada, pendiente de credenciales emitidas para el piloto. | [Portal API y FAQ](https://apiportal.mercantilandina.com.ar/faqs), des-api@lamercantil.com.ar. |
| Experta | Documentación de Autos, test, cartera y Novedades. Autos y Novedades tienen autenticaciones diferentes. | [Autos API](https://autos-developers.apiexperta.com.ar/docs/APIS-DOCS/Autos-API/), [pedido de credenciales de Novedades](https://autos-developers.apiexperta.com.ar/docs/APIS-DOCS/Novedades-API/pedido-credenciales/index.html), soporte-autos-api@experta.com.ar. |
| San Cristóbal | Canal B2B identificado. Documentación, alcance y permiso para Turi pendientes. | Soporte B2B facilitado por Mauro: soporteb2b@sancristobal.com.ar. [Referencia oficial de B2B](https://www.sancristobal.com.ar/institucional/automotor-refacturacion-mensual-canal-b2b). |
| Federación Patronal | Sandbox y autenticación publicados. Habilitación de sistemas externos sujeta a aprobación. | [Documentación de autenticación](https://api-sandbox.fedpat.com.ar/documentacion-autenticacion.html) y ejecutivo del PAS. |
| Provincia | PS2 anuncia servicios web de integración y APIs. La especificación del producto y las credenciales deben habilitarse para el PAS. | [PS2](https://ps2.provinciaseguros.com.ar/) y ejecutivo. |
| Allianz | Especificación WS de documentos, versión 2.0 de octubre de 2023: pólizas y certificados. Confirmar vigencia, acceso y otros servicios. | [Especificación oficial](https://marketing.allianz.com.ar/EspecificacionesWS.pdf), soportews@allianz.com.ar. |
| Zurich | Portal técnico de APIs de Argentina identificado; productos y permisos requieren acceso. | [Portal argentino de prueba](https://www.api-test.zurich.com.ar/apis) y ejecutivo. |
| La Segunda | Portal de agencias. Especificación API y habilitación de Turi pendientes de confirmación. | [Portal](https://app-launcher.papps.lasegunda.com.ar/) y ejecutivo/mesa de agencias. |
| Rivadavia | Canal de productores. Especificación y permiso API pendientes de validación. | [Productores](https://www.mutualrivadavia.com.ar/productores) y ejecutivo. |
| Sancor | Portal Intermediarios y herramientas PAS. Contrato API de Argentina y acceso para Turi pendientes. | [Herramientas PAS](https://www.sancorseguros.com.ar/pas) y ejecutivo. |

Las páginas públicas y la documentación permiten preparar la integración. Cada operación concreta requiere credenciales, permisos y pruebas con atribución al PAS. Las credenciales o tokens publicados como ejemplo en documentación no se precargan ni utilizan para la cartera del piloto.

## Recorrido en Turi

1. Compañías muestra las diez fichas aunque la cuenta todavía no haya registrado un código. Las demás compañías ya registradas siguen disponibles debajo.
2. Configurar API de prueba permite guardar el código PAS obligatorio en la primera carga, CUIT opcional y, cuando estén disponibles, usuario y contraseña del portal.
3. El apartado API recibe los datos técnicos habilitados para cada servicio. La coincidencia con el acceso del portal debe confirmarla la compañía.
4. Guardar configuración cifra los datos en la conexión del titular. Los campos vacíos conservan lo guardado; reemplazar usuario/contraseña o Client ID/Secret requiere completar el par.
5. Mercantil ofrece además Guardar y probar acceso QA. La prueba usa las credenciales guardadas exclusivamente desde el servidor. Las demás fichas conservan estado pendiente mientras se valida el conector.

El CUIT del titular del piloto se completó por correo con Mercantil. Los identificadores y códigos reales no se incorporan al código fuente, al catálogo público ni a fixtures de prueba.

## Protección y compatibilidad

Los datos se almacenan en el payload cifrado existente de pilot_connections, ligados a organización, productor, compañía y versión. No se aplican migraciones ni se actualizan automáticamente las conexiones o expedientes de Daniel.

La lectura del titular devuelve código enmascarado e indicadores de campos guardados; permite editar su CUIT. Al elegir un productor en Cartera o Ver como PAS, el Superadministrador abre la misma aplicación del productor: mismas secciones, fichas, botones y formularios, incluida Configurar API de prueba. Una barra exterior identifica la cuenta supervisada y permite cambiar de PAS o volver a Superadmin.

La supervisión es de solo lectura: las consultas usan los mismos handlers y el ámbito del productor, bajo la sesión real del administrador. No crea ni renueva sesiones PAS, no marca sus notificaciones como leídas y bloquea guardados, eliminaciones, acciones de cuenta y pruebas de conexión tanto en navegador como en servidor. Las vistas previas y descargas usan el mismo ámbito; la auditoría atribuye las consultas al Superadmin. Los secretos siguen enmascarados como en la cuenta del titular. Sólo se admiten productores activos de la misma organización y se vuelven a comprobar permisos en cada consulta.

Los registros de auditoría no contienen valores de credenciales, CUIT o códigos PAS.

Las escrituras comprueban origen, CSRF, permisos, sesión vigente, límite por cuenta y control de versión. Un cambio de permisos o revocación antes de la escritura impide guardar. El guardado de configuración no efectúa llamadas externas. Los endpoints de proveedor no se toman de campos del navegador.

Cambiar el código PAS o los datos API invalida la autenticación de QA. Modificar sólo el acceso al portal conserva la validación existente de Mercantil. Reemplazar un código mediante la pantalla anterior conserva las credenciales cifradas y deja la conexión pendiente de revalidación.

Validación: pruebas de configuración, pares de credenciales, preservación, cifrado, aislamiento, concurrencia, revocación, diez fichas y respuestas tardías. La supervisión incluye comparación de DOM y de los diez formularios contra la cuenta PAS, consultas con los mismos datos, aislamiento entre perfiles, bloqueo de escrituras y atribución de descargas. Las respuestas externas de estas pruebas son simuladas; la primera autenticación real del piloto permanece pendiente de credenciales emitidas.
