# E09 · Diseñador de controles

**Objetivo:** diseñar cualquier control combinando piezas. **Lo que se ve al abrir un control es exactamente lo que se diseñó.**
**Depende de:** E06 y E08.
**Comentarios:** [Controles remotos](../decisiones-propietario.md#controles-remotos). El propietario rechazó las dos opciones de forma fija.

## Problema hoy

- Hay **dos editores** con dos vocabularios: `src/editor/controls-editor.ts` (`button`, `cycle`, `updown`, `select`, `slider`) y el diseñador RF de `src/rf/` (`button`, `toggle`, `updown`, `steps`, `modes`), en una grilla de 4 columnas.
- La ventana del dispositivo muestra el control mezclado con otros bloques.

## Alcance

**Un solo diseñador,** para RF y para dispositivos de Home Assistant:
- **Piezas sueltas:** botón, botón cíclico, deslizador, `+` y `−`, selector de modos, interruptor, **indicador de valor** y separador o título. Investigar qué más sirve en un control digital y proponerlo.
- **Combinaciones libres:** por ejemplo, `−`, indicador de velocidad y `+`.
- **Cada pieza:** nombre, icono (E08), tamaño, qué ejecuta y qué muestra.
- **Lienzo:** arrastrar, cambiar tamaño, alinear, deshacer, vista previa real. Bueno también en el teléfono, o decir qué parte no.

**Ventana al abrir un control:**
- Primero, el control diseñado, tal cual.
- Lo demás (lecturas, controles de Home Assistant, corregir estado) queda **plegado**, nunca eliminado.

**Estado:** un indicador en un control RF no conoce el valor real. Se muestra como **estimado** y nunca como confirmado (D14, D18).

## Antes de construir

Las piezas nuevas pasan por `rf_model.py`, que valida cada diseño guardado. Un diseño actual debe verse igual después de esta etapa.

Hay pantallas sin maqueta: dibujar diseñador y ventana con los componentes de [vision-mockup §6](../../vision-mockup.html#s6), y validarlas antes de programar.

## Fuera de alcance

Aprendizaje (E10) y crear scripts o automatizaciones.

## No se puede perder

Diseño automático, roles (ventilador, luz), botones aprendidos, probar un botón, widgets actuales, correcciones de estado, envíos por la lista de servicios permitidos, controles con pasos de `bindings.controls`, y los 3 atajos junto al símbolo.

## Dónde mirar

- `src/rf/layout.ts`, `src/rf/remote-view.ts`, `src/rf/manager.ts`, `src/rf/catalog.ts`.
- `src/editor/controls-editor.ts`, `src/card/device-controls.ts`, `src/model/control-capabilities.ts`.
- `src/panels/native-panel.ts`, `src/panels/controls.ts`.
- `custom_components/homemanager/rf_model.py`, `docs/rf-manager.md`.

## Pasos

1. Reclamar la etapa.
2. **Parada de validación 1:** dibujos de diseñador y ventana, lista de piezas y cómo se migran los dos vocabularios.
3. Modelo único con migración de lectura, y pruebas.
4. **Parada de validación 2:** diseñador funcionando con los dos vocabularios antiguos, antes de sumar piezas nuevas.
5. Piezas nuevas y ventana.
6. Pruebas, capturas y reporte.

## Aceptación

- [ ] Un control diseñado se ve igual en el diseñador y al abrirlo.
- [ ] Se puede armar `−`, indicador y `+` sin código.
- [ ] Todos los controles guardados se ven y funcionan igual.
- [ ] Ningún icono queda limitado a una lista corta.
- [ ] Un indicador RF dice que es estimado.
- [ ] Nada que antes estaba disponible en la ventana se perdió.
- [ ] Un comando no permitido sigue siendo rechazado.

## Registro

### 2026-11-02 - Codex - implementación del lote 3
- **Propuesta y decisiones:** un lienzo común para RF y HA, con el mismo inspector, selector amplio y vista previa del renderer real. Piezas: pulsador, ciclo, deslizador continuo por pasos, interruptor, subir/bajar, selector, indicador, título, separador y control HA existente. Más y menos son pulsadores independientes; Detener se compone con un botón y una acción permitida, sin inventar otra pieza. Recomendación elegida conforme al modo continuo, sin atribuir aprobación de diseño al propietario; capturas con componentes de §6 al cierre.
- **Migración de lectura:** los cinco widgets RF guardados conservan nombres, referencias, coordenadas y renderer. Los cinco controles HA conservan tipos, pasos, orientación, gestos y alfileres; se pueden insertar como piezas sin reescribirlos. El nuevo `bindings.layout` opcional sólo guarda disposición y referencias. Las acciones siguen en su catálogo y el diseñador RF deja de tener su inspector anterior: ambos usan ControlDesigner. Disposición automática y deshacer conservan botones/acciones.
- **Lienzo:** arrastre, esquina de tamaño, teclado, alineación izquierda/centro/derecha, cancelación confirmada y Volver con borrador conservado. Cuadrícula de cuatro columnas, hasta 40 filas/64 piezas; tamaño de 1–4 por 1–3. Mantiene las medidas anteriores y se adapta al teléfono; no promete posicionamiento por píxel libre. La vista previa no puede enviar comandos.
- **Aceptación:** 1 cumplido, mismo renderer y geometría comprobada diseñador/uso; 2 cumplido, recorrido crea −, indicador y +; 3 cumplido, pruebas de dibujo anterior, pasos y guardado/recarga sin borrar acciones; 4 cumplido, mismo selector E08 para todas las piezas; 5 cumplido, lectura RF marcada Estimado, nunca confirmada; 6 cumplido, control primero y lecturas/HA/acciones/corrección en plegable accesible; 7 cumplido, comandos siguen por ControlHost y adaptador, pruebas existentes de rechazo en check. No se atribuyen pruebas físicas.
- **Inventario, 32 filas:** F-008 menú; F-029/F-030 gestos y acceso al control; F-031/F-097 alfileres/tamaño; F-040 actividad; F-049 mando asociado; F-052 panel adicional; F-054 sugerencias; F-070/F-073 capacidades y campos verificados; F-071 disposición elegida primero; F-072 corrección sin envío en plegable; F-074 confianza/teclado; F-079/F-080 editores avanzados intactos; F-094/F-095/F-096 controles/pasos/deslizador conservados; F-098/F-099 lista/nuevo; F-100 metadatos/botones; F-101 ajustes medidos; F-102 partes/roles; F-103 automático con confirmación/deshacer; F-104 piezas y referencias; F-105 arrastre/tamaño; F-106 guardar/cancelar/volver; F-107 borrado con advertencia; F-121 contrato opcional; F-123 servicios/destinos/TTL; F-131 búsqueda/manual/iconos fuera de lista. Ninguna retirada.
- **Comprobaciones:** cuatro recorridos focales de escritorio aprobados (composición/vista previa/undo RF, diseñador/guardar/recargar HA, movimiento/tamaño/borrado anterior, Volver con borrador). 27 casos compartidos JS/esquema/Python y cinco tipos nuevos del validador RF real aprobados. Check al cerrar este commit; capturas, pytest y CI en el cierre del lote.
- **Falta:** auditoría independiente, validación funcional y teléfono/lector/RF físicos. E2E completo en HA desechable previsto para lote 4. Sin envíos a la casa, cambios de protocolo ni automatizaciones.
- **Dónde quedó:** rama `chatgpt/rediseno-lote-3`, commit E09; PR propio al cerrar E10, dependiente de #55 todavía sin fusionar.
- **Piezas nuevas:** regresión adicional aprobada: el ciclo RF actualiza su próximo botón inmediatamente tras cada envío y el deslizador no envía durante el arrastre, sólo al soltar. Un envío pendiente no admite otra pulsación sobre la misma pieza. Sin afirmar un cambio físico.
- **Revisión del cierre:** abrir el diseñador materializa los controles de lectura de un plano anterior, de modo que su acción principal también es una pieza visible. Regresión comprueba el botón antiguo después de guardar/recargar. Indicadores RF del panel abierto usan las mismas lecturas que el diseñador y se actualizan en vivo, siempre estimados. Referencias de indicadores HA participan en la actualización del adaptador. El inspector usa una pantalla completa por encima del lienzo y conserva Volver/cancelación/foco; fondo inerte mientras se edita.
