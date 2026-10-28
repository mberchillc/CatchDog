# Pruebas del MVP con un PAS regular

## Preparar la cuenta

1. Entrar como Super Admin y abrir **Productores**.
2. Elegir **Crear PAS de prueba**.
3. Escribir nombre visible, usuario y contraseña propios; repetir la contraseña.
4. Guardar el código personal que se muestra una sola vez.
5. Elegir **Entrar como PAS**. Si se desea mantener las dos vistas abiertas, conservar Super Admin y entrar al PAS desde una ventana de incógnito.

El PAS creado tiene los permisos normales de un productor. No recibe permisos administrativos por ser una cuenta de prueba. La creación no depende de invitaciones ni de volver a desplegar el sitio.

## Cliente y documentos

1. Verificar que el perfil diga **Productor asesor** y que no aparezca Productores en el menú.
2. Ir a **Clientes → Nuevo cliente** y registrar `PRUEBA - Cliente nuevo` con datos ficticios.
3. Verificar que el cliente aparezca en la lista; actualizar y volver a abrirlo.
4. Elegir **Documentos** en la fila del cliente y **Subir PDF o fotos**.
5. Seleccionar el PDF ficticio, confirmar el cliente y guardar.
6. Descargarlo y comprobar su contenido. Reiniciar la instancia independiente y repetir la descarga para verificar persistencia.
7. Entrar con otro PAS y comprobar que ese cliente y archivo no aparecen. Super Admin puede supervisarlos desde la cartera correspondiente.

## Otras funciones

- Registrar una póliza para ese cliente y comprobar fechas, importes y compañía.
- Abrir un siniestro de esa póliza con un próximo paso.
- Crear una tarea, editarla y marcarla resuelta.
- Abrir una solicitud, cargar una propuesta con fuente y vigencia y aprobar su revisión como PAS titular. Ese registro no emite una póliza.
- Subir una foto y consultar su vista previa; mover un archivo a papelera y restaurarlo.

Registrar cada hallazgo con función, cuenta/rol, pasos, resultado esperado y resultado observado. La prueba de permisos debe hacerse desde una cuenta PAS real del MVP; las pantallas de la demo pública no validan el backend.
