# Recuperación automática por correo

Estado del 27/10/2026: flujo implementado y probado con envío simulado. **No está activo el envío real:** faltan el remitente autorizado y la API key de Resend en el entorno de producción. No se enviaron correos reales durante las pruebas. No se sustituye la entrega por WhatsApp.

## Recorrido acordado

1. En el acceso privado, elegir **Olvidé mis datos de acceso**.
2. Completar sólo el correo registrado y confirmado. No se pide usuario, contraseña ni código personal anterior.
3. Si coincide con una única cuenta activa, el servidor envía un código aleatorio de seis dígitos. La respuesta pública no revela si esa dirección tiene una cuenta.
4. Ingresar el código recibido. Vence en 10 minutos, permite cinco intentos y se consume una sola vez.
5. Después de validarlo, crear y repetir una contraseña nueva de al menos 14 caracteres, diferente de la anterior. El permiso de cambio tiene 10 minutos y sobrevive una recarga en el mismo navegador.
6. Turi informa el nombre de usuario y muestra un código personal nuevo para copiar, guardar y confirmar. Ese código personal es fijo y no vence.

Se conservan roles, clientes, pólizas, expedientes y documentos. Se cierran las sesiones anteriores. El correo de recuperación se confirma una sola vez desde **Mi correo** en una sesión del titular; al activar el servicio, una cuenta sin correo confirmado ve un aviso para completar ese paso.

## Activar el remitente

El adaptador ya usa la API HTTPS de Resend. No necesita Meta Business Suite ni una sesión de ChatGPT de los productores.

1. Usar una cuenta de Resend del proyecto y un dominio cuyo DNS pueda administrar el titular. Puede ser un subdominio dedicado, por ejemplo `notificaciones.catchdog.net`, si Mauro elige y tiene acceso a ese dominio. El ejemplo no está provisionado.
2. Agregar el dominio en Resend, copiar en DNS únicamente los registros indicados por el proveedor y esperar su verificación. No modificar MX, web ni correo existentes del dominio principal.
3. Crear una API key con permiso sólo de envío, restringida al dominio elegido.
4. Configurar mediante el panel seguro de secretos de Sites: `RESEND_API_KEY` y `TURI_MAIL_FROM`. Ejemplo de formato del segundo: `Turi Gestión <acceso@notificaciones.catchdog.net>`. No pegar claves, contraseñas ni tokens en este documento, GitHub o el chat.
5. Volver a desplegar la versión guardada para aplicar la nueva revisión del entorno. Conservar los secretos de cifrado y autenticación existentes.
6. Entrar con la cuenta del titular y confirmar **Mi correo**. Una dirección guardada pero no confirmada aún no habilita recuperación.
7. Probar una recuperación real completa con una cuenta de prueba consentida: recibir código, validarlo, crear contraseña, guardar código personal e ingresar. Verificar Spam y los eventos de entrega del proveedor. No pedir al usuario que comparta los códigos o contraseñas.

Crear `turigestion@gmail.com` por sí solo no configura este adaptador. Gmail se puede usar como dirección receptora; enviar desde Gmail requiere otra integración y autorización del remitente. La conexión de Gmail de ChatGPT no es una credencial disponible para el backend de la plataforma.

Hasta completar esta activación, el sitio mantiene visible el formulario, informa que el envío está pendiente y deshabilita su botón. El backend devuelve `EMAIL_NOT_CONFIGURED` si se intenta invocar directamente. No muestra mensajes de envío exitoso inventados.

## Verificación técnica

`node scripts/build-worker.mjs`

`node --test tests/security.test.mjs tests/workspace.test.mjs tests/documents.test.mjs tests/recovery-link.test.mjs tests/email-recovery.test.mjs`

Las once pruebas específicas cubren el recorrido completo del Worker, cookies y DOM, correos desconocidos o sin confirmar, límites, expiración, permisos falsificados, reuso, concurrencia, invalidación al cambiar credenciales, conservación de datos, fallos del proveedor y pantalla de servicio no configurado. La entrega real se verifica aparte, después de activar el remitente.

Para revisar sólo el diseño sin cuentas ni envíos: `node tests/render-recovery.mjs` y el preview administrado. Las cuatro vistas estáticas están en `qa/visual`, fuera del build y del repositorio.

## Documentación primaria

- [Resend: dominio verificado y subdominios](https://resend.com/docs/dashboard/domains/introduction).
- [Resend: administración de API keys](https://resend.com/docs/dashboard/api-keys/introduction).
- [Google: autorización de servidor para Gmail API](https://developers.google.com/workspace/gmail/api/auth/web-server).
