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

- [x] En 1440×900 y en 1278×900 (barra lateral de Home Assistant abierta), la ficha no tapa el plano y la página no se desplaza.
- [x] En 390×844, el símbolo elegido queda visible sobre la hoja.
- [x] El símbolo elegido llega al centro de lo visible, con transición, y sin transición con movimiento reducido.
- [x] Cada cambio se ve en el plano antes de guardar.
- [x] Salir sin guardar no conserva cambios.
- [x] Todas las funciones de la ficha siguen disponibles (lista en el reporte).
- [x] Teclado: el foco entra a la ficha, se recorre en orden y `Esc` la cierra.
- [x] Sin cambios en el contrato.

## Registro

### 2026-10-31 — ChatGPT — terminada
- **Hecho:** ficha derecha de 380 px, hoja inferior 55% ampliable con tirador/botón, cámara centrada, vista previa validada sin persistir, agrupación de campos y deshacer sólo el dispositivo/fuente. Se mantienen categorías, avisos, controles y opciones avanzadas. 25 funciones cotejadas con método en el reporte.
- **Falta:** auditoría y validación del propietario; suite completa del navegador (timeout antes de los casos), teléfono/teclado/lector reales y E2E en HA desechable. No se marcan esos recorridos como aprobados.
- **Dónde quedó:** rama chatgpt/rediseno-e01-ficha-lateral, PR #51; implementación d5e585da6b6037bf5f44707f6b7c6dcb8dd8bd85, árbol 23e194b84cfa2beff73bae589bea41228ea428a0. Reporte en ../entregas/E01-2026-10-31.md.
- **Para quien siga:** npm run check pasa (250), formato pasa; npm run test:editor-dock ejecuta la app ficticia en Chrome sin socket del servidor: 11 pasan y 1 móvil de pantalla completa se omite. Aceptación de campos conservados cotejada también por código/modelo, no implica recorrido en app de las 25 funciones; ver tabla. Movimiento/260 ms y movimiento reducido mantienen la cámara existente; centrado y reduced motion ejecutados. Datos/copias previas sin migración. Restablecer sugerencias está en Más opciones y sigue siendo distinto del deshacer local. E02 va en otra rama y se detiene antes de convertir pantallas.
