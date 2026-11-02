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

### 2026-11-02 - Codex - cierre del lote 3
- **Hecho:** aprendizaje visible junto al diseñador RF; guiado por elegir botón, apuntar/pulsar y probar/guardar. Modo libre a un toque, receptor elegible, detalles plegados y ayuda sin receptor disponible. Se retiene el candidato del botón elegido aunque lleguen otras señales.
- **Criterio real:** tres tramas iguales en una pulsación o dos pulsaciones separadas por más de 0,3 s; contadores entregados por backend, sin avance inventado ni cambio de protocolo. Confirmar calidad de señal no confirma el estado físico.
- **Aceptación:** 1 cumplido, panel visible al editar sin captura automática; 2 recorrido guiado con receptor simulado aprobado, usabilidad con persona nueva pendiente; 3 contadores reales y confirmación comprobados por modelo/navegador; 4 modo libre accesible y probado; 5 ausencia/desconexión explica Equipos y no inicia captura; 6 recorridos a 390x844 y capturas claro/oscuro; 7 datos y señales exclusivamente ficticios.
- **Inventario, 13 filas:** F-008 acceso desde menú; F-100 metadatos y botones intactos; F-101 ajustes medidos conservados; F-108 selector/captura/cierre en libre y guiado; F-109 candidatos y razones en detalles; F-110 nombre/icono/rol conservados; F-111 prueba con ajustes existentes; F-112 resultado e intentos de una variable; F-113 guardar sin probar y primer botón; F-114 equipos/actualizar; F-115 ayuda YAML/copia; F-116 receptor predeterminado y prueba; F-099 creación de control. Ninguna función retirada. Equipos, variantes y YAML se mantienen por código y pruebas existentes, sin afirmar prueba física.
- **Comprobaciones:** check 279, formato y 14 recorridos focales escritorio/móvil aprobados. Python real aislado: 27 casos compartidos de disposición y cinco tipos RF nuevos aceptados. Pytest local intentado, módulo no instalado; integración y suite completa pendientes de CI en el PR.
- **Decisiones:** mostrar los dos criterios reales y no alterar backend; panel al lado en escritorio, flujo vertical en móvil. Capturas y comparación en docs/evidence/rediseno-lote3/README.md.
- **Falta:** CI completa, auditoría independiente, validación funcional y teléfono/lector/receptor físicos. E2E HA desechable previsto al cerrar lote 4.
- **Dónde quedó:** chatgpt/rediseno-lote-3, commit E10; subida rechazada por revisión automática, PR pendiente hacia main dependiente de #55, sin fusión, versión ni casa real.

- **Cierre remoto autorizado:** autorización expresa «si autorizo, este y futuros» resuelve el bloqueo de subida. PR #56 abierto; ambas etapas transferidas con árboles idénticos. La integración inicial aprueba 247 pruebas por versión HA. Regresión CP6 rojo/verde: texto visible dice señales en lugar de tramas, manteniendo contadores del backend; Guardar conserva icono y nombre accesible en el inspector común. Nueve casos de escritorio y siete móviles aprobados tras corregir; 279 pruebas y formato aprobados. Ocho capturas actualizadas. Resultado final de CI en el reporte único del PR; auditoría y pruebas físicas siguen pendientes.
