# E13 · Vista por espacio en PC y modo pared

**Objetivo:** que la vista por espacio tenga sentido en la PC y que el modo pared quede como se aprobó.
**Depende de:** E11.
**Maqueta:** [vision-mockup §4 y §13](../../vision-mockup.html#s13).

## Lo que dijo el propietario

- **Vista por espacio:** «Sí, pero el nombre no debe ser persistente, me imagino que es solo para enseñar la primera vez». En el teléfono está bastante bien. **En la PC falla o no tiene sentido.** La imagen se ve más profesional.
- **Modo pared:** Sí.
- No recuerda qué veía exactamente, así que **hay que averiguarlo**.

## Alcance

**Primero, diagnosticar**
1. Abrir la vista en una PC, con varios tamaños de ventana.
2. Comparar con la maqueta y listar qué falla: encuadre, flechas, cómo se viaja con mouse, tamaño del plano, etiquetas, panel derecho.
3. **Parada de validación:** enviar al propietario lo encontrado, con capturas y una propuesta. Preguntar qué nombre le molesta, mostrándolo.

**Después, corregir**
- Nombre del espacio: no queda fijo a la vista. Sólo al mantener una flecha o la primera vez, según confirme el propietario.
- Navegación con mouse y teclado que tenga sentido en PC.
- **Modo pared:** pantalla completa y oscura, plano oscuro de E11, volver a la casa entera.

## Fuera de alcance

Cambiar lo que ya funciona bien en el teléfono.

## No se puede perder

Flechas, tirar, deslizar, los dos interruptores, editor de espacios, encuadre, teclado y lector de pantalla, movimiento reducido, y lo que funciona en el teléfono.

## Dónde mirar

`src/card/room-view.ts`, `src/model/room-nav.ts`, `src/card/plan-view.ts`, `src/card/gestures.ts`.

## Aceptación

- [ ] El diagnóstico lo aprobó el propietario antes de corregir.
- [ ] En 1440×900 y 1920×1080, se puede ir de un espacio a otro con el mouse y el teclado.
- [ ] Ningún nombre queda fijo tapando el plano.
- [ ] El teléfono sigue funcionando igual.
- [ ] Modo pared comprobado a pantalla completa. Decir si fue en una tablet real.

## Registro
