# E01 · Ficha lateral

**Objetivo:** al editar, la ficha se acopla a la derecha y el plano sigue visible. **Mismas funciones, nuevo lugar.**
**Depende de:** E00.
**Maqueta:** [módulos, dibujos 1 y 4](../maqueta-modulos.html). Referencia: [vision.md §7](../../vision.md#7-editar-es-ver).

## Alcance

- **Escritorio:** ficha acoplada a la derecha, de 360 a 400 px. El plano se achica sin saltos y la cámara lleva el símbolo elegido al centro de lo visible.
- **Teléfono:** hoja que sube desde abajo, con lo básico a la vista, que se puede agrandar. La cámara lleva el símbolo a la parte visible de arriba.
- **Vista previa en vivo:** cada cambio se ve en el plano en el momento, sin guardar.
- **Orden de la ficha:** encabezado con el símbolo, base agrupada (nombre, icono, espacio, tamaño) y el resto en bloques que se pliegan. Pie con quitar, mover, deshacer y listo.
- **Categorías:** siguen presentes y funcionando hasta E05. Mostrarlas compactas o plegadas, sin quitarlas.

## Fuera de alcance

El modelo de módulos, el botón **+ Agregar** (E05), los gestos nuevos (E06), Reglas (E07), el color del símbolo y el selector nuevo de iconos (E08). Los avisos actuales se quedan en la ficha hasta E07.

## No se puede perder

Todas las funciones de `deviceForm` y de su pie, según [inventario.md](../inventario.md): en particular **Más opciones** (movilidad, posición X e Y, panel nativo, ID, corregir ubicación fija), control RF del panel, lecturas, avisos, resaltar, deshacer de la ficha y borrador sin guardar.

## Dónde mirar

- `src/editor/index.ts`: `deviceForm` y la regla `:host([embedded])`.
- `src/card/editing.ts`, `src/card/home-manager-card.ts` y `src/card/styles.ts`: dónde se monta la ficha y el diseño de la cuadrícula.
- `src/card/plan-view.ts`: `fit`, `refit`, cámara. Ya existe una lógica que conserva la cámara cuando sólo cambia la altura.
- `src/ui/device-components.ts`: lo que se posiciona sobre el plano en edición.
- `tests/card/shell.browser.spec.mjs`: pruebas de alturas, ventana y cámara.

## Pasos

1. Reclamar la etapa.
2. Confirmar la lista de funciones con el inventario.
3. Acoplar en escritorio, sin cambiar los campos. Mover la cámara.
4. Hacer la hoja del teléfono. Si el teclado la tapa o el gesto de arrastre choca con el plano, reportarlo.
5. Reordenar los bloques según la maqueta.
6. Probar: abrir, cambiar de símbolo con la ficha abierta, cambiar el tamaño de la ventana, barra lateral de Home Assistant abierta, pantalla completa, salir sin guardar.
7. Capturas y reporte.

## Aceptación

- [ ] En 1440×900 y en 1278×900 (barra lateral de Home Assistant abierta), la ficha no tapa el plano y la página no se desplaza.
- [ ] En 390×844, el símbolo elegido queda visible sobre la hoja.
- [ ] El símbolo elegido llega al centro de lo visible, con transición, y sin transición con movimiento reducido.
- [ ] Cada cambio se ve en el plano antes de guardar.
- [ ] Salir sin guardar no conserva cambios.
- [ ] Todas las funciones de la ficha siguen disponibles (lista en el reporte).
- [ ] Teclado: el foco entra a la ficha, se recorre en orden y `Esc` la cierra.
- [ ] Sin cambios en el contrato.

## Registro
