# Contrato compartido V2

Este contrato coordina arquitectura SVG, frontend e integración de HomeManager. Define estructuras y criterios de aceptación; todavía no implementa la tarjeta ni conecta dispositivos reales. Los esquemas son JSON Schema 2020-12 y sus referencias son archivos locales estables dentro de `schemas/`.

## Catálogo y coordenadas

`schemas/catalog.schema.json` define el catálogo V2: raíz con `schemaVersion: 2` y `devices: []`. Cada dispositivo requiere `id`, `roomId`, `kind`, `position`, `mobility`, `display`, `bindings` y `state`, sin campos adicionales. Los identificadores son kebab-case únicos y permanecen iguales al cambiar de posición, habitación o etiqueta.

**Los espacios son datos de cada instancia, no del software.** La configuración declara `rooms`, una lista ordenada de `{id, label}` (máximo 200). `id` es kebab-case, único e inmutable; `label` es texto libre que se puede renombrar. El `roomId` de cada dispositivo referencia un espacio declarado o es `null` mientras su ubicación no se conozca. Cada zona SVG se identifica como `room-${roomId}`; el editor detecta esas zonas en el plano y las propone como espacios, pero sólo los espacios declarados participan en la navegación y en la detección de habitación al arrastrar. Un espacio sin zona se informa y conserva sus dispositivos.

### Migración desde V1

V1 fijaba doce IDs de la primera instalación real (`living`, `dining`, …, `dbst`, `ac-ledge`). Un documento V1 sigue siendo válido como **entrada**: cada frontera (tarjeta, editor, almacenamiento, adaptador HA) lo migra en memoria con `migrateConfiguration` (`src/ha/migration.mjs`). Los espacios se derivan de los IDs usados por dispositivos y de las zonas `room-*` del SVG que pertenecían al vocabulario V1, en el orden V1; los nombres provienen del antiguo `room_labels` de la tarjeta o se generan a partir del ID. La migración no escribe nada: el documento V2 se persiste sólo con el siguiente guardado explícito. Los esquemas V1 se conservan en `schemas/v1/` y una prueba demuestra que un V1 válido migra a un V2 válido sin perder dispositivos ni bindings.

`position.x` y `position.y` son números finitos entre 0 y 1 respecto al **viewBox global**, incluyendo su origen:

```text
svgX = viewBox.minX + position.x * viewBox.width
svgY = viewBox.minY + position.y * viewBox.height
```

No son coordenadas de habitación ni de pantalla. Cambiar el viewBox exige revisar o migrar explícitamente posiciones con copia previa. Una zona ausente se informa; no se sustituye silenciosamente por otra habitación. Los aliases geométricos solo se aceptan tras verificar la geometría.

`kind` admite `light`, `fan`, `curtain`, `ac`, `sensor`, `switch`, `robot`, `purifier`, `plant`, `infra`, `energy`, `media`, `lock`, `camera`, `appliance` y `other`. Sólo determina la capa y el glifo de respaldo; nunca permisos ni acciones. `mobility` admite `fixed`, `editable` y `portable`. Un dispositivo `fixed` no se desplaza con el arrastre habitual: una corrección de su ubicación requiere una acción separada y explícita de reubicación. Esa acción conserva su ID y sus asociaciones. Mover un icono no cambia áreas HA, rutas RF, scripts ni automatizaciones.

`display` contiene `label` e `icon`, y desde 0.6 admite `size` y `pinned` (abajo). `bindings` contiene `entityId`, `primaryAction` y `advancedPopupId`, cada uno string o null, más los campos opcionales de abajo. `primaryAction` es una clave lógica, no un objeto de servicio. `advancedPopupId` identifica un panel **nativo de HomeManager**. No contiene un ID Browser Mod, una ruta de dashboard externo ni código ejecutable.

Desde 0.5, `bindings` admite dos campos **opcionales**; un plano sin ellos sigue siendo válido y se guarda igual:

