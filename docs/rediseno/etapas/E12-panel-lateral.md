# E12 · Panel lateral editable

**Objetivo:** elegir qué aparece en *Ahora* y cómo, como un pequeño dashboard.
**Depende de:** E05 y E07.
**Maqueta:** [vision-mockup §1](../../vision-mockup.html#s1). Comentario del propietario: es lo que más importa del panel.

## Alcance

- **Por defecto,** se ve como hoy: alertas, clima, activos y energía. Sin configurar nada, no cambia.
- **Editar:** agregar, quitar y ordenar bloques. Cada bloque elige qué dispositivos o lecturas muestra y cómo.
- **Bloques iniciales:** alertas, una lectura, un grupo de lecturas, activos, energía, un control y un acceso directo. Investigar cuáles sirven más y proponerlos.
- **Alcance de la configuración:** una por casa, y el modo pared puede tener la suya. Lo aceptó el propietario al recibir el plan.
- **Sin nada fijo:** ningún bloque limitado a un tipo de dispositivo si puede funcionar con otro.
- **Teléfono:** la misma configuración, en la hoja de *Ahora*.

## Antes de construir

Pantalla sin maqueta: dibujar el modo edición con los componentes de [vision-mockup §6](../../vision-mockup.html#s6), y validar.

## Fuera de alcance

Cambiar la pantalla del dispositivo (que ocupa ese lugar, E04) y gráficos históricos, salvo que se pidan. Si parecen útiles, proponerlos.

## Datos

Campo opcional en la configuración. Si falta, se usa el comportamiento automático. Validación en los tres lugares.

## No se puede perder

Las secciones de hoy, apagar desde *Activos*, valor estimado, encuadrar desde una alerta, la sección de pantalla del dispositivo, *Ahora* como hoja deslizable.

## Dónde mirar

`src/model/now.ts`, `src/panels/device-screen.ts`, `tests/browser/fixtures/device-screen.html`.

## Pasos

1. Reclamar la etapa.
2. **Parada de validación:** dibujo, lista de bloques y formato.
3. Modelo con pruebas, partiendo de `nowSections`.
4. Modo edición.
5. Pruebas, capturas y reporte.

## Aceptación

- [ ] Sin configurar, *Ahora* se ve como antes.
- [ ] Se pueden agregar, quitar y ordenar bloques.
- [ ] Los cambios se ven en vivo y se pueden descartar.
- [ ] Un dispositivo eliminado no rompe el panel: el bloque lo indica.
- [ ] El modo pared puede tener otra configuración.
- [ ] Se usa bien en 390×844.

## Registro

### 2026-11-03 - Codex - lote 4, E12
- **Propuesta elegida:** siete bloques iniciales: alertas, una lectura, grupo de lecturas, activos, energía, control existente y acceso a dispositivo/espacio. Ajustes del plano > Editar Ahora, con lista, orden, selector de fuentes y vista previa sin envíos. No se agregan gráficos históricos fuera de alcance.
- **Datos:** nowPanels opcional, con home y wall opcionales e independientes; faltar home conserva el panel automático incluso si sólo se personaliza wall. Wall sin lista propia sigue home. Hasta 32 bloques por lista, referencias opcionales y persistentes; quitar una referencia no elimina el dispositivo. Todo cambio queda en el borrador, se ve en la vista previa y se puede descartar con el plano.
- **Aceptación:** 1 cumplida, ruta automática anterior intacta al faltar el campo (prueba de modelo); 2 cumplida, agregar/quitar/ordenar en navegador; 3 cumplida, vista previa y borrador, guardado/recarga real del almacén simulado de Lovelace aprobados; 4 cumplida, referencia ausente explícita, modelo y renderer de control sin referencia; 5 cumplida, lista wall separada sin modificar home, modelo y navegador; 6 recorridos móviles y capturas al cierre del lote. No se atribuye teléfono real.
- **Inventario:** F-038 se conserva como vista automática y hoja móvil, con la misma sección de dispositivo (E04) sin sustituirla. F-039 conserva apagar desde Activos y encuadrar/abrir desde alertas; bloques reutilizan sus filas y comandos. Los controles configurados usan ControlView y el host con la lista de servicios permitidos; lecturas assumed_state siguen marcadas estimadas. Fuentes eliminadas no envían nada y muestran referencia no disponible.
- **Comprobaciones:** check combinado 284 aprobado; prueba focal de escritorio de selección, orden, listas independientes, guardado y recarga aprobada; pruebas de modelo y contrato coordinadas en JS/esquema/Python. Integración Python real en CI del lote, no instalada en el Python local.
- **Falta:** CI completa, capturas, auditor independiente y teléfono/lector físicos. Sin envío a la casa, publicación ni fusión.
