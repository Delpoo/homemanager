# E02 · Pantallas en lugar de ventanas

**Objetivo:** trabajar cómodo en pantallas ordenadas. Nunca una ventana sobre otra.
**Depende de:** E00. Si E01 no está fusionada, coordinar: tocan archivos cercanos.
**Maqueta:** [vision-mockup §9, §11 y §14](../../vision-mockup.html#s9).

## Regla

| Tipo de tarea | Cómo se muestra |
|---|---|
| Trabajo: varios campos, listas, pasos o revisión | Pantalla completa dentro del panel, o dentro de la ficha lateral |
| Pregunta de sí o no | Ventana chica de confirmación, encima de lo que estés haciendo |

Nunca más de una ventana a la vez. Toda pantalla tiene una forma clara de volver, y volver no pierde lo escrito.

## Alcance

Según [inventario.md](../inventario.md), como mínimo:

- **Ajustes del plano:** hoy es un `<dialog class="settings-dialog">`. Pasa a ser una página real, con barra superior y **Guardar**.
- **Vincular un dispositivo:** se abre dentro de la ficha lateral, en sus dos pasos. Recomendación por validar: en escritorio cabe bien. Si queda apretado, usar una pantalla y explicarlo.
- **Agregar dispositivo:** deja de flotar en una esquina y de quedar visible detrás de otra ventana.
- **Revisar cambios del plano, editar un espacio, editor de zonas:** pantallas.
- **Controles RF:** sus editores dejan de abrirse como ventana sobre ventana, salvo las confirmaciones.

Quitar «Versiones guardadas» de lo que se tome como objetivo: la maqueta la muestra, pero el propietario la descartó. **No tocar el historial** de `custom_components/homemanager/store.py`.

## Fuera de alcance

El contenido de cada pantalla (el propietario quiere cambiarlo más adelante, y lo dirá) y el modelo de módulos.

## No se puede perder

Borrador sin guardar, deshacer de un paso al importar, foco y lector de pantalla, volver sin perder datos, y cada acción de Ajustes y RF del inventario.

## Dónde mirar

- `src/editor/index.ts`, `src/editor/settings-page.ts`, `src/editor/device-picker.ts`, `src/editor/room-actions.ts`, `src/editor/plan-review.ts`.
- `src/card/zone-editor.ts`, `src/rf/manager.ts`, `src/rf/learn.ts`, `src/ui/confirm-dialog.ts`, `src/ui/panel-components.ts`.
- Para ubicar todos los casos: buscar `showModal` en `src/`.

## Pasos

1. Reclamar la etapa. Listar cada `showModal` con su clasificación según la regla.
2. **Parada de validación:** enviar al propietario la lista, con la propuesta para Vincular. Si una pantalla no tiene maqueta, armarla con los componentes de la sección 6 y mostrarla.
3. Crear una forma común de pantalla con barra superior y volver, y usarla en todas.
4. Convertir de una a la vez, con commits separados.
5. Pruebas, capturas y reporte.

## Aceptación

- [ ] Un recorrido por todos los flujos del inventario nunca muestra dos ventanas a la vez.
- [ ] Sólo las preguntas de sí o no usan ventana.
- [ ] Ajustes es una página, con el historial del navegador o un botón para volver.
- [ ] En 390×844 todo se puede usar sin desplazamiento horizontal.
- [ ] Salir con cambios sin guardar pregunta primero.
- [ ] Todas las funciones siguen disponibles.

## Registro
