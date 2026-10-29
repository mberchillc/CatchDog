# Revisión funcional — Turi dev — 29/10/2026

Criterio: «verificado» exige una acción y su resultado persistido o descargado. «Pendiente» no puede presentarse como una función operativa. Esta revisión técnica no reemplaza la aceptación de usabilidad con Dani.

| Función | Evidencia local actual | Alcance / pendiente |
|---|---|---|
| Acceso PAS y Super Admin | Seguridad, sesiones y roles probados | Probar también en Chrome de Dani |
| Crear PAS de prueba | Alta y acceso probados con backend y UI | Las cuentas de prueba no son el Super Admin |
| Recuperación por correo | OTP incorrecto, vencido, usado, límites y cambio de contraseña probados | Entrega real confirmada previamente; no se envió otro correo en esta revisión |
| Clientes | Alta, edición, búsqueda, persistencia y aislamiento probados | Carga manual; sin importador de cartera |
| Pólizas existentes | Registro, relaciones, importes y fechas probados | No emite ni trae automáticamente pólizas de compañías |
| Siniestros | Registro, vínculos y próximos pasos probados | No denuncia automáticamente a la aseguradora |
| Agenda y Mi día | Tareas, vencimientos y marcado como resuelto probados | Sin recordatorios operativos por email/WhatsApp |
| Documentos | Carga múltiple, tipos, cuotas, reintento, originales, miniaturas, descarga y papelera probados | JPG/PNG/WebP con vista previa; HEIC/HEIF como original descargable; sin lectura por IA |
| Cotizador orientativo | Número por vehículo/cobertura, campos incompletos, persistencia, fuentes, versión y recuperación probados | Referencias públicas, sin búsqueda en vivo; año/zona/adicionales sin tarifa personalizada |
| PDF Turi | Dos páginas generadas, renderizadas, logo, monto y descarga probados | Orientativo, sujeto a aprobación final; no es póliza ni oferta firme |
| Expediente y propuestas recibidas | Registro manual, comparación, fuente, vigencia y revisión PAS probados | No captura ofertas automáticamente |
| Compañías | Código PAS cifrado y relevamiento técnico probados | No conecta sólo por guardar un código |
| Actividad | Eventos atribuidos sin datos del riesgo probados | No reemplaza backups |
| Aislamiento | Otro PAS/otra organización, sesiones y CSRF probados | Mantener prueba de aislamiento en cada cambio sensible |
| APIs Mercantil Andina / Federación Patronal | Bloqueo explícito cuando no hay acceso | Pendiente de credenciales QA/sandbox y prueba integral |
| Agente IA y búsqueda en vivo | No activados | La lectura actual usa reglas; la biblioteca es revisada |
| Importación, formulario público, respaldo restaurado, emisión y comisiones | No validados como operativos | Fuera de las funciones verificadas de esta versión |

Próximo control de aceptación con Dani: cliente ficticio → archivos múltiples → estimación → retomar → PDF, desde PAS regular y otra computadora. Registrar esperado, resultado, evidencia e incidencia. No anunciar una función terminada sólo porque existe su pantalla.
