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
