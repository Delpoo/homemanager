# E06 · Gestos configurables

**Objetivo:** elegir qué hace cada gesto sobre un símbolo.
**Depende de:** E05.
**Maqueta:** [módulos, dibujo 1, bloque Gestos](../maqueta-modulos.html). Decisión: [D25](../../decisions.md).

## Alcance

- **Gestos:** tocar y mantener.
- **Acciones posibles:** abrir su pantalla, abrir el control completo, ejecutar un botón o control, abrir un panel nativo, nada.
- **Doble toque:** no incluirlo ahora. Obliga a esperar después de cada toque y todos se sentirían más lentos. El modelo debe poder sumar otro gesto más adelante sin cambiar el formato.
- **Salida fija:** aunque mantener no abra el control, debe haber otra forma de llegar: por ejemplo, desde su pantalla o desde *Ahora*. Nadie puede quedar sin acceso a un control.
- **Si la acción elegida ya no existe,** el símbolo avisa y abre su pantalla.

## Fuera de alcance

Acciones automáticas (E07 sólo avisa) y gestos nuevos.

## Datos

- `bindings.tap` ya existe y se mantiene compatible, incluido `null`, que abre el panel.
- Agregar `bindings.hold`, opcional. Si falta, se comporta como hoy (abre el panel).
- Revisar D18: esta etapa reemplaza «mantener pulsado abre siempre el panel».

## No se puede perder

Atajos junto al símbolo y sus gestos propios (un deslizador arrastra, no mueve el plano), toque con controles `button` y `cycle`, `primaryAction` de planos viejos, `LONG_PRESS_MS` y el clic que no debe dispararse después de mantener.

## Dónde mirar

- `src/card/gestures.ts`, `src/card/card-helpers.ts`, `src/card/commands.ts`, `src/card/device-controls.ts`.
- `src/panels/native-panel.ts`, `src/panels/device-screen.ts`.
- `src/editor/controls-editor.ts`, `src/editor/index.ts`.
- Validación en los tres lugares.

## Pasos

1. Reclamar la etapa.
2. Función pura que resuelve «gesto + símbolo → acción», con pruebas.
3. Conectar gestos, bloque de la ficha y validación.
4. Probar con mouse, teclado, táctil y lector de pantalla.
5. Pruebas, capturas y reporte.

## Aceptación

- [ ] Se puede configurar por separado tocar y mantener.
- [ ] Sin configurar, todo funciona como antes.
- [ ] Un plano 0.6 con `primaryAction` sigue funcionando.
- [ ] El teclado tiene una forma de ejecutar ambas acciones.
- [ ] Si mantener no abre el control, el control sigue accesible.
- [ ] Un botón borrado no rompe el símbolo.
- [ ] Toda acción muestra respuesta en la barra de actividad.

## Registro

### 2026-11-02 — Codex — implementación local
- **Hecho:** resolución pura de tocar/mantener; bloque Gestos independiente, acciones pantalla/control completo/control elegido/panel nativo/nada. Mayús+Enter ejecuta mantener; menú contextual y tecla ContextMenu siempre abren controles. Se conserva LONG_PRESS_MS y supresión del clic posterior.
- **Contrato:** `bindings.hold` opcional, y objetos de acción opcionales en `tap`; cadena y null antiguos conservados. Objetos `{action, controlId?}` extensibles a nuevos gestos sin duplicar acciones. Un deslizador elegido abre el control para ajustar su valor, no inventa uno.
- **Aceptación:** 1 cumplido, ambos selectores y prueba navegador; 2 cumplido, casos ausente/null y apertura antigua; 3 cumplido, primaryAction en prueba unitaria; 4 cumplido, Mayús+Enter/ContextMenu en navegador; 5 cumplido, acceso fijo al control; 6 cumplido, referencia perdida resuelta a pantalla y aviso; 7 cumplido, acciones de navegación/nada registradas como actividad sin confirmación física, envíos usan flujo existente.
- **Inventario:** F-029 gesto a módulo; F-030 menú contextual/teclado conservado; F-033 doble toque del fondo intacto; F-097 tamaño y alfileres conservados, toque movido; F-121 compatibilidad en contrato. Atajos no capturan el paneo, lógica existente sin cambios.
- **Comprobaciones:** pruebas puras de compatibilidad/resolución; dos recorridos de escritorio de módulos/gestos aprobados. Check y matriz de validadores se registran en el cierre del lote.
- **Falta:** lector y pantalla táctil físicos, auditor independiente; capturas/CI al cerrar lote.
- **Dónde quedó:** rama `chatgpt/rediseno-lote-2`, commit E06; PR al cierre.

### 2026-11-02 — Codex — cierre del lote 2
- Siete criterios cotejados; teclado y menú contextual en navegador, supresión de clic y atajos conservados. Referencias nativas ausentes también vuelven a pantalla con aviso. La descripción accesible dice las acciones reales de tocar/mantener. Campos opcionales cubiertos por los 34 casos compartidos de los tres validadores.
- E06 queda en revisión; cinco filas del inventario, sin afirmar prueba con lector o teléfono físicos. CI del lote en el PR.

### 2026-11-02 — Codex — compatibilidad final en PR #55
- La prueba de un primaryAction anterior reprodujo la pérdida del aviso junto al símbolo, aun enviándose la acción. Se corrigió reutilizando runStep, con regresión rojo/verde. También se conserva la salida a pantalla si la acción heredada fue borrada. No se modifica el vocabulario ni se infiere confirmación física.
- Corrección aislada posterior a los cuatro commits de etapa, sin reescribir la historia ya subida. Check y CI exacta en el reporte del PR #55.

### 2026-11-02 — Codex — corrección tras CI del PR #55
- La descripción accesible de un ciclo vuelve a decir la próxima acción (Encender/Apagar), además de las acciones configuradas para mantener. Regresión reproducida y caso repetido aprobado.
- Se actualizaron los recorridos de ficha para abrir el bloque Gestos y el Panel nativo donde ahora están. El selector nativo recibe nombre accesible explícito. Una referencia borrada conserva el símbolo accesible y abre su pantalla sin enviar; la prueba comprueba además que los demás controles siguen enviando normalmente.
- Sólo se repitieron localmente los tres casos señalados por CI: los tres aprobados. Sin modificar acciones, datos ni casa real.

### 2026-11-02 - Codex - cierre pausado por revisión automática
- **Hecho:** corrección final guardada en el commit local `3b514b3`; check 274, formato y los tres casos de escritorio señalados por CI aprobados.
- **Falta:** autorización explícita para subir la corrección al PR #55 y verificar CI del commit final. La revisión automática rechazó la creación del árbol remoto porque interpretó «no publiques nada» como prohibición de subida; no se intentó otro canal.
- **Dónde quedó:** rama local `chatgpt/rediseno-lote-2`; remoto en `1d0ea7c60803e9f834f56868455731b7b4537d8d`. E06 pausada y resto del lote implementado para revisión; no iniciar E09/E10.
