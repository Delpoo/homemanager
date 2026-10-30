# Barra de actividad y alturas del panel · verificación visual

Corrige dos problemas vistos al usar la 0.9.0-beta.5 en una instalación real. Parte de `fa26161` (`main`). No cambia el contrato, la versión ni el CHANGELOG, y no se publica nada.

## Qué cambia

- **Barra de actividad:** las lecturas continuas ya no se registran. Quedan los comandos, las alertas y los cambios discretos, con valores formateados.
- **Altura del panel:** la app ocupa la ventana con la cuadrícula de `.shell`, en lugar de una altura calculada con el ancho de la ventana. La barra de espacios ya no queda fuera de pantalla junto a la barra lateral de HA, y el modo edición ya no desborda la página.
- **Modo edición:** las capas quedan encima del botón +.
- **Cámara:** un cambio sólo de altura conserva la cámara que la persona movió. Una cámara sin tocar se reencuadra.

## Resultados

Verificación del 30/10/2026. El E2E, el panel real y las capturas se hicieron sobre la base `fa26161`, antes de integrar las etapas 1 a 2b de 0.10 desde `main`. Tras integrarlas volvieron a ejecutarse `npm run check`, las pruebas de navegador y la CI.

| Comprobación | Resultado |
| --- | --- |
| `npm run check` y `npm run format:check` | Pasan |
| `npm run test:browser` | Pasa en escritorio y móvil, con las 3 omisiones previstas de gestos táctiles en escritorio |
| CI · `foundation` e `integration` con HA 2026.2.3 y 2026.10.4 | Pasan sobre `8bcb2a0`; ver el PR para el último commit |
| E2E local · HA 2026.2.3 temporal en Windows | 14 comprobaciones pasan; ignora 5 errores de página externos a HomeManager mediante su filtro existente |

`pytest` no se ejecutó en local: lo cubre `integration` en la CI.

Tras integrar `main` con las etapas 1 a 2b de 0.10, se repitieron el E2E (14 comprobaciones pasan, HA 2026.2.3 temporal) y la suite completa de navegador. En ese mismo HA temporal, el editor de zonas dibujó una zona de dos rectángulos, la guardó y la conservó al recargar, sin errores de página. Con el panel a 1440×900, 1278×900 y 390×844, sus herramientas quedan dentro de la ventana y la página no se desplaza; esas medidas se tomaron con el fixture. Las capturas de esta página siguen siendo de antes de integrar y no muestran el editor.

### Panel real en el HA temporal

Medido con el panel real, la barra lateral de HA abierta y un plano de prueba. En todas las filas el documento mide lo mismo que la ventana, así que la página no se desplaza.

| Ventana | Estado | Documento | Barra de espacios (borde inferior) | Área del plano (y) |
| --- | --- | --- | --- | --- |
| 1278×900 | normal | 900 | 899 | 57 a 835 |
| 1278×900 | edición | 900 | 899 | 122 a 835 |
| 1278×900 | pantalla completa | 900 | 899 | 57 a 835 |
| 1440×900 | normal | 900 | 899 (lateral) | 57 a 899 |
| 1440×900 | edición | 900 | 899 (lateral) | 122 a 899 |
| 390×844 | normal | 844 | 843 | 49 a 779 |
| 390×844 | edición | 844 | 843 | 110 a 779 |

## Límites

- No se probó en una instalación real ni en un teléfono real. El móvil es la emulación del navegador.
- La captura `sidebar` usa el fixture con el panel a 1022 px dentro de una ventana de 1278 px: el hueco de la derecha ocupa el lugar de la barra lateral de HA, aunque en HA va a la izquierda.
- La sección *Actividad* de un medidor queda casi vacía, porque sus lecturas ya no se registran.
- La actividad de la ficha sigue sin traducir «Estado actualizado». Queda fuera de este cambio.

## Evidencia y diferencias

22 PNG: el producto en 1440×900 y 390×844, claro y oscuro, y la maqueta como referencia. Todas las imágenes muestran la casa inventada del fixture y entidades sintéticas. Cada archivo tiene hash SHA-256 en `docs/public-assets.json`. Se regeneran con `HM_CAPTURE_ACTIVITY_HEIGHTS=1 npx playwright test tests/card/shell.browser.spec.mjs -g "capture activity"`.

La maqueta usa datos completos y siempre en claro. Este cambio no busca igualar su aspecto: sólo corrige la actividad y las alturas.

### Panel

§1 y §4. La estructura coincide. El plano ahora ocupa todo el alto libre. La maqueta muestra una alerta y más lecturas porque sus datos son otros.

