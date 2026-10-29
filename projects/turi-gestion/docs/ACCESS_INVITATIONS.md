# Acceso PAS por invitación — 29/10/2026

La demo de acceso predefinido Dani/1234 fue retirada de Turi dev. La raíz muestra únicamente la entrada al espacio privado. app.js, data.js y assets/embedded.js antiguos responden 410 y no se empaquetan; el catálogo de compañías se conserva sin datos de personas en worker/company-catalog.json. No se importa localStorage de la demo.

El Super Admin puede elegir «Invitar PAS» en Productores, indicar el nombre y copiar un enlace personal. El invitado elige usuario y contraseña (14–128 caracteres), repite la contraseña y puede indicar un correo. Luego confirma su código personal mediante el flujo existente y entra a una cartera vacía. No se crean clientes, pólizas ni documentos de ejemplo.

Invitaciones de siete días, de uso único, con token aleatorio de 256 bits y sólo su hash en D1. El enlace viaja en el fragmento y se retira de la dirección visible al abrir. Origen, límites, rol del emisor, revocación, vencimiento y consumo atómico se verifican en el servidor. Usuario duplicado o datos inválidos no consumen el enlace. Tenant y rol productor se asignan desde la invitación. La suspensión del emisor invalida sus invitaciones pendientes. No se envía correo automático con el enlace ni se conocen las contraseñas elegidas.

El enlace completo sólo aparece al crearlo. Productores lista el estado y permite revocar pendientes. El endpoint de listado y la auditoría excluyen el token. Los secretos nunca van al repositorio.

Migración aditiva: drizzle/0006_pas_self_signup.sql y snapshot correspondiente. No altera usuarios o registros existentes. Las cuentas de prueba de Mauro permanecen separadas.

Validación local: 65 pruebas de invitación, alta de PAS, seguridad, operación, recuperación y cotización aprobadas. Además, tests/demo.test.cjs comprueba la entrada privada y el retiro de los recursos antiguos. Incluye elección de usuario, doble contraseña, rechazo de Dani/1234, permisos, cartera vacía, aislamiento, reuso, vencimiento, revocación, carrera concurrente y pantallas reales con backend. Antes de activar a Daniel se prepara una invitación pendiente y se verifica su formulario sin consumirla. La contraseña y la confirmación finales las ingresa él.
