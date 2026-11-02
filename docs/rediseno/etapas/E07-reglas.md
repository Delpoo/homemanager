# E07 · Pantalla de Reglas

**Objetivo:** crear reglas en un solo lugar. Por ahora **sólo avisan e indican**. Sin límites fijos.
**Depende de:** E05.
**Maqueta:** [módulos, dibujos 2 y 5](../maqueta-modulos.html). Decisión: [D26](../../decisions.md).

## Alcance

- **Pantalla Reglas,** dentro de Ajustes y con acceso directo: lista con interruptor, y un editor.
- **Una regla:** nombre; **cuando** (lectura, condición, valor, duración opcional); **entonces se ve** (alerta, aviso o sólo indicador; insignia y color; resaltar; mensaje en la barra; aparece en *Ahora*); **en qué símbolos**. Puede no tener ninguno.
- **Vista previa:** muestra el valor real y si hoy se cumple.
- **Ficha del símbolo:** bloque que lista las reglas que lo afectan, con un acceso a *Crear regla para este símbolo*, que abre la misma pantalla con el dispositivo elegido.
- **Quitar lo fijo:** `plantAlertSuggestions` sale. Nada de 20 %, 800 lx o 10 °C por defecto. El límite lo pone el usuario.

## Antes de construir

- **Decisión pendiente n.º 1** de [ESTADO](../ESTADO.md): las alertas automáticas, como un sensor de fuga mojado (`src/model/alerts.ts`). Recomendación: mostrarlas como reglas base, visibles y desactivables.
- Una regla sobre varios dispositivos («cualquier sensor de fuga») requiere definir cómo se elige el grupo. Proponer lo más simple.

## Fuera de alcance

Ejecutar acciones: **nada de encender, apagar ni llamar servicios**. Notificaciones al teléfono. Hoy las reglas se evalúan en la pantalla abierta (`src/shell/runtime-feed.ts`): para efectos visuales alcanza, y queda documentado que sin la app abierta no corren. Si se quiere otra cosa, es otra etapa, dentro de Home Assistant.

## Datos

- `display.alerts` existente **se conserva y se sigue leyendo** como reglas de ese símbolo. Un plano viejo no pierde avisos.
- Recomendación: lista de reglas en la configuración, opcional, y sin duplicar al guardar. Validación en los tres lugares.
- Una lectura debe seguir teniendo asociación verificable: un nombre nunca prueba que una entidad pertenece a un dispositivo.
- Revisar el límite actual de 4 reglas por dispositivo. Decir qué límite queda y por qué.

## No se puede perder

Los avisos configurados, la duración con su lógica de observación (`observeAlertRules`, sin inventar historial), niveles de alerta y aviso, `display.highlight`, insignias en símbolo y espacio, *Ahora*, encuadrar el sensor desde la alerta.

## Dónde mirar

- `src/model/alert-rules.ts`, `src/model/alert-settings.ts`, `src/model/alerts.ts`, `src/model/now.ts`.
- `src/ui/alert-editor.ts`, `src/ui/alert-components.ts`.
- `docs/contract.md`, sección de reglas de aviso.
- `tests/editor/alerts.browser.spec.mjs`.

## Pasos

1. Reclamar la etapa.
2. **Parada de validación:** decisión n.º 1, formato de datos y migración.
3. Modelo con pruebas, reutilizando la lógica de evaluación.
4. Pantalla y bloque de la ficha.
5. Pruebas, capturas y reporte.

## Aceptación

- [ ] Crear, editar, apagar y borrar una regla, y deshacer.
- [ ] Ninguna condición trae valores fijos.
- [ ] Un plano con `display.alerts` conserva cada aviso y su nivel.
- [ ] Una regla sin símbolos aparece en la barra y en *Ahora*.
- [ ] La ficha lista las reglas que afectan a ese símbolo.
- [ ] Datos desconocidos o sin conexión no disparan alertas falsas.
- [ ] Una recarga no inventa un historial.
- [ ] Ninguna regla envía comandos.

## Registro

### 2026-11-02 — Codex — implementación local
- **Hecho:** una pantalla Reglas en Ajustes, entrada directa desde menú y atajo/creación desde símbolo; lista, interruptores, editor, vista previa y deshacer. Nombre, lecturas, límites sin rellenar, duración, nivel/indicador, insignia, color, resaltado, barra, Ahora y símbolos opcionales.
- **Decisiones:** grupo explícito de lecturas, condición ANY (cualquiera); nunca se asocia por nombres. La fuente elegida registra su entidad y, cuando existe, ID del registro, comprobado al evaluar. Límite defensivo 2000 reglas (también para avisos anteriores), dentro de 3 MiB globales, reemplaza las cuatro de antes. Las reglas sólo evalúan en la app abierta.
- **Migración:** reglas nuevas en `configuration.rules`, opcional. `display.alerts` sigue en su lugar y se lee sin copiarlo; apagar conserva la condición con enabled opcional. Editar y guardar explícitamente un aviso anterior lo convierte una sola vez a regla global y quita la entrada antigua. Alertas automáticas visibles/desactivables mediante disabledBaseRules opcional; sus comportamientos previos se conservan por defecto. Se retiraron sugerencias de humedad/luz/temperatura fijas.
- **Aceptación:** 1 cumplido (crear/editar/apagar/borrar/deshacer en navegador); 2 cumplido (campos vacíos, sin sugerencias fijas nuevas); 3 cumplido (lectura conservada y nivel en pruebas); 4 cumplido (modelo/feed sin símbolos, regla en barra y Ahora); 5 cumplido (bloque lista reglas por símbolo); 6 cumplido (desconexión/unknown/no numérico/cambio de asociación); 7 cumplido (prueba con last_changed antiguo, duración inicia en sesión nueva); 8 cumplido (modelo y editor no tienen camino a enviar servicios; prueba con callService que falla si se usa).
- **Inventario E07:** F-004 barra con contador; F-019/F-020 selección y encuadre conservados para símbolos existentes; F-046 editor único; F-047 resaltado, conteo y reglas base; F-048 avisos viejos visibles independientemente de categoría; F-068 pantalla conserva avisos/actividad/diagnóstico y agrega reglas asociadas; F-121 contrato opcional validado en los tres lugares. No se quita ninguna función.
- **Comprobaciones:** check 267 pruebas; dos recorridos de Reglas de escritorio aprobados. Capturas, Python y CI se documentan en el cierre conjunto.
- **Falta:** auditor independiente, validación y pruebas físicas; sin Home Assistant de la vivienda ni notificaciones/acciones automáticas.
- **Dónde quedó:** `chatgpt/rediseno-lote-2`, commit E07; PR al cierre.

### 2026-11-02 — Codex — cierre del lote 2
- Ocho criterios cotejados; se conserva también el resaltado anterior como fila visible y desactivable. Las reglas sólo indicadoras tienen insignia sin sumarse a alertas y no fuerzan resaltado si se desactiva. Desconectar descarta evidencia temporal antes de reconectar, con regresión específica. Fuentes globales incluidas en la observación del adaptador.
- Corregidos contraste del tema oscuro y desplazamiento propio de la lista durante revisión de capturas. Sin símbolos, el aviso sigue visible sin ofrecer un encuadre inexistente. Campos opcionales cubiertos por los tres validadores.
- E07 en revisión: ocho filas conservadas. Matriz HA en CI, no ejecutada localmente por faltar pytest; sin E2E nuevo ni prueba física.