- `quickActions` (obsoleto desde 0.6): hasta 4 accesos `{ "id", "label", "actionId" }`. Se sigue aceptando; se lee como pulsadores del panel y el editor lo reemplaza por `controls` al guardar el dispositivo.
- `remoteId`: ID kebab-case de un control del gestor RF ([rf-manager.md](rf-manager.md)) que el panel del dispositivo dibuja. Si falta, se usa el control de la entidad vinculada cuando es una entidad RF de HomeManager. No contiene códigos: la biblioteca RF vive aparte, en `.storage/homemanager.rf`.

Desde 0.6 (D18), los **controles del dispositivo**, también opcionales:

- `bindings.controls`: hasta 8 controles `{ "id", "type", "label", "steps", "entityId"?, "orientation"? }`. El tipo dice **cómo se usa**, nunca qué controla: `button` (1 paso), `cycle` (2 a 4; cada toque envía el siguiente), `updown` (2: subir y bajar), `select` (2 a 8) y `slider` (sin pasos, ajusta el valor de `entityId` o de la entidad del dispositivo; o de 2 a 12 pasos). Cada paso es `{ "actionId", "label"?, "icon"? }`: `actionId` es una clave de `actions`, así que todo envío pasa por las mismas comprobaciones que una acción. Sólo un deslizador sin pasos ajusta un valor en vivo (brillo, velocidad, posición), con el mismo comando derivado del panel nativo; `entityId` es configuración persistida, nunca un dato del usuario en el momento. `orientation` (`vertical`, `horizontal`) es sólo para deslizadores.
- `bindings.tap`: el control (`button` o `cycle`) que ejecuta un toque; `null` abre el panel. Si falta, el toque ejecuta `primaryAction` como antes. El editor mantiene `primaryAction` igual al paso de un `tap` pulsador, para lectores anteriores.
- `display.pinned`: hasta 3 IDs de `controls` que se dibujan junto al símbolo, en ese orden.
- `display.size`: `s`, `m` o `l`; `m` si falta.

El paso actual de un ciclo sale del estado en vivo cuando todos sus pasos dicen en qué estado dejan su destino (encender, apagar, abrir, cerrar); si no, es el último enviado desde ese navegador. No se persiste en el plano: el estado persistido sigue siendo `unknown`.

## Configuración persistente y estado efímero

`schemas/configuration.schema.json` define el documento persistente, separado del catálogo estricto:

| Campo | Contenido |
| --- | --- |
| `schemaVersion` | `2`. V1 se migra en memoria; cambios incompatibles futuros requieren otra migración explícita. |
| `rooms` | Lista ordenada de espacios `{id, label}` de la instancia. |
| `catalog` | Catálogo V2; todo `state` persistido es `unknown/unknown`. |
| `architecture` | `{format: "svg", content: "…"}`; SVG inline sanitizado, máximo 1 MiB UTF-8. |
| `actions` | Mapa de acciones lógicas a llamadas HA permitidas y destinos explícitos. |
| `panels` | Mapa de paneles nativos `device-controls` o `rf-fan`; controles con `id`, `label` y `actionId`. |
| `stateSources` | Mapa por ID de dispositivo con `entityId`, `attribute` y `feedback`. |
| `commandTtlSeconds` | Entero opcional de 1 a 300; valor efectivo predeterminado 30 segundos. |

`stateSources.feedback` admite `measured`, `optimistic` y `transmitter`. Su elección requiere comprobar la integración real. Nombrar una fuente `measured` no convierte una lectura supuesta en medida. La configuración no almacena lecturas, comandos pendientes, credenciales ni estados físicos inferidos.

`schemas/runtime-state.schema.json` define la capa efímera: `states` por ID, con valor, confianza, fecha de observación, fuente y comando pendiente opcional. Se reconstruye desde la sesión HA después de reconectar. No se guarda en Git, Lovelace, exportaciones de configuración ni archivos del build. Pan/zoom momentáneo, suscripciones y borradores también permanecen fuera del documento persistente.

El catálogo mantiene `state` para compatibilidad de intercambio, pero la configuración duradera obliga a `{"value":"unknown","confidence":"unknown"}`. El runtime se superpone por ID sin reescribir el catálogo. La aplicación no importa estados anteriores como verdad al abrir un archivo.

