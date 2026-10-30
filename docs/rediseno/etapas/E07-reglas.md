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
