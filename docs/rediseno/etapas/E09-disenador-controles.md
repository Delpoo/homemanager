# E09 · Diseñador de controles

**Objetivo:** diseñar cualquier control combinando piezas. **Lo que se ve al abrir un control es exactamente lo que se diseñó.**
**Depende de:** E06 y E08.
**Comentarios:** [Controles remotos](../decisiones-propietario.md#controles-remotos). El propietario rechazó las dos opciones de forma fija.

## Problema hoy

- Hay **dos editores** con dos vocabularios: `src/editor/controls-editor.ts` (`button`, `cycle`, `updown`, `select`, `slider`) y el diseñador RF de `src/rf/` (`button`, `toggle`, `updown`, `steps`, `modes`), en una grilla de 4 columnas.
- La ventana del dispositivo muestra el control mezclado con otros bloques.

## Alcance

**Un solo diseñador,** para RF y para dispositivos de Home Assistant:
- **Piezas sueltas:** botón, botón cíclico, deslizador, `+` y `−`, selector de modos, interruptor, **indicador de valor** y separador o título. Investigar qué más sirve en un control digital y proponerlo.
- **Combinaciones libres:** por ejemplo, `−`, indicador de velocidad y `+`.
- **Cada pieza:** nombre, icono (E08), tamaño, qué ejecuta y qué muestra.
- **Lienzo:** arrastrar, cambiar tamaño, alinear, deshacer, vista previa real. Bueno también en el teléfono, o decir qué parte no.

**Ventana al abrir un control:**
- Primero, el control diseñado, tal cual.
- Lo demás (lecturas, controles de Home Assistant, corregir estado) queda **plegado**, nunca eliminado.

**Estado:** un indicador en un control RF no conoce el valor real. Se muestra como **estimado** y nunca como confirmado (D14, D18).

## Antes de construir

Las piezas nuevas pasan por `rf_model.py`, que valida cada diseño guardado. Un diseño actual debe verse igual después de esta etapa.

Hay pantallas sin maqueta: dibujar diseñador y ventana con los componentes de [vision-mockup §6](../../vision-mockup.html#s6), y validarlas antes de programar.

## Fuera de alcance

Aprendizaje (E10) y crear scripts o automatizaciones.

## No se puede perder

Diseño automático, roles (ventilador, luz), botones aprendidos, probar un botón, widgets actuales, correcciones de estado, envíos por la lista de servicios permitidos, controles con pasos de `bindings.controls`, y los 3 atajos junto al símbolo.

## Dónde mirar

- `src/rf/layout.ts`, `src/rf/remote-view.ts`, `src/rf/manager.ts`, `src/rf/catalog.ts`.
- `src/editor/controls-editor.ts`, `src/card/device-controls.ts`, `src/model/control-capabilities.ts`.
- `src/panels/native-panel.ts`, `src/panels/controls.ts`.
- `custom_components/homemanager/rf_model.py`, `docs/rf-manager.md`.

## Pasos

1. Reclamar la etapa.
2. **Parada de validación 1:** dibujos de diseñador y ventana, lista de piezas y cómo se migran los dos vocabularios.
3. Modelo único con migración de lectura, y pruebas.
4. **Parada de validación 2:** diseñador funcionando con los dos vocabularios antiguos, antes de sumar piezas nuevas.
5. Piezas nuevas y ventana.
6. Pruebas, capturas y reporte.

## Aceptación

- [ ] Un control diseñado se ve igual en el diseñador y al abrirlo.
- [ ] Se puede armar `−`, indicador y `+` sin código.
- [ ] Todos los controles guardados se ven y funcionan igual.
- [ ] Ningún icono queda limitado a una lista corta.
- [ ] Un indicador RF dice que es estimado.
- [ ] Nada que antes estaba disponible en la ventana se perdió.
- [ ] Un comando no permitido sigue siendo rechazado.

## Registro