## Editor visual autenticado

El editor propio permite seleccionar un icono, elegir una entidad accesible de HA, elegir o configurar una acción lógica/script permitido, declarar una fuente de estado y seleccionar un panel nativo. Debe mostrar referencias inexistentes y permitir conservarlas como pendientes sin ejecutarlas. Agregar o editar un binding no dispara acciones físicas.

La persistencia predeterminada utiliza el dashboard Lovelace en modo `storage` y la sesión HA existente. Guardar exige autorización administradora comprobada por HA; el frontend refleja esa autorización y conserva su borrador si HA rechaza la operación. Un dashboard YAML se trata como solo lectura para este editor. `localStorage` no satisface el guardado autenticado compartido y no se usa como sustituto silencioso.

La vía de menor alcance es el editor de tarjeta Lovelace con `config-changed` y guardado explícito del dashboard. Una escritura directa de configuración debe leer el dashboard actual, identificar una única tarjeta, detectar cambios observados y verificar la lectura posterior. La API Lovelace guarda el documento completo y no ofrece una revisión CAS para este flujo: una doble lectura reduce conflictos detectables, pero no garantiza ausencia de carreras entre clientes. Mientras se use esa API, admitir un único editor activo, informar cambios remotos, conservar borradores y no sobrescribir ni reintentar automáticamente ante conflicto. Si se exige concurrencia transaccional o escritura delegada a no administradores, se revisará la arquitectura antes de añadir un backend.

Solo anunciar «guardado en Home Assistant» tras la confirmación y lectura posterior. Un error de sesión, validación, escritura o desconexión mantiene la edición pendiente. Importar una configuración muestra un resumen de cambios antes de aplicar y nunca ejecuta las acciones importadas.

## Acciones y paneles nativos

Cada acción tiene `domain`, `service`, `target` y `data` opcional. El destino es exclusivamente `target.entity_id`, individual o una lista explícita de hasta 20 entidades. No se admiten destinos globales, `all`, áreas, dispositivos completos ni destinos introducidos dentro de `data`. La lista de dominios y servicios está acotada en el esquema: `light`, `fan`, `cover`, `climate`, `switch`, `button` y `script`; `script` admite únicamente `turn_on`.

Los datos son JSON acotado, nunca JavaScript, plantillas ejecutables, código RF/IR, MQTT, comandos ESPHome o código cargado desde una URL. El consumidor valida datos según la firma real de la acción o script, con profundidad máxima 10 y hasta 8192 bytes UTF-8 serializados por `data`. Rechaza claves inseguras, datos no finitos y cadenas que pretendan introducir código/plantillas en campos no destinados a texto literal. Ninguna cadena se evalúa ni se interpreta como código. El permiso real para ejecutar la acción lo decide HA mediante la sesión actual; la allowlist frontend es una defensa adicional y no reemplaza la autorización de HA.

Los controles de `panels` referencian únicamente IDs de acciones existentes. Un panel `rf-fan` referencia exclusivamente acciones `script.turn_on` con destinos `script.*` explícitos, existentes y con firma verificada. Los valores de velocidad, dirección, temporización o iluminación se expresan mediante esos scripts y parámetros declarados; no mediante códigos de radio en el navegador. C01 y toda la lógica RF centralizada siguen en HA.

Todos los paneles, incluido RF fan, se dibujan localmente en el frontend de HomeManager y se cierran en ese navegador. Browser Mod queda totalmente descartado como dependencia, evento, adaptador, fallback o compatibilidad transitoria. Esta decisión no autoriza borrar o modificar los popups existentes en el HA del usuario.

## Confianza y ciclo del comando

| `confidence` | Evidencia mínima y límite |
| --- | --- |
| `confirmed` | Lectura válida de una fuente independiente verificada como `measured`, con `assumed_state` distinto de true. Tras un comando, debe ser posterior a `issuedAt` y distinta de `baselineLastUpdated`. No demuestra causalidad. |
| `estimated` | Lectura válida de una fuente optimista o sin confirmación independiente verificada. |
| `sent` | HA aceptó la solicitud de servicio. No acredita emisión RF, recepción ni efecto físico. |
| `unknown` | Falta de fuente válida, desconexión, entidad ausente/unknown/unavailable o acuse expirado sin feedback posterior. |
| `error` | Falló la llamada o el procesamiento; no describe por sí mismo el estado físico del equipo. |