| Tamaño / tema | Producto | Maqueta |
| --- | --- | --- |
| 1440×900 · claro | ![Panel desktop-light](evidence/0.9-activity-heights/desktop-light-plan.png) | ![Referencia desktop](evidence/0.9-activity-heights/desktop-light-reference-plan.png) |
| 1440×900 · oscuro | ![Panel desktop-dark](evidence/0.9-activity-heights/desktop-dark-plan.png) | ![Referencia desktop](evidence/0.9-activity-heights/desktop-light-reference-plan.png) |
| 390×844 · claro | ![Panel mobile-light](evidence/0.9-activity-heights/mobile-light-plan.png) | ![Referencia mobile](evidence/0.9-activity-heights/mobile-light-reference-plan.png) |
| 390×844 · oscuro | ![Panel mobile-dark](evidence/0.9-activity-heights/mobile-dark-plan.png) | ![Referencia mobile](evidence/0.9-activity-heights/mobile-light-reference-plan.png) |

### Actividad

§1. Tras tocar un dispositivo y recibir tres lecturas del medidor, la barra sigue diciendo *Enviado*. La maqueta añade el icono ✓ y *en el aire*, que dependen del eco RF.

| Tamaño / tema | Producto | Maqueta |
| --- | --- | --- |
| 1440×900 · claro | ![Actividad desktop-light](evidence/0.9-activity-heights/desktop-light-activity.png) | ![Referencia desktop](evidence/0.9-activity-heights/desktop-light-reference-plan.png) |
| 1440×900 · oscuro | ![Actividad desktop-dark](evidence/0.9-activity-heights/desktop-dark-activity.png) | ![Referencia desktop](evidence/0.9-activity-heights/desktop-light-reference-plan.png) |
| 390×844 · claro | ![Actividad mobile-light](evidence/0.9-activity-heights/mobile-light-activity.png) | ![Referencia mobile](evidence/0.9-activity-heights/mobile-light-reference-plan.png) |
| 390×844 · oscuro | ![Actividad mobile-dark](evidence/0.9-activity-heights/mobile-dark-activity.png) | ![Referencia mobile](evidence/0.9-activity-heights/mobile-light-reference-plan.png) |

### Modo edición

§3. Todo cabe en la ventana y las capas ya no quedan debajo del +. La maqueta lleva Guardar y el + en otra barra; aquí no cambian de lugar.

| Tamaño / tema | Producto | Maqueta |
| --- | --- | --- |
| 1440×900 · claro | ![Edición desktop-light](evidence/0.9-activity-heights/desktop-light-edit.png) | ![Referencia desktop](evidence/0.9-activity-heights/desktop-light-reference-edit.png) |
| 1440×900 · oscuro | ![Edición desktop-dark](evidence/0.9-activity-heights/desktop-dark-edit.png) | ![Referencia desktop](evidence/0.9-activity-heights/desktop-light-reference-edit.png) |
| 390×844 · claro | ![Edición mobile-light](evidence/0.9-activity-heights/mobile-light-edit.png) | ![Referencia mobile](evidence/0.9-activity-heights/mobile-light-reference-edit.png) |
| 390×844 · oscuro | ![Edición mobile-dark](evidence/0.9-activity-heights/mobile-dark-edit.png) | ![Referencia mobile](evidence/0.9-activity-heights/mobile-light-reference-edit.png) |

### Ficha de edición

§3. Sus acciones ya se ven enteras dentro de la ventana. **Sigue siendo una hoja flotante**, y la maqueta la acopla a la derecha: es una diferencia pendiente, fuera de este cambio. La referencia móvil es el lienzo de escritorio recortado por su contenedor.

| Tamaño / tema | Producto | Maqueta |
| --- | --- | --- |
| 1440×900 · claro | ![Ficha desktop-light](evidence/0.9-activity-heights/desktop-light-inspector.png) | ![Referencia desktop](evidence/0.9-activity-heights/desktop-light-reference-edit.png) |
| 1440×900 · oscuro | ![Ficha desktop-dark](evidence/0.9-activity-heights/desktop-dark-inspector.png) | ![Referencia desktop](evidence/0.9-activity-heights/desktop-light-reference-edit.png) |
| 390×844 · claro | ![Ficha mobile-light](evidence/0.9-activity-heights/mobile-light-inspector.png) | ![Referencia mobile](evidence/0.9-activity-heights/mobile-light-reference-edit.png) |
| 390×844 · oscuro | ![Ficha mobile-dark](evidence/0.9-activity-heights/mobile-dark-inspector.png) | ![Referencia mobile](evidence/0.9-activity-heights/mobile-light-reference-edit.png) |

### Panel junto a la barra lateral

Es el caso que fallaba: 1278×900 con el panel a 1022 px. La barra de espacios queda dentro de la ventana. La maqueta no dibuja este ancho.

| Tema | Producto |
| --- | --- |
| Claro | ![Panel estrecho claro](evidence/0.9-activity-heights/desktop-light-sidebar.png) |
| Oscuro | ![Panel estrecho oscuro](evidence/0.9-activity-heights/desktop-dark-sidebar.png) |
