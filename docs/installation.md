# Instalación en Home Assistant

Guía para instalar HomeManager 0.3.1 en una instalación real, por ejemplo Home Assistant OS en una Raspberry Pi. Probado en Home Assistant 2026.2.3 y 2026.10.4 (instancias de prueba). **No hay release publicada todavía**: hasta entonces se instala el paquete generado desde `main`.

## Antes de empezar

1. **Copia de seguridad completa** de Home Assistant (Ajustes → Sistema → Copias de seguridad). HomeManager no modifica entidades, scripts, automatizaciones ni dashboards existentes, pero la copia es la forma de volver atrás.
2. Versión de Home Assistant **2026.2 o posterior**.
3. Una cuenta **administradora** para crear y editar el plano. Las demás cuentas requieren acceso de lectura explícito en las opciones de la integración.
4. El plano SVG de la vivienda. Es lo único que se trae de afuera: espacios, dispositivos y vínculos se arman en HomeManager y quedan en Home Assistant.

## Opción A · HACS (cuando exista la release)

1. HACS → menú ⋮ → *Repositorios personalizados* → `https://github.com/Delpoo/homemanager`, categoría **Integración**.
2. Instalar **HomeManager** y reiniciar Home Assistant.
3. Ajustes → Dispositivos y servicios → *Añadir integración* → **HomeManager**.

## Opción B · Paquete manual (antes de la release)

1. Desde un checkout de `main`: `npm ci --ignore-scripts && npm run package`. Genera `.work/release/homemanager.zip`.
2. Copiar el contenido del zip en `/config/custom_components/homemanager/`, por ejemplo con el complemento *File editor* o *Samba share*. Debe quedar `/config/custom_components/homemanager/manifest.json` y `/config/custom_components/homemanager/frontend/homemanager.js`.
3. Reiniciar Home Assistant y añadir la integración como en la opción A.

Por defecto el bundle se carga al abrir el panel HomeManager. Para tarjetas en dashboards, activá **Cargar HomeManager en todas las páginas de HA** en las opciones de la integración, o registrá manualmente `/homemanager_files/homemanager.js?v=0.3.1` como módulo Lovelace. Elegí una sola modalidad. Una pestaña abierta debe recargarse al actualizar o deshabilitar la integración.

## Primer uso

1. Abrir **HomeManager** en la barra lateral, escribir el ID del hogar (por ejemplo `casa`) y pulsar **Crear hogar**.
2. **Editar plano → Importar y exportar** → importar el JSON de la instalación (o un SVG del plano). Revisar el resumen y aplicar al borrador.
3. **Espacios:** comprobar nombres y orden. Si coinciden con los nombres de las **áreas** de Home Assistant, el alta de dispositivos asigna el espacio sola.
4. **Agregar dispositivo desde Home Assistant:** buscar la entidad por nombre o área, elegirla y tocar el plano donde está. HomeManager crea el nombre, el icono y la acción principal. Para los dispositivos ya importados, elegir su *Entidad del dispositivo* en el formulario.
5. **Guardar cambios.** El hogar queda en `/config/.storage/homemanager.homes`, incluido en las copias de seguridad de Home Assistant.
6. Opcional: en cualquier dashboard, añadir la tarjeta **HomeManager** con `home_id: casa`.

## Comprobaciones recomendadas en la vivienda

Probarlas con el usuario presente, porque implican acciones físicas:

- un toque enciende y apaga una luz; el panel (pulsación larga o ⋯) ajusta brillo, velocidad o posición según el equipo;
- un ventilador RF vía script ejecuta sus campos declarados;
- el estado se muestra *enviado* y luego *estimado*; *confirmado* sólo aparece con una fuente medida y verificada;
- una cuenta sin acceso explícito no puede leer el plano; una cuenta lectora seleccionada puede usarlo con los permisos de servicios que HA le conceda, pero no puede guardar;
- el móvil, en vertical y apaisado.

## Volver atrás

Eliminar la integración en *Dispositivos y servicios* y borrar `/config/custom_components/homemanager/`. Los hogares guardados permanecen en `.storage` hasta que se borren `homemanager.homes` y `homemanager.plans.*`; nada más de la instalación cambia. La copia de seguridad restaura el estado anterior completo.

## Privacidad y almacenamiento desde 0.3.1

En **Ajustes → Dispositivos y servicios → HomeManager → Configurar**, elegí las cuentas que podrán leer **todos** los hogares. La lista vacía limita la lectura a administradores, también en instalaciones actualizadas. Esto no cambia los permisos de servicios de Home Assistant. Un dashboard con configuración inline mantiene los permisos de Lovelace; usar la integración evita incluir el plano en ese dashboard.

Límites: 20 hogares activos, 10 planos por historial, 40 historiales en total y 64 MiB para los datos de HomeManager. Eliminar un hogar conserva su historial dentro de esa cuota. Desde el panel, **Almacenamiento → Eliminar historial** permite purgar definitivamente el historial de un hogar eliminado, con confirmación. Las copias de seguridad anteriores pueden seguir conteniendo esos datos.

Los documentos antiguos que no cumplen la nueva validación quedan en cuarentena, fuera de las listas de lectura, sin borrarse al guardar otro hogar. Recuperar desde una copia de seguridad revisada. No escribir ni editar archivos de `.storage` con HA en ejecución.