Al iniciar un comando se captura la fecha de la última lectura como baseline. `expiresAt` se calcula con el TTL efectivo, por defecto 30 segundos y como máximo 300. Ningún acuse `sent/error` se conserva indefinidamente como estado físico. En un equipo sin feedback, al expirar se muestra `unknown`; una lectura antigua no confirma el resultado. Una fuente `transmitter` puede acreditar actividad del transmisor, pero nunca confirmar el ventilador receptor. No se infiere un toggle RF ni estado de luz por el botón pulsado.

## Validación semántica obligatoria

Validar contra JSON Schema es necesario y no suficiente. Antes de persistir, importar o ejecutar, el consumidor también debe comprobar:

1. Unicidad de IDs de dispositivos y controles; rechazo de claves `__proto__`, `prototype` y `constructor` en cualquier estructura, además de números no finitos y límites de bytes/profundidad.
2. Existencia de cada `primaryAction`, `advancedPopupId`, `quickActions[].actionId` y `controls[].steps[].actionId`; existencia de cada `actionId`; claves `stateSources` presentes en el catálogo. Las referencias pendientes quedan claramente deshabilitadas.
3. Formato/existencia de entidades, coherencia entre dominio de acción y destinos, rechazo de `.all` y validez de servicio/capacidad/datos según HA. Ninguna selección de UI amplía permisos de la sesión.
4. Paneles RF exclusivamente sobre scripts HA verificados; no copiar ni interpretar capturas RF en el frontend.
5. SVG XML válido, un solo elemento raíz SVG, viewBox finito de tamaño positivo, IDs únicos, zonas `room-${roomId}` de los espacios declarados (las ausentes se informan) y sanitización tanto al importar como antes de renderizar. Eliminar/rechazar scripts, eventos `on*`, `foreignObject`, HTML incrustado, DTD/entidades, animación ejecutable y referencias externas. Solo referencias internas `#id` resueltas; no ejecutar CSS arbitrario ni conservar URLs externas o `data:`. Mantener un perfil permitido explícito de elementos, atributos y estilos.
6. Runtime con IDs conocidos, timestamps válidos, baseline y TTL coherentes y feedback suficientemente reciente. Nunca degradar un error o conflicto de guardado a una copia local anunciada como compartida.
7. Estado persistido siempre `unknown/unknown`; ausencia de tokens, credenciales, URLs internas, plano real o datos de vivienda en el repositorio público, artefactos CI y `dist/`.

El documento serializado no supera 3 MiB: el WebSocket de HA admite 4 MiB por mensaje y un guardado Lovelace envía el dashboard completo; el almacén rechaza antes de enviar un dashboard que no cabría. El esquema V2 conserva la forma acordada, pero no garantiza por sí solo seguridad, autorización ni resultados físicos. Las pruebas con HA y hardware son una fase separada del integrador 4; ninguna base de repositorio constituye una versión funcional ya verificada.

## Fuentes técnicas

- [Objeto hass y llamadas de servicio](https://contributors.home-assistant.io/frontend/reference/hass-object/).
- [Tarjetas personalizadas](https://contributors.home-assistant.io/frontend/custom-ui/card/).
- [API WebSocket autenticada](https://contributors.home-assistant.io/core/internals/websocket-api/).
- [Implementación Lovelace de Home Assistant Core](https://github.com/home-assistant/core/tree/dev/homeassistant/components/lovelace).
- [Recursos frontend y archivos de /local](https://contributors.home-assistant.io/frontend/custom-ui/resources/).

Las rutas de API concretas y sus permisos deben comprobarse contra la versión HA instalada antes de integrar. Los archivos bajo `/local` no son el lugar para un plano privado o configuración sensible: el almacenamiento autenticado debe conservar también la arquitectura de la instancia.
