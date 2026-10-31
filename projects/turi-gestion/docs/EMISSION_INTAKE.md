# Formularios y emisión - preparación para revisión del 30/10/2026

## Estado
Base publicada el 30/10/2026 en 9a51ce2. Los siguientes ajustes UX están preparados localmente para revisión, todavía sin publicar. Daniel utiliza datos reales: se exige aviso de alcance antes de publicar y consulta previa para cualquier eliminación de su información.

## Recorrido
1. PAS abre Formularios y emisión, desde un cliente o desde una propuesta aprobada. Puede elegir Autos, Hogar u Otros. La propuesta aceptada conserva compañía, importe, vigencia, franquicia y referencia originales como instantánea; no se modifica la cotización previa.
2. Guarda borrador y prepara enlace personal por siete días. Copia el enlace para WhatsApp o correo; Turi no envía mensajes automáticamente. El cliente no necesita cuenta ChatGPT ni acceso al tablero PAS.
3. Cliente completa tomador, titular del bien, riesgo y pago, agrega varios originales y confirma envío. Se admite información parcial para revisión posterior. El enlace se retira de la barra del navegador; no se guarda PII en almacenamiento local. El borrador del cliente permanece en memoria hasta enviar; salir o recargar advierte sobre cambios sin guardar. Puede reabrir el enlace original mientras siga vigente.
4. La recepción guarda una respuesta cifrada e inmutable. No crea ni edita un cliente por sí sola. Devuelve enlace para el PAS y constancia PDF con marca Turi; el PDF sólo incluye resumen, referencias y datos de pago mínimos.
5. PAS abre el enlace recibido o carga la constancia PDF, recupera la respuesta, la corrige y confirma revisión y cliente de destino. Recién entonces se incorpora al expediente. PDFs ajenos a esa constancia se adjuntan en Documentos y se cargan a mano: no hay OCR.
6. Fotos y PDFs originales pasan a Documentos del cliente sin recorte ni conversión. Hasta 20 por formulario y 10 MB por archivo; todos consumen la misma cuota de 1 GB y 1.000 documentos por cuenta. Fallos y reintentos no duplican archivos confirmados.
7. Movimientos de cobro se registran separados: pendiente, pago informado, confirmado según compañía o rechazado. Fecha, moneda, destinatario e importe; referencia obligatoria para estados informados/confirmados/rechazados. Es registro manual, sin ejecutar débitos ni emitir cobertura.

## Campos
Tomador: persona/empresa, nombre, documento, condición fiscal, nacimiento, estado civil, domicilio, correo y teléfono. Titular distinto: identidad, contacto, domicilio, relación e interés asegurable. Autos: marca, modelo, año, versión, patente, chasis, motor, combustible, uso, guarda, cobertura, suma, GNC y accesorios. Hogar: domicilio, tipo, ocupación, construcción, techo, superficie, antigüedad, seguridad, sumas y cobertura. Otros: descripción editable.
Fotos: cédula frente/dorso, frente/parte trasera/laterales, auxilio, techo, tablero, oblea GNC y otra documentación. La vista previa usa imagen completa; HEIC/HEIF y PDF se conservan descargables cuando no hay vista previa del navegador.

## Pago
CBU: banco, 22 dígitos, pagador, documento, relación y referencia de autorización. Validar longitud no verifica una cuenta bancaria ni autoriza cobrar. CBU completo sólo en el expediente privado cifrado; PDF muestra últimos cuatro dígitos.
Tarjeta: banco, marca, últimos cuatro y vencimiento; registro seguro pendiente. No se solicitan PAN completo ni CVV. La captura completa requerirá un proveedor validado y campos alojados por ese proveedor; no hay pasarela implementada.
Cuponera: efectivo, Mercado Pago, otra billetera u otro medio. Es elección prevista, sin integración de pagos.

## Compañías
Se amplía capacidad de registro a las 15 compañías existentes. Código PAS cifrado y versionado; no se migran ni reemplazan códigos guardados. Sin credenciales API no hay transacciones ni sincronización de tableros: las acciones explican qué falta dentro de Turi, sin abrir portales como sustituto de integración.
Mercantil Andina: API documentada, requiere usuario/contraseña API, suscripción/producto y token. Federación Patronal: cliente OAuth y usuario autorizado. Zurich: portal técnico identificado, producto y permisos pendientes de validar. Otras compañías: canal técnico por relevar. Las solicitudes de acceso previas no se reenvían.
Fuentes oficiales: https://apiportal.mercantilandina.com.ar/faqs ; https://api-sandbox.fedpat.com.ar/documentacion-autenticacion.html ; https://www.api-test.zurich.com.ar/apis .

