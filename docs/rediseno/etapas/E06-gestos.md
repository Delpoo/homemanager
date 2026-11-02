# E06 · Gestos configurables

**Objetivo:** elegir qué hace cada gesto sobre un símbolo.
**Depende de:** E05.
**Maqueta:** [módulos, dibujo 1, bloque Gestos](../maqueta-modulos.html). Decisión: [D25](../../decisions.md).

## Alcance

- **Gestos:** tocar y mantener.
- **Acciones posibles:** abrir su pantalla, abrir el control completo, ejecutar un botón o control, abrir un panel nativo, nada.
- **Doble toque:** no incluirlo ahora. Obliga a esperar después de cada toque y todos se sentirían más lentos. El modelo debe poder sumar otro gesto más adelante sin cambiar el formato.
- **Salida fija:** aunque mantener no abra el control, debe haber otra forma de llegar: por ejemplo, desde su pantalla o desde *Ahora*. Nadie puede quedar sin acceso a un control.
- **Si la acción elegida ya no existe,** el símbolo avisa y abre su pantalla.

## Fuera de alcance

Acciones automáticas (E07 sólo avisa) y gestos nuevos.

## Datos

- `bindings.tap` ya existe y se mantiene compatible, incluido `null`, que abre el panel.
- Agregar `bindings.hold`, opcional. Si falta, se comporta como hoy (abre el panel).
- Revisar D18: esta etapa reemplaza «mantener pulsado abre siempre el panel».

## No se puede perder

Atajos junto al símbolo y sus gestos propios (un deslizador arrastra, no mueve el plano), toque con controles `button` y `cycle`, `primaryAction` de planos viejos, `LONG_PRESS_MS` y el clic que no debe dispararse después de mantener.

## Dónde mirar

- `src/card/gestures.ts`, `src/card/card-helpers.ts`, `src/card/commands.ts`, `src/card/device-controls.ts`.
- `src/panels/native-panel.ts`, `src/panels/device-screen.ts`.
- `src/editor/controls-editor.ts`, `src/editor/index.ts`.
- Validación en los tres lugares.

## Pasos

1. Reclamar la etapa.
2. Función pura que resuelve «gesto + símbolo → acción», con pruebas.
3. Conectar gestos, bloque de la ficha y validación.
4. Probar con mouse, teclado, táctil y lector de pantalla.
5. Pruebas, capturas y reporte.

## Aceptación

- [ ] Se puede configurar por separado tocar y mantener.
- [ ] Sin configurar, todo funciona como antes.
- [ ] Un plano 0.6 con `primaryAction` sigue funcionando.
- [ ] El teclado tiene una forma de ejecutar ambas acciones.
- [ ] Si mantener no abre el control, el control sigue accesible.
- [ ] Un botón borrado no rompe el símbolo.
- [ ] Toda acción muestra respuesta en la barra de actividad.

## Registro
