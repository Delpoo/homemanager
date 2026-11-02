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

### 2026-11-03 - Codex - lote 4, E13
- **Diagnóstico comprobado:** la flecha anterior ignoraba el clic de mouse, sólo permitía tirar o teclado. En 1920x1080 se reprodujo además que el contenedor nativo se desplazaba por foco y dejaba una flecha fuera de su viewport (diferencia de 46 px). El nombre enviado a la barra de estado no se retiraba. Capturas anteriores y actuales ficticias en la evidencia del lote.
- **Recomendación elegida:** clic de mouse en escritorio navega; mantener muestra el destino, tirar sigue funcionando y en teléfono se conserva el toque anterior. Flechas limitadas al área visible; overflow clip evita el desplazamiento nativo sin cambiar la cámara por transformaciones. El nombre aparece la primera visita y se retira tras 1,6 s; mantener sigue mostrándolo mientras se sostiene. Teclado, reducción de movimiento, interruptores de flechas/deslizar y editor de espacios se conservan.
- **Modo pared:** entrada real a pantalla completa, paleta oscura local (sin cambiar la preferencia general), alternativa oscura si existe, panel Ahora wall opcional y salida por icono o Escape. Entrar y salir encuadra la casa entera. Si el navegador rechaza pantalla completa se informa y no se declara modo pared activo.
- **Aceptación:** 1 parada de aprobación sustituida por el modo continuo del propietario; se adopta la recomendación y se registra el diagnóstico, sin atribuir aprobación funcional; 2 cumplida, recorridos mouse/teclado en 1440x900 y 1920x1080; 3 cumplida, nombre temporal y ninguno fijo encima del plano, comprobado en navegador; 4 gestos y ambos interruptores móviles aprobados, incluidos sostener/tirar/deslizar; 5 pantalla completa real de Chromium comprobada, también salida y selección de panel independiente. No fue en tablet real.
- **Inventario, 10 filas:** F-014 pantalla completa normal intacta y modo pared adicional; F-032 cámara; F-033 doble toque; F-034 agrupación; F-035 casa/espacio y carril; F-036 flechas/teclado/tirar más clic PC; F-037 deslizar/interruptor independiente; F-077 editor; F-078 encuadre/navegación; F-122 datos intactos. No se elimina ninguna ruta. Los dos primeros problemas tuvieron reproducción antes de corregir; no se inventa una validación del propietario.
- **Comprobaciones:** siete recorridos focales de cierre de escritorio y once móviles aprobados (se repite el caso de encuadre con fixture corregido). Check combinado 284 aprobado; formato, capturas y CI finales al cerrar. Nuevo job prepara un HA mínimo y nuevo en un runner Linux, sólo loopback, para probar frontend, guardado, imágenes, lectura, servicio ficticio, navegación y fullscreen.
- **Correcciones de cierre del lote:** copiar con imágenes descarga una copia actual antes de reemplazar el borrador; vista móvil de los editores ajustada, salida de pared integrada en cabecera y selector de alternativa no captura el arrastre del plano. Ninguno de estos cambios elimina datos o envía señales reales.
- **Falta:** CI completa, E2E de HA desechable y auditoría independiente. No se probaron teléfono/lector/tablet físicos ni imágenes reales de la vivienda. Rama chatgpt/rediseno-lote-4, dependiente de #55/#56, sin fusión ni versión.
