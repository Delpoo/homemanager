# CP4 · Reglas de aviso por categoría

Estado: en implementación. Rama `chatgpt/0.9-alert-rules`, creada desde `origin/main` (`f008850`). CP6 está fusionado en #33 y queda fuera de este trabajo. El seguimiento #34 no se incorpora ni se sigue puliendo por indicación del propietario.

## Alcance vigente

El propietario eligió CP4 y reemplazó las restricciones de archivos de CP6. Fuente: `docs/roadmap.md`, etapa 0.9, CP4; `docs/vision.md` §5, §10 y §12; maqueta §6 y §12, abierta en navegador antes de implementar.

- Reglas de aviso para planta, alerta, presencia/aperturas y medidor.
- Campos opcionales `display.alerts` (hasta cuatro reglas `{reading, below?, above?, forMinutes?, level: alert | warning}`) y `display.highlight` (booleano), con tipos y los tres validadores sincronizados.
- Modelo puro, sin DOM; propagación a símbolos, alertas del espacio, barra superior y Ahora.
- Secciones por categoría en el editor actual, con componentes de `src/ui/`, textos traducidos y opciones explícitas.
- Compatibilidad con planos anteriores y conservación de los datos al cambiar de categoría durante la edición.
- Datos inventados, sin Browser Mod, RF, ESPHome, merge, release, cambios de versión ni CHANGELOG.

## Pasos

1. Precisar el contrato y la semántica de umbrales, duración, niveles, datos ausentes y resaltado. Implementar modelo y validación con pruebas antes de construir la interfaz. Informar el resultado intermedio, sin pedir una aprobación adicional.
2. Añadir el editor de avisos con las piezas de §6, según las secciones de §12. Mantener los datos de categorías anteriores durante la edición y las decisiones por defecto visibles.
3. Conectar el resultado del modelo a todas las superficies de alertas y al resaltado de presencia. Un envío continúa sin confirmar estado físico.
4. Verificar compatibilidad y flujos con un registro sintético, escritorio/móvil, claro/oscuro y texto humano. Capturar cada vista modificada a 1440×900 y 390×844 junto a la maqueta; explicar diferencias.
5. Pasar check, Prettier, navegador completo, pytest en las dos versiones de HA de CI y E2E local. Abrir un PR borrador de CP4 y adjuntar la evidencia.

## Criterios de diseño

Los umbrales son estrictos e independientes: valor menor que `below` o mayor que `above`. Con ambos configurados se evalúa cualquiera de los dos límites. Una regla sin límites expresa un estado binario activo, no que cualquier valor numérico sea una alerta. Una lectura desconocida, no disponible o sin asociación verificable nunca genera una alerta numérica. Una duración exige evidencia temporal: no se inventa el historial anterior a la observación. Las reglas permanecen como configuración del plano y las observaciones como estado de ejecución separado.

La categoría alerta ofrece su nivel; presencia/aperturas ofrece Resaltar al detectar y Contar como alerta (apagados hasta elegirlos, conservando los planos anteriores). Planta y medidor ofrecen reglas de lecturas reales del dispositivo, con nombres de persona. Las sugerencias de la maqueta se muestran como opciones explícitas, sin asociar entidades por su nombre ni activar umbrales ocultos en planos antiguos.

La lectura principal es una asociación explícita. Para las lecturas auxiliares se exige pertenencia al mismo dispositivo de HA mediante el registro, nunca por un prefijo de nombre. Los niveles del contrato `alert`/`warning` se traducen al vocabulario interno existente `critical`/`warning`. Se conservan las reglas de salud de 0.7 para los planos sin configuración nueva.

Para las duraciones se implementó un reductor puro de observaciones de condiciones: las actualizaciones numéricas que siguen cumpliendo el umbral no reinician el tiempo; las lecturas desconocidas, la pérdida de asociación o la desconexión no prueban continuidad. Sin observaciones previas, sólo una fecha válida de estado estable de HA puede aportar tiempo anterior. El contexto temporal se pasa explícitamente a los consumidores del modelo, separado del contrato y sin consultar datos privados ni inventar un historial.

