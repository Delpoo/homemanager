# Estado del rediseño

Fuente única de qué está hecho y qué falta. Cada agente actualiza **sólo su fila** y agrega su línea a la bitácora. Qué significa cada estado: [LEEME.md](LEEME.md#estados).

**Siguiente paso de E02:** completar validación y auditoría del PR #52; implementación y 60 capturas publicadas, 12 capturas pendientes.

## Etapas

| Etapa | Qué deja lista | Depende de | Estado | Agente | Rama / PR | Actualizada | Falta |
|---|---|---|---|---|---|---|---|
| [E00](etapas/E00-inventario.md) | Lista de todas las funciones que no se pueden perder | — | en revisión | ChatGPT | `chatgpt/rediseno-e00-inventario` · [PR #49](https://github.com/Delpoo/homemanager/pull/49) | 2026-10-31 | Auditoría en vivo y validación del propietario de seis destinos «a decidir»; inventario de 137 funciones entregado con evidencia por fila |
| [E01](etapas/E01-ficha-lateral.md) | Ficha lateral que no tapa el plano | E00 | en revisión | ChatGPT | `chatgpt/rediseno-e01-ficha-lateral` · [PR #51](https://github.com/Delpoo/homemanager/pull/51) | 2026-10-31 | Auditoría y validación; 250 pruebas de código y 11 de navegador pasan; teléfono real, suite completa y E2E HA pendientes |
| [E02](etapas/E02-pantallas.md) | Pantallas en lugar de ventanas apiladas | E00 | pausada | ChatGPT | `chatgpt/rediseno-e02-pantallas` · [PR #52](https://github.com/Delpoo/homemanager/pull/52) | 2026-10-31 | Código y pruebas publicados; 250 pruebas de código y 105 casos únicos de navegador aprobados, 1 omitido. Suite general, auditoría, teléfono y E2E pendientes; 60/72 capturas transferidas |
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
| 0.10 · etapa 4, plano vinculado | E00, E11 | Fusionada en `main` (#47), sin publicar |
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

- 2026-10-31 · ChatGPT · E02 · Autorizada por el propietario e implementada en PR #52: pantallas con vuelta y borradores, confirmaciones únicas, 250 pruebas de código y 105 casos únicos de navegador aprobados, 1 omitido. Main b9cce00 integrado. 60 de 72 capturas transferidas; desconexión local impidió las otras 12. Suite general y auditoría pendientes. Reporte: entregas/E02-2026-10-31-continuacion.md. No iniciar E03.

- 2026-10-31 · ChatGPT · E02 · Pausada en la parada de validación de diseño, PR #52: clasificación de 12 aperturas, usos del helper y propuesta HTML. Recomienda Vincular en ficha de escritorio y pantalla completa móvil. Sin convertir src/. Capturas locales anteriores y comprobación del HTML publicado pendientes de incorporar/repetir; no se dan por aprobadas. Reporte en entregas/E02-2026-10-31.md.

- 2026-10-31 · ChatGPT · E02 · Reclamada por «continua con eo1 y eo2». Rama creada desde main 764a9e0 e integrada con E01, PR apilado para evitar mezclar etapas. Alcance inicial: clasificación y maquetas; parada de validación obligatoria antes del código de conversión.

- 2026-10-31 · ChatGPT · E01 · Implementada para revisión en #51: dock de 380 px, hoja móvil ampliable, vista previa sin guardar y deshacer local. 25 funciones cotejadas con método por fila; 250 pruebas de código y 11 de navegador pasan, 1 omitida. Seis capturas nuevas. Suite completa sin iniciar por timeout del servidor; teléfono y E2E HA pendientes. E02 autorizada aparte por el propietario, sin saltar su parada de diseño.

- 2026-10-31 · ChatGPT · E01 · Reclamada por instrucción del propietario «continua con eo1 y eo2». Rama creada desde main 764a9e0 e integrada con E00 (#49), sin fusionar a main ni aprobar por cuenta propia sus decisiones. E02 se preparará después en otra rama, respetando su parada de validación de pantallas.

Una línea por entrega, la más reciente arriba: `AAAA-MM-DD · agente · etapa · qué pasó`.

- 2026-10-31 · ChatGPT · E00 · Cierre actualizado: main 764a9e0 (#50) integrado; 137 funciones, 40 con capturas históricas, 51 comandos y 12 aperturas. Check (248) y formato pasan; navegador pendiente de auditoría. Misma parada antes de E01.
- 2026-10-31 · ChatGPT · E00 · Terminada para revisión en PR #49: 131 funciones (40 con capturas históricas además de código), 49 comandos literales y 12 aperturas de ventanas. Check (239) y formato pasan; navegador no aprobado. Seis destinos a validar antes de E01. Reporte en entregas/E00-2026-10-31.md.
- 2026-10-31 · ChatGPT · E00 · Retomada por instrucción del propietario, con guías fa97550 y main 7f192e3 integrados. Se distingue código, captura y app; E00 no requiere maqueta.
- 2026-10-31 · ChatGPT · E00 · Pausada en PR #49: 28 funciones registradas sólo desde código; navegador rechazó la apertura local de la maqueta. Faltan recorrido y cobertura completa. Reporte en entregas/E00-2026-10-31.md; no iniciar E01.
- 2026-10-31 · ChatGPT · E00 · Etapa reclamada desde main 9a5d975; guías leídas en claude/guias-rediseno (4e376aa), sin modificar sus otras etapas.
- 2026-10-31 · Claude (guía y auditor) · — · Agregó la maqueta como imágenes y qué hacer si una herramienta no puede abrir algo.
- 2026-10-31 · Claude (guía y auditor) · — · Creó las guías y la maqueta de módulos. Todavía sin validar por el propietario.
