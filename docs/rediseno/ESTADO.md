# Estado del rediseño

Fuente única de qué está hecho y qué falta. Cada agente actualiza **sólo su fila** y agrega su línea a la bitácora. Qué significa cada estado: [LEEME.md](LEEME.md#estados).

**Siguiente paso:** el propietario valida estas guías; después, E00.

## Etapas

| Etapa | Qué deja lista | Depende de | Estado | Agente | Rama / PR | Actualizada | Falta |
|---|---|---|---|---|---|---|---|
| [E00](etapas/E00-inventario.md) | Lista de todas las funciones que no se pueden perder | — | pendiente | — | — | — | Todo |
| [E01](etapas/E01-ficha-lateral.md) | Ficha lateral que no tapa el plano | E00 | pendiente | — | — | — | Todo |
| [E02](etapas/E02-pantallas.md) | Pantallas en lugar de ventanas apiladas | E00 | pendiente | — | — | — | Todo |
| [E03](etapas/E03-barra-capas-textos.md) | Barra de alertas, capas solo con símbolo y textos claros | E00 | pendiente | — | — | — | Todo |
| [E04](etapas/E04-pantalla-dispositivo.md) | Pantalla del dispositivo como en la maqueta | E00 | pendiente | — | — | — | Todo |
| [E05](etapas/E05-modulos.md) | Símbolos por módulos, sin categorías que limiten | E01 | pendiente | — | — | — | Todo |
| [E06](etapas/E06-gestos.md) | Gestos configurables | E05 | pendiente | — | — | — | Todo |
| [E07](etapas/E07-reglas.md) | Pantalla de Reglas | E05 | pendiente | — | — | — | Todo |
| [E08](etapas/E08-iconos-color.md) | Un solo selector de iconos, lista amplia y color | E05 | pendiente | — | — | — | Todo |
| [E09](etapas/E09-disenador-controles.md) | Un solo diseñador de controles, flexible | E06, E08 | pendiente | — | — | — | Todo |
| [E10](etapas/E10-aprendizaje-rf.md) | Aprender botones con pasos guiados | E09 | pendiente | — | — | — | Todo |
| [E11](etapas/E11-alternativas-plano.md) | Alternativas del plano, claras y oscuras | E02 | pendiente | — | — | — | Todo |
| [E12](etapas/E12-panel-lateral.md) | Panel lateral editable | E05, E07 | pendiente | — | — | — | Todo |
| [E13](etapas/E13-espacio-pared.md) | Vista por espacio en PC y modo pared | E11 | pendiente | — | — | — | Todo |

E01 a E04 no dependen entre sí, pero E01, E02 y E03 tocan archivos en común. Conviene hacerlas de a una.

## Otros trabajos del repositorio

No son parte de este rediseño, pero pueden tocar los mismos archivos. Antes de empezar, mirar [../roadmap.md](../roadmap.md).

| Trabajo | Riesgo de choque | Estado al 31/10/2026 |
|---|---|---|
| 0.10 · etapa 4, plano vinculado | E11 | Sin empezar según la hoja de ruta |
| 0.10 · etapa 5, áreas de Home Assistant | E05 (hoy propone categorías) | Sin empezar según la hoja de ruta |
| 0.10 · etapa 6, limpieza | Todas | Sin empezar según la hoja de ruta |
| Pista B · ESPHome | E09, E10 | El propietario pidió revisarla más adelante |

## Decisiones pendientes del propietario

Nada de esto frena E00. Quien llegue a una etapa con una decisión abierta, pregunta y espera.

| # | Pregunta | Recomendación | Afecta a | Estado |
|---|---|---|---|---|
| 1 | ¿Las alertas que hoy salen solas (por ejemplo, un sensor de fuga mojado) quedan como reglas base visibles y desactivables? | Sí | E07 | Abierta |
| 2 | ¿Se aceptan PDF al subir un plano, o se convierten antes? | Aceptar SVG, PNG y JPG; el PDF se convierte antes | E11 | Abierta |
| 3 | ¿Qué pantallas sin maqueta se dibujan antes de construirlas? Ventana de controles, editar un aviso, otras secciones de Ajustes, panel oscuro de escritorio, RF en el teléfono | Dibujarlas en la etapa que las toca y validarlas | E02, E04, E07, E09 | Abierta |
| 4 | ¿Qué falla de la vista por espacio en la PC? | La revisa el auditor y lo muestra | E13 | Abierta |
| 5 | ¿Cómo se ordenan estas etapas con las que faltan de la 0.10? | Terminar lo que esté en curso y no correr dos trabajos sobre los mismos archivos | Todas | Abierta |

## Bitácora

Una línea por entrega, la más reciente arriba: `AAAA-MM-DD · agente · etapa · qué pasó`.

- 2026-10-31 · Claude (guía y auditor) · — · Creó las guías y la maqueta de módulos. Todavía sin validar por el propietario.