## Verificación

Contrato y modelo inicial implementados, todavía sin interfaz:

- `src/model/types.ts`: `AlertRuleConfig`, `ModelDevice.display.alerts/highlight`.
- `src/ha/types.ts` y declaraciones: los mismos campos y constantes.
- JS, Python y JSON Schema: campos opcionales, máximo cuatro reglas, lectura explícita, niveles cerrados, números finitos, duración no negativa y booleano estricto. Se rechazan propiedades extra.
- `tests/fixtures/alert-rules.json` es el conjunto común de casos; JavaScript y JSON Schema lo ejecutan juntos y Python usa el mismo archivo. También se prueban NaN e infinitos fuera de JSON.
- TypeScript pasa; 18 pruebas de validación JS/Schema pasan; 166 pruebas de modelo Python pasan con HA mínimo.
- `src/model/alert-rules.ts`: lectura asociada, condiciones, reductor puro `observeAlertRules`, duración y resaltado. `alertsOf` combina las condiciones configuradas con las reglas anteriores. Los niveles personalizados no duplican la alerta crítica por defecto.
- 17 pruebas del motor (11 nuevas y seis anteriores) pasan: límites estrictos, estados desconocidos, pertenencia al dispositivo, duración estable y observada con valores cambiantes, reinicio por desconexión, cambio de lado, retroceso del reloj, niveles, resaltado independiente y datos conservados entre categorías.

Integración e interfaz implementadas:

- RuntimeFeed mantiene la evidencia de duración y la pasa a símbolos, Ahora y pantalla del dispositivo. Los avisos nuevos, su nivel y su lectura llegan también al historial, la barra y el riel. Una lectura desconocida o desconectada no registra una resolución; un valor válido puede demostrarla después.
- El adaptador observa también lecturas usadas sólo para avisos. El resaltado de presencia no crea anillo de actividad ni confirmación de comandos.
- `src/ui/alert-editor.ts` contiene la composición de §6/§12, sus controles y todos sus estilos; el editor sólo la configura. Planta muestra sugerencias apagadas con sus valores visibles; medidor permite elegir una lectura asociada; alerta ofrece nivel/duración; presencia separa Resaltar al detectar y Contar como alerta, apagados al abrir un plano anterior.
- Las condiciones de secciones ocultas se conservan. Se pueden quitar explícitamente y el máximo de cuatro se comprueba antes de guardar. Editar el dispositivo escribe un paso de deshacer; guardar el plano persiste como antes.
- Traducciones inglesas para las opciones y los mensajes; la lectura numérica de humedad del suelo no usa el nombre binario Fuga.
- `npm ci --ignore-scripts`: sin problemas; `npm run check`: 212 pruebas; formato: pasa. Pytest: 227 pruebas con cada HA de la matriz (2026.2.3 y 2026.10.4), con adaptación de bucle de Windows sólo local.
- E2E en HA descartable: pasa el recorrido completo y el caso CP4 de guardado/recarga, nivel de aviso y resaltado independiente. Cero errores de HomeManager; seis errores de la interfaz mínima de HA, ajenos al bundle, ignorados por el filtro existente.
- La primera pasada completa de navegador dio 298 aprobadas, tres omitidas por dispositivo y un fallo en una prueba nueva: intentaba tocar en móvil un símbolo que estaba agrupado. El recorrido ya abre primero el grupo; su comprobación móvil pasa. Las comprobaciones existentes, RF incluidas, no cambiaron.

Actualización de base: antes de abrir el PR se detectaron #35 y #36 nuevos en `main` (`8afcbb3`). Se integran conservando su implementación; no se continúa el seguimiento de CP6. Pendiente: verificar todo sobre esa base, revisar y registrar las capturas definitivas y abrir el PR borrador. Este archivo sigue siendo el plan e informe único.
