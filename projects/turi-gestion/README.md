# TURI Gestión

Demo navegable centrada en la operación cotidiana del productor asesor de seguros. El punto de partida es el perfil de Daniel Stern, organización Turi, con 230 pólizas ficticias. Prioriza alertas, cartera, siniestros, administración y oportunidades comerciales.

Demo con acceso por enlace: https://turi-gestion-demo.mb1312.chatgpt.site

Acceso de muestra: **Dani / 1234**. Es una selección de recorrido en el navegador, no autenticación segura. No ingresar datos reales.

## Recorrido de revisión

1. Elegir **Soy productor** e ingresar con Dani / 1234.
2. En **Mi día**, abrir una alerta, ver su fuente, preparar un mensaje, posponerla o marcarla resuelta.
3. En **Mis pólizas**, buscar por nombre, identificador o patente y filtrar por compañía y ramo. Abrir una ficha o exportar CSV.
4. En **Siniestros**, abrir SIN-2401 y registrar un avance. El contador de días se actualiza y la alerta asociada se cierra.
5. Abrir **Mi link de cotización** y probar el recorrido del cliente. Se puede comenzar sin nombre ni edad. Un caso especial pasa a evaluación experta; no se inventa una tarifa.
6. Completar contacto e intención con datos ficticios. Descargar el PDF ilustrativo y volver a **Cotizaciones** para revisar el borrador como PAS.
7. Completar los controles y aprobar la simulación. No se solicita una aprobación adicional de Admin Turi y no se emite cobertura.
8. Explorar **Administración**, **Marketing y ventas**, **Agente Turi** y las guías de **Capacitación**.
9. En el agente, consultar siniestros sin novedades o adjuntar un .txt ficticio y preguntar por su contenido.
10. En **Mi perfil y respaldo**, exportar los datos de muestra, restaurarlos o reiniciar la demo.

**Soy cliente** abre una vista breve de seguros de muestra y contacto con su productor. Los formularios y las guías por ramo son herramientas del productor, sin desarrollar un negocio B2C independiente.

## Qué funciona y qué está simulado

| Función | Alcance de esta versión |
| --- | --- |
| Cartera | 230 pólizas, 230 clientes ficticios, búsqueda, filtros, fichas y exportación. |
| Alertas | Siete avisos iniciales de muestra, fechas, prioridad, resolución, posposición e historial local. |
| Siniestros | Cinco casos; contador desde el último avance, actualización de estado, notas y próximo paso. |
| Cotización | URL propia, datos mínimos y ejemplos ficticios. Años de auto de 2026 a 2000; “Modelo anterior” deriva a evaluación especial sin tarifa automática. |
| Atención humana | Todos los botones de ayuda abren WhatsApp web o app en +54 9 11 3021-6824. El usuario envía su mensaje desde WhatsApp. |
| Solicitud | Crea oportunidad, borrador y alerta del PAS en el mismo navegador. No notifica por correo. |
| PDF | Documento ilustrativo con marca de agua y aviso de cobertura no emitida. No es una póliza. |
| Revisión | Checklist e intención de la solicitud; aprobación simulada del propio PAS, sin emisión. |
| Administración | Comisiones, retenciones, comprobantes y agenda ficticios. No calcula ni presenta impuestos reales. |
| Marketing | Oportunidades, seguimiento y borradores de comunicación. No envía ni publica contenido. |
| Agente | Respuestas por reglas que consultan registros y textos .txt del perfil. No hay LLM ni herramientas externas conectadas. |
| Proveedores IA | Cuatro alternativas, documentación y preferencia de muestra. No conexión real ni captura de claves. |
| Compañías | Quince logos y enlaces oficiales externos. Algunos enlaces llevan a la página oficial de productores cuando no se fijó un login estable. No SSO. |
| Persistencia | Cambios guardados en localStorage del navegador; exportación/restauración de demo. No sincroniza usuarios, dispositivos ni solicitudes de clientes externos. |

La marca y la tipografía se basan en el sitio de Turi. El retrato fue suministrado por Mauro. El personaje ilustrado del agente es una propuesta inicial generada para esta demo.

## Estructura

- `dist/`: sitio estático, sin dependencia de ejecución de terceros.
- `docs/schema.sql`: modelo relacional inicial para productores, compañías, códigos propios, clientes, pólizas, alertas, siniestros y borradores.
- `docs/seed.sql`: fixture SQLite completa con datos ficticios. Incluye el esquema; no ejecutar después de `schema.sql` en la misma base sin limpiar.
- `scripts-data.py`: genera la fixture y el dataset del frontend.
- `docs/company-sources.json`: fuentes de accesos y recursos de marca.
- `docs/ROADMAP.md`: etapas y criterios para pasar del prototipo al piloto.
- `tests/demo.test.cjs`: pruebas de DOM y recorridos con JSDOM.

La base relacional es una fixture validada. El sitio de esta versión usa datos en el navegador; no se desplegó una base D1 remota.

## Desarrollo y validación

Para pruebas: instalar dependencias de desarrollo con `pnpm install`, luego `pnpm test` y `pnpm check`. Para servir el sitio en un entorno local, usar `dist` como raíz estática. No se requiere build del frontend.

Se verificaron los recorridos en JSDOM, la integridad de la fixture SQLite, los recursos locales y la generación del PDF. El PDF se abrió y renderizó para comprobar su marca de agua. La revisión visual completa está pendiente. Para estos ajustes se aprobaron 70 verificaciones de DOM y comportamiento; la vista previa no pudo iniciarse por una restricción del contenedor.

La publicación se gestiona con Sites sobre Cloudflare. El enlace abre sin cuenta de ChatGPT. El usuario Dani y la clave 1234 son parte del recorrido de muestra; no constituyen autenticación segura. El código para revisión se guarda en la rama `demo/turi-gestion` de `mberchillc/CatchDog`, bajo `projects/turi-gestion`. El `main` de CatchDog no se modifica.

## Fuentes de producto y diseño

Las notas de la reunión del 19 de octubre de 2026 y el pedido posterior de Mauro gobiernan el alcance: herramienta para el productor, administración primero, pilotos incrementales y estética actual de Turi. No se trasladan como requisitos los pasajes de la transcripción que confunden el proyecto con una plataforma de entrenamiento.

Las páginas comerciales se toman como referencia declarada, sin verificar resultados ni acceso a sus integraciones:

- [Turi](https://www.turi.com.ar/): identidad, tono y atención experta.
- [VISION PAS](https://visionpas.com/): cartera, oportunidades, renovaciones y contexto compartido.
- [Apizeal](https://apizeal.com/): pólizas, comisiones, comunicaciones y capacitación; su oferta corresponde a otros mercados y ramos.
- [Cooper](https://www.askcooper.ai/): propuesta de asistencia a lo largo del flujo asegurador. Sus cifras y afirmaciones de automatización no se adoptan como hechos comprobados.
- [San Cristóbal](https://www.sancristobal.com.ar/cotizar-auto/): referencia de recorrido de cotización. Su formulario dinámico no pudo inspeccionarse íntegramente; esta demo no copia sus campos ni su tarificación.
- [OpenAI](https://help.openai.com/en/articles/8156019), [Claude](https://platform.claude.com/docs/en/home), [Gemini](https://ai.google.dev/gemini-api/docs), [Copilot Studio](https://learn.microsoft.com/es-es/microsoft-copilot-studio/): documentación para evaluar conexiones, permisos y consumo. No se promete reutilizar una suscripción de chat como acceso automático a la API.
