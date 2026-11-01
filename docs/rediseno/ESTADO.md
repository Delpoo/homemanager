# Estado del rediseño

**Modo de trabajo vigente:** [modo-continuo.md](modo-continuo.md), instrucción del propietario; reemplaza LEEME sólo en sus puntos explícitos.

Fuente única de qué está hecho y qué falta. Cada agente actualiza **sólo su fila** y agrega su línea a la bitácora. Qué significa cada estado: [LEEME.md](LEEME.md#estados).

**Siguiente paso:** retomar la subida del lote 1 cuando vuelva a estar disponible el entorno local. P2 corregido y probado localmente (255 pruebas y formato aprobados); e50e712 integrado en el merge local 66265c3, conservando la auditoría. El entorno quedó indisponible antes de subir E03/E04/P2: faltan subida y CI del código nuevo. Autorización de subida ya concedida; «no publicar» prohíbe sacar una versión. [Reporte y checkpoint recuperable](https://github.com/Delpoo/homemanager/pull/52#issuecomment-6552694595). Auditoría en vivo pendiente; no iniciar lote 2.

## Etapas

| Etapa | Qué deja lista | Depende de | Estado | Agente | Rama / PR | Actualizada | Falta |
|---|---|---|---|---|---|---|---|
| [E00](etapas/E00-inventario.md) | Lista de todas las funciones que no se pueden perder | — | auditada | Codex (auditor) | `chatgpt/rediseno-e02-pantallas` · [PR #52](https://github.com/Delpoo/homemanager/pull/52) | 2026-11-01 | Auditoría documental completada: 137 funciones y 51 comandos trazados; falta recorrido independiente en app. Sin aprobación funcional. Ver veredicto. |
| [E01](etapas/E01-ficha-lateral.md) | Ficha lateral que no tapa el plano | E00 | auditada | Codex (auditor) | `chatgpt/rediseno-e02-pantallas` · [PR #52](https://github.com/Delpoo/homemanager/pull/52) | 2026-11-01 | Auditoría parcial de código/capturas/CI sin otro fallo identificado; falta comprobar en vivo edición, foco, cámara y teléfono/lector físicos. Sin aprobación funcional. |
| [E02](etapas/E02-pantallas.md) | Pantallas en lugar de ventanas apiladas | E00 | auditada | Codex (auditor) | `chatgpt/rediseno-e02-pantallas` · [PR #52](https://github.com/Delpoo/homemanager/pull/52) | 2026-11-01 | Auditoría parcial de código/capturas/CI; 250 pruebas de código y CI de 414 casos de navegador aprobadas en 7b3dd79. Faltan recorrido independiente de 68 filas y carga/guardado/recarga de plano viejo. Sin aprobación funcional. |
| [E03](etapas/E03-barra-capas-textos.md) | Barra de alertas, capas solo con símbolo y textos claros | E00 | pausada | Codex (implementación autorizada) | `chatgpt/rediseno-e02-pantallas` · [PR #52](https://github.com/Delpoo/homemanager/pull/52) | 2026-11-01 | P2 corregido localmente: Normal/Inversa y modos comunes traducidos, valores de comando intactos; regresión rojo/verde y check 255/formato aprobados. Entorno indisponible antes de subir. Faltan subida, CI nueva y reauditoría en vivo. |
| [E04](etapas/E04-pantalla-dispositivo.md) | Pantalla del dispositivo como en la maqueta | E00 | pausada | Codex (implementación autorizada) | `chatgpt/rediseno-e02-pantallas` · [PR #52](https://github.com/Delpoo/homemanager/pull/52) | 2026-11-01 | Implementación local conservada; e50e712 integrado con su auditoría en 66265c3. Entorno indisponible antes de subir E03/E04/P2. Faltan subida, CI nueva, auditoría en vivo y pruebas físicas ya declaradas. |
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

- 2026-11-01 · Codex (implementación autorizada por el propietario) · Lote 1 / P2 · Dirección vuelve a Normal/Inversa y los modos comunes se traducen sin cambiar sus valores; regresión comprobada fallando antes y pasando después, en ES/EN y ambos tipos de pantalla. Check 255 y formato aprobados. Commit exacto de auditoría e50e712 integrado localmente en 66265c3; se conserva íntegra su bitácora. La autorización actual permite subir y reportar, prohíbe fusionar a main y sacar versión. El entorno local quedó indisponible durante la preparación del envío: no se subieron E03/E04 ni P2 y no existe CI nueva de ese código. GitHub devuelve 404 para los commits locales originales. [Reporte único y código recuperable de la corrección](https://github.com/Delpoo/homemanager/pull/52#issuecomment-6552694595). No confundir este registro remoto con una subida del producto. Sin force push, acceso a la casa ni inicio del lote 2.

- 2026-11-01 · Codex (auditor, sin implementación) · E00–E04 · **Debe corregirse.** [Veredicto y 12 puntos de auditoria.md](https://github.com/Delpoo/homemanager/pull/52#issuecomment-6548120095). PR auditado en 7b3dd79 (E00–E02); E03 b0f5b36 y E04 693c7ef sólo locales, sin CI remota nueva. Reproducción de modelo confirmó regresión Normal/Inversa → forward/reverse y sleep sin traducir en versión local. Código exacto del PR: 250 pruebas, tipos/formato aprobados; local: check 254 y formato aprobados. CI 41209217667 verificada por logs: 414 casos de navegador aprobados/4 omitidos, integración 244 por versión HA. App no abierta: tiempo de espera del navegador integrado y bloqueo del control de Chrome al no poder verificar su URL; no se eludió. Capturas existentes revisadas, sin darlas por recorridos nuevos. Conservación completa de funciones, plano viejo guardado/recargado, teléfono/lector y E2E siguen sin validar por este auditor. Estados auditada registran revisión parcial, no aprobación del propietario. Sólo se modifica ESTADO.md y este comentario; sin correcciones de código, subida del lote 1, fusión, release, contacto con la casa ni inicio de lote 2.

- 2026-10-31 · ChatGPT · Lote 1 / E03 y E04 · Implementación local completa: capas por iconos, minimizar/ocultar, alertas permanentes, salud y textos ES/EN; ficha con seis canales Power 1…6, resumen, lecturas plegadas y Editar. 12/12 criterios, 21/21 funciones conservadas, 254 pruebas de código, 28 casos únicos de escritorio aprobados y uno móvil omitido, formato aprobado y 40 capturas ficticias. Dos commits locales, uno por etapa. La revisión automática rechazó crear el árbol en GitHub por interpretar «no publiques nada» como prohibición de subida: PR #52 permanece en `7b3dd79`, sin reporte nuevo ni CI del lote 1. Cierre pausado hasta autorización de subida; no avanzar de lote. Contrato e integración intactos, sin fusión, release, instalación ni contacto con la casa.

- 2026-10-31 · ChatGPT · Lote 0 / E02 · Cierre en PR #52 contra main, sin borrador: una sola vuelta de movimientos, herramientas de zonas sin desplazamiento horizontal en teléfono, 65 casos específicos de escritorio aprobados, 88 capturas ficticias y 6/6 criterios/68 filas registrados. Modo continuo guardado íntegro. Primera CI cancelada por tiempo con pruebas antiguas; 23 casos corregidos/repetidos. HA: 244 pruebas por versión aprobadas. Resultado final de CI en PR; no se corrió la suite general local. Próximo lote 1 después de «continuá».

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
