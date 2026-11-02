# E10 · Aprender botones con pasos

**Objetivo:** aprender un control debe ser lindo e intuitivo, con pasos, como en la maqueta, y fácil de encontrar.
**Depende de:** E09.
**Maqueta:** [vision-mockup §10](../../vision-mockup.html#s10). Comentario del propietario: «falta la sección de aprendizaje».

## Situación hoy

El aprendizaje existe (`src/rf/learn.ts`), pero **hay que entrar a un modo para verlo** y funciona distinto de la maqueta:

| | Hoy | Maqueta |
|---|---|---|
| Orden | Cualquier botón, en cualquier orden | Un botón por vez, con pasos 1-2-3 |
| Avance | Cada código recibido con su explicación | «2 de 3 señales iguales» |
| Lugar | Se abre desde un acceso | Panel a la derecha del control |

## Alcance

- Panel de aprendizaje siempre visible a la derecha del control mientras se lo edita, sin necesidad de buscarlo.
- **Modo guiado** como camino principal: elegir un botón, apuntar, pulsar, ver el avance y probar.
- **Modo libre** actual: se conserva, a un toque.
- **Detalles de la señal,** plegados.
- Primer uso: si no hay un receptor o está desconectado, explicar qué hacer.

## Antes de construir

Comprobar si «3 señales iguales» es real: `learn.ts` y `rf_model.py` determinan cuándo un código es confiable. **No mostrar un avance inventado.** Si hoy se usa otro criterio, mostrar el verdadero y proponer el cambio.

## Fuera de alcance

Cambios de protocolo RF y Pista B de ESPHome.

## No se puede perder

Elegir el receptor, ver código a código, candidatos y por qué son o no confiables, probar con los ajustes medidos, los intentos que cambian un ajuste a la vez, nombre, icono y rol, crear un control nuevo con su primer botón.

## Dónde mirar

`src/rf/learn.ts`, `src/rf/manager.ts`, `src/ui/rf-components.ts`, `docs/rf-manager.md`, `tests/rf/cp6.browser.spec.mjs`.

## Pasos

1. Reclamar la etapa.
2. Investigar el criterio real de confianza.
3. Panel y modo guiado, sin tocar la lógica de aprendizaje si no hace falta.
4. Probar con un receptor simulado. Decir si no hubo prueba con uno real.
5. Pruebas, capturas y reporte.

## Aceptación

- [ ] Al editar un control, el aprendizaje está a la vista.
- [ ] Una persona sin experiencia aprende un botón siguiendo la pantalla.
- [ ] El avance refleja el criterio real.
- [ ] El modo libre sigue disponible.
- [ ] Sin receptor, la pantalla explica qué hacer.
- [ ] Se ve bien en 390×844.
- [ ] Ningún código RF real en pruebas ni capturas.

## Registro
