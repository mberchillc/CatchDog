# Seguridad y privacidad · primer piloto

Estado: implementación inicial del 27/10/2026. Esto documenta controles y límites; no certifica una auditoría externa ni la habilitación de integraciones de aseguradoras.

## Identidades y permisos

No se utilizan las credenciales Dani/1234 de la maqueta para datos reales. Cada usuario activa su cuenta con un enlace aleatorio de un uso y vencimiento. El token sólo viaja en el fragmento del enlace y en el POST de activación; se borra del historial visible al abrir. El servidor guarda el hash autorizado en configuración secreta y nunca acepta el rol enviado por el navegador.

Las contraseñas se procesan con HMAC y un pepper separado de la base, seguido de scrypt N=16384, r=8, p=5, sal aleatoria y 32 bytes de resultado. Es una de las configuraciones equivalentes publicadas por OWASP; permite limitar el uso de memoria en Workers. Las contraseñas no se cifran para su posterior lectura.

Segundo factor TOTP de 6 dígitos, período de 30 segundos y ventana ±1. Se bloquea la reutilización del mismo intervalo. Ocho códigos de recuperación de un uso; se muestran una vez y se guardan como hashes. El secreto de TOTP se cifra, separado lógicamente de los accesos de compañías.

Sesiones opacas de una hora como máximo y 15 minutos de inactividad; la sesión de configuración vence en 10 minutos. Cookie __Host-, HttpOnly, Secure y SameSite=Strict. CSRF y origen se validan en cada escritura. Límite de intentos por usuario/IP. Cada petición consulta el estado de la sesión en el servidor; la revocación del superadministrador es efectiva en la siguiente petición.

El productor puede operar sólo sobre sus conexiones. El superadministrador supervisa metadatos y actividad de su organización, sin lectura de códigos ni credenciales. No hay endpoint de revelación ni exportación de secretos al navegador.

## Códigos y conexiones

Cifrado AES-256-GCM con nonce aleatorio por versión. La autenticación del cifrado incluye organización, productor, compañía y versión; mover un dato cifrado a otra cuenta o compañía invalida su lectura. La llave se configura como secreto del entorno; no forma parte de GitHub, HTML, localStorage ni la base de datos.

Se permiten hasta 10 compañías por productor. La comprobación de capacidad está en la misma sentencia SQL que inserta; la combinación productor/compañía es única. Reemplazos usan una versión esperada para impedir sobrescrituras silenciosas. Los códigos se tratan como texto, conservando ceros iniciales.

La primera fase sólo admite códigos PAS. Contraseñas de portal y tokens permanecen bloqueados por configuración y no aparecen en el formulario. Su habilitación requiere permiso, revisión del conector, pruebas del despliegue y decisión documentada. Registrar un código no abre una sesión en una aseguradora ni valida un permiso de cotización.

## Auditoría y minimización

La auditoría registra actor, acción, identificador y fecha. No incluye códigos, claves, contenido de formularios ni tokens de sesión. Los errores públicos son genéricos; no se imprimen cuerpos de solicitudes ni errores de base con parámetros. Los intentos se agrupan en claves hash temporales; no se conserva la IP en texto en esa tabla.

El espacio privado tiene CSP, no-referrer, bloqueo de iframes y respuestas de API sin caché. Ninguna IA recibe códigos o credenciales. La demo pública contiene sólo los datos ficticios anteriores; la cartera real y documentos privados se incorporan en la siguiente fase con permisos de backend.

## Recuperación y operación antes de ampliar el piloto

- Definir con Mauro la custodia y recuperación de TURI_VAULT_KEY y TURI_AUTH_PEPPER. Sin la llave no se recuperan códigos cifrados. La copia de base por sí sola no alcanza.
- Verificar retención y acceso a Time Travel de D1 en el entorno concreto. No se da por contratado un plazo por la documentación pública.
- Probar una restauración en una base separada, con sus claves, y registrar fecha/resultado antes del 11/11. Nunca restaurar directamente sobre la base activa durante una prueba.
- Invalidar sesiones después de un incidente o recuperación; reconciliar tareas externas antes de reanudarlas.
- El olvido de contraseña todavía requiere un procedimiento de recuperación verificado; debe quedar implementado y probado antes del cierre del MVP. Los códigos de recuperación actuales sustituyen el segundo factor, no la contraseña.
- Definir retención de auditoría y limpieza de límites temporales. Rotar llaves con migración versionada; no reemplazar una llave activa sin un plan de recifrado.
- Revisión independiente de seguridad antes de exponer más usuarios, claves de compañía, documentos reales o decisiones automatizadas.

## Fuentes técnicas

- OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP Cryptographic Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html
- Cloudflare Workers crypto: https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/
- D1: https://developers.cloudflare.com/d1/worker-api/d1-database/
- D1 Time Travel: https://developers.cloudflare.com/d1/reference/time-travel/
