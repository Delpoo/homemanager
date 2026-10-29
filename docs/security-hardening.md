# Controles de seguridad de la candidata 0.3.1

Las correcciones se basan en una revisión del código y pruebas sintéticas. No son una certificación de seguridad ni una validación física del equipo. No se instala ni publica una release al aplicar estos commits.

| Frontera | Control |
|---|---|
| Lectura WS | Sólo administradores por defecto; lectores activos seleccionados desde las opciones. Esa selección permite leer todos los hogares, no sólo un dashboard. Escrituras e historial siguen restringidos a administradores. |
| Suscripciones | Hogar existente, límite por conexión/global, limpieza idempotente al cancelar y comprobación de permiso al emitir. |
| Documento | Validación Python del contrato completo, acciones y parámetros permitidos, límites y estado persistente desconocido; no depende de que el cliente haya validado. |
| SVG | Parser XML sin DTD/entidades, lista permitida de namespaces/elementos/atributos, URLs locales y presupuesto de geometría expandida, incluso en grafos acíclicos. El frontend repite su sanitización. |
| Persistencia | Mutaciones serializadas y estado visible posterior al guardado; reversión del historial si falla el documento principal. Documentos inválidos en cuarentena, sin borrado silencioso. |
| Retención | 20 hogares activos, diez planos por historial, 40 historiales y 64 MiB totales. Borrar un hogar conserva su historial; la purga definitiva requiere administrador y confirmación. Backups independientes. |
| Frontend | El panel carga su módulo; la carga mediante `add_extra_js_url` en todas las sesiones es una opción desactivada por defecto, también al actualizar. |
| Distribución | ZIP reproducible y permitido por inventario; inspección del archivo final, checksum, atestación y preparación manual de borrador sólo tras toda la CI. Sin sobrescritura de assets. |

## Actualización desde 0.3.0

Antes de instalar, exportar configuración y crear backup completo. Las cuentas no administradoras perderán acceso hasta que el administrador las seleccione en las opciones. Para tarjetas fuera del panel, activar conscientemente la carga global o registrar el recurso según [instalación](installation.md). Recargar todas las pestañas después de actualizar o deshabilitar.

Un documento antiguo con SVG o campos que no cumplan la validación nueva no se muestra ni se elimina automáticamente; permanece en cuarentena para recuperación desde backup revisado. Una instalación que ya supere la cuota podrá leer y eliminar/purgar, pero no seguir ampliando el almacenamiento. No editar `.storage` mientras HA esté funcionando.

## Límites que permanecen

- El acceso elegido es por integración: todos sus hogares son visibles para los lectores seleccionados. No es una ACL diferente por habitación o entidad.
- Las órdenes usan la sesión y los permisos de servicios HA; la lectura de HomeManager no crea ni revoca esos permisos. Las comprobaciones de scripts validan metadatos/parámetros, no su cuerpo ni una firma criptográfica.
- La persistencia de hogar e historial usa dos archivos; no hay transacción resistente a cortes de energía entre ambos. Conservar backup y ensayar recuperación en HA desechable.
- Los escáneres y la auditoría npm tienen cobertura limitada. Python/HA, el host, HACS y las cuentas mantenedoras siguen siendo fronteras de confianza.
- Información ya publicada puede continuar en Git, clones o caches. Estos cambios no reescriben historia ni eliminan retrospectivamente metadatos públicos. No incluyen datos privados en el código, pruebas, bundle o artefactos nuevos.
- No se alteran fuentes SVG de la instancia privada, bindings reales, scripts RF ni hardware. Un servicio aceptado sigue significando enviado, no confirmación física.
