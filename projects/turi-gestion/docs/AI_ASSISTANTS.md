# Conexiones personales de IA

Cada PAS dispone de «Conectá tu asistente de IA» en el menú de su espacio. Las cinco fichas son ChatGPT/OpenAI, Gemini, Claude, Copilot Studio y Muse/Spark de Meta. Al seleccionar una ficha se despliegan los campos de conexión.

La configuración utiliza credenciales de API. No importa conversaciones, memorias ni asistentes de las aplicaciones personales. Copilot requiere un agente publicado en Copilot Studio con Direct Line habilitado; la suscripción personal de Copilot no sustituye ese acceso.

Guardar y probar son acciones distintas. Guardar conserva la configuración cifrada. Probar comprueba el acceso al catálogo del proveedor o la generación de un token de Direct Line, sin enviar mensajes, clientes, pólizas, documentos ni códigos PAS. «Acceso validado» no certifica saldo, permisos de generación ni disponibilidad futura. Esta etapa no incorpora un chat ni envíos automáticos de datos.

Las claves nunca se devuelven al navegador ni se guardan en su almacenamiento local. Un campo vacío conserva la clave existente. Las pruebas usan destinos fijos en servidor, límites de tiempo, respuestas acotadas y mensajes de error sin contenidos del proveedor. Un cambio de credencial o configuración invalida la validación anterior.

El Superadmin debe seleccionar al PAS en la selectora existente. La misma interfaz opera sobre el titular seleccionado y registra al Superadmin como actor real. No se modifica la sesión personal del productor.

## Almacenamiento y publicación

La migración aditiva `0010_ai_assistants.sql` crea una tabla independiente para las conexiones de IA. No cambia clientes, documentos, compañías ni expedientes existentes. Aplicarla a `turi-gestion-dev-db` antes de publicar el Worker. Conservar la audiencia y los bindings existentes.

En dev se aplicó únicamente el archivo 0010 y se registró su nombre en `d1_migrations`. No se ejecutaron las migraciones históricas 0005/0006 que el registro remoto sigue mostrando como pendientes. Las 25 cuentas y nueve conexiones de compañías se conservaron; la tabla nueva quedó vacía y la comprobación de claves foráneas no informó incidencias.

## Validación

La regresión completa pasó con datos ficticios aislados. Las 24 pruebas específicas finales cubren formularios, guardado real mediante la vista delegada del PAS, cifrado, versiones, aislamiento, autorización, revocación de sesiones y respuestas del proveedor simuladas. No se usaron claves reales ni se enviaron consultas de generación. El navegador de revisión no alcanzó el servidor de vista previa local; queda pendiente la revisión visual autenticada y la prueba con las claves propias del PAS.

## Documentación oficial consultada el 05/11/2026

- [OpenAI: listar modelos](https://developers.openai.com/api/reference/resources/models/methods/list), [autenticación y protección de claves](https://developers.openai.com/api/reference/overview).
- [Google: modelos](https://ai.google.dev/api/models), [claves](https://ai.google.dev/gemini-api/docs/api-key), [integraciones de plataforma](https://ai.google.dev/gemini-api/docs/partner-integration).
- [Claude: modelos](https://platform.claude.com/docs/en/api/models/list), [autenticación](https://platform.claude.com/docs/en/api/overview).
- [Copilot Studio: seguridad del canal](https://learn.microsoft.com/en-us/microsoft-copilot-studio/configure-web-security), [generar un token sin iniciar conversación](https://learn.microsoft.com/en-us/azure/bot-service/rest-api/bot-framework-rest-direct-line-3-0-authentication?view=azure-bot-service-4.0).
- [Meta Muse/Spark: guía](https://dev.meta.ai/docs/overview), [listar modelos](https://dev.meta.ai/docs/api-reference/models/list-models).