## Preservación y publicación
0007 sólo crea cuatro tablas e índices. No modifica usuarios, credenciales ni filas de clientes, pólizas, siniestros, cotizaciones, tareas, conexiones o documentos existentes. Los cambios de cliente posteriores requieren acción explícita del PAS y versión vigente; los campos de identidad vacíos de una respuesta parcial conservan los valores anteriores. Se conserva la respuesta original y el historial del caso. Recuperar una versión del caso no revierte automáticamente el cliente.
Antes de aplicar: confirmar versión remota, obtener resguardo privado de información operativa cifrada, registrar esquema/conteos, aplicar sólo DDL nuevo y comprobar claves foráneas y filas preexistentes. No introducir datos ficticios en la cartera de Daniel. Si hay impacto inesperado, detener la publicación y avisar; no revertir cambios concurrentes del usuario.
Al publicar aparecerá una sección nueva y el flujo de propuestas aprobadas. Usuarios con una pestaña abierta deberán guardar su trabajo antes de actualizar. No se fuerza cierre de sesiones. El cotizador orientativo permanece y OCR sigue excluido.

## Ajustes UX del primer formulario (preparados para revisión)

- Seis casilleros de Autos identifican cédula verde frente/dorso y fotos de frente/laterales/trasera. Cada uno admite selección múltiple; opcionales agrega GNC, audio, accesorios y descripción libre. Claves de categorías previas se conservan; los originales no se convierten.
- Campanita en el encabezado y el inicio. Respuestas recibidas se consultan cada 30 segundos con la página visible, sin redibujar los campos abiertos y sin extender sesiones inactivas. Abrir el caso confirma lectura sólo para ese usuario. Una tabla nueva registra esas lecturas; no se reescribe la respuesta. Respuestas pendientes anteriores también aparecen.
- Recuperar datos del cliente es una acción principal junto al aviso de respuesta; enfoca los datos del tomador. Recuperar versión aparece arriba en la columna derecha y aclara que no revierte el cliente automáticamente.
- Ver original abre ventana modal visible con imagen completa o visor PDF propio, páginas y zoom. Recursos PDF.js 6.4.299 de Mozilla se sirven desde Turi; no se envían archivos a servicios externos. Sin scripting de PDF, eval o débito. Cerrar o cambiar de cuenta libera visor y URLs. El archivo descargable original no cambia.
- Domicilios muestran Localidad como No completar / lo completa tu PAS. Provincia y guarda usan desplegables; cambiar provincia actualiza localidades sin perder foco. Catálogo público de GeoRef: 24 provincias y 4.037 registros de localidades, descargado el 30/10/2026. No contiene equivalencias postales ni se presume una ciudad sólo con CP. Fuente: https://apis.datos.gob.ar/georef/api/localidades ; documentación: https://www.argentina.gob.ar/georef/ejemplos-de-uso . No se envían domicilios ni códigos postales de clientes al servicio externo.
- Sumas aseguradas no se solicitan al cliente. El PAS conserva edición y el servidor aplica sus valores. Datos que lleguen desde un formulario anterior se conservan como referencia para revisión, sin sustituir automáticamente los valores del PAS; las respuestas ya almacenadas no se alteran.

La migración 0008 sólo crea work_emission_reads y su índice. Antes de publicar se requiere resguardo y comparación de filas operativas, aviso de alcance y revisión de Mauro. No se fuerza recarga ni cierre de sesiones; clientes y PAS deben guardar antes de refrescar. Las pruebas usan el PAS ficticio y cuentas técnicas separadas.

## Campanita según la cartera seleccionada — 31/10/2026

La campanita del Superadministrador utiliza la misma cartera elegida en el selector de vista. Lista, contador y confirmación de lectura consultan `owner` en el servidor. Daniel muestra sólo sus novedades; otro PAS muestra sólo las suyas. `Toda la organización` agrega las carteras del tenant y muestra el productor de cada aviso. Un PAS regular conserva el filtro obligatorio de su propia cuenta y no puede seleccionar otra cartera mediante parámetros.

Cambiar de vista descarta inmediatamente lista, contador y popup de la vista anterior. Las consultas pendientes y las aperturas de caso tardías comprueban que la vista siga vigente antes de mostrar datos o marcar lectura. La lectura del Superadministrador sigue siendo personal: no consume la novedad pendiente del PAS titular.

Este ajuste no crea tablas, migra datos, reasigna casos, cambia destinatarios guardados ni reescribe respuestas u originales. Las pruebas se realizan con cuentas y clientes ficticios. No modifica las credenciales ni los datos de Daniel. La campanita actual informa respuestas de formularios; el filtro de cartera corrige su atribución visual sin presentar como recibidas respuestas de aseguradoras que aún no estén integradas.
