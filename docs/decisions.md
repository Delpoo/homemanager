# Decisiones de arquitectura

Estado del producto: **frontend, editor y adaptador implementados y probados con sesiones HA sintéticas; sin validar todavía en Home Assistant real** (29 de octubre de 2026). Estas decisiones orientan el trabajo de los agentes y la revisión del futuro integrador. No afirman que los controles descritos estén implementados.

## D01 — Dos repositorios con finalidades permanentes

`homemanager` contiene software genérico y recursos publicables. `homemanager-instance` mantiene fuentes del plano real, ubicaciones y personalización en privado. No se copia la instancia al frontend público, a sus fixtures o a los assets de release. No se cambia a pública la instancia para facilitar HACS. Cada creación, publicación, acceso o permiso nuevo conserva la aprobación que corresponda al usuario.

## D02 — Tarjeta frontend y popups nativos

HomeManager será una tarjeta personalizada Lovelace con controles y paneles avanzados propios. Browser Mod queda totalmente descartado: no es dependencia, opción, adaptador ni mecanismo transitorio. El nuevo software no llama sus servicios. Esta decisión no elimina, modifica ni migra los popups que ya existen en HA.

La tarjeta utiliza el contexto y la conexión autenticada de Home Assistant. Se prioriza no añadir backend Python. La API de tarjeta permite recibir configuración y contexto HA. [API oficial de tarjeta](https://contributors.home-assistant.io/frontend/custom-ui/card/).

## D03 — RF y C01 permanecen en Home Assistant

Toda lógica RF, códigos, transmisión, normalización de comandos y scripts de C01 siguen en HA. El frontend enlaza acciones lógicas con entidades/scripts. No se trasplanta la implementación RF al navegador. El estado físico de un equipo RF no se deduce únicamente del éxito de una llamada. *Modificada por [D16](#d16--gestor-de-controles-rf-propio): la lógica RF de los equipos dados de alta en el gestor pasa a la integración HomeManager, dentro de HA.*

## D04 — Editor visual obligatorio

El editor propio permitirá elegir un icono y asociarle entidad HA, acciones/scripts, fuente de estado y panel avanzado mediante controles visuales. Los bindings son declarativos y validados; nunca ejecutan JavaScript o plantillas arbitrarias.

En V1 el editor vive en `getConfigElement()` dentro del editor Lovelace, emite `config-changed` y utiliza el guardado explícito del anfitrión. El evento por sí solo no garantiza persistencia fuera de ese contexto. [Contrato oficial de editor](https://contributors.home-assistant.io/frontend/custom-ui/card-editor/).

## D05 — Persistencia nativa autenticada y administración

La V1 requiere dashboard `storage` y administrador para editar y guardar. No utiliza `localStorage` como fuente canónica ni modifica `.storage` directamente. El servidor de HA exige administración para guardar. YAML no soporta este mecanismo de escritura. [Autorización](https://github.com/home-assistant/core/blob/2026.10.4/homeassistant/components/lovelace/websocket.py#L138), [persistencia](https://github.com/home-assistant/core/blob/2026.10.4/homeassistant/components/lovelace/dashboard.py#L136).

Se admite una sesión de edición a la vez. HA guarda el documento de dashboard sin una condición de revisión en la petición consultada: no se promete protección atómica frente a cambios simultáneos. Un futuro requisito de edición delegada o concurrencia estricta obliga a revisar esta decisión antes de introducir un backend.

## D06 — Configuración duradera separada del estado efímero

El documento duradero contiene IDs, habitación, posición, movilidad, presentación, bindings, definición del panel y política de confianza. El estado observado, disponibilidad, timestamps, respuestas de acciones, selección, zoom y popup abierto son datos de ejecución.

Si el contrato serializado incluye un bloque `state`, su estado persistido/exportado será `unknown`, sin valores vivos ni timestamps que aparenten vigencia. La confianza efectiva se calcula en ejecución a partir de la evidencia disponible; guardar configuración no confirma una observación ni valida el comportamiento físico.

## D07 — Contrato espacial (V2 desde el 29 de octubre de 2026)

El catálogo conserva ID estable, `roomId`, tipo, posición normalizada `x/y` respecto al viewBox global, movilidad, presentación, bindings y tratamiento explícito de confianza. El contrato común y sus esquemas son la fuente normativa; cambios requieren un PR coordinado, sin divergencias silenciosas.

**Revisión V2.** V1 incluía en el software público los doce espacios de la primera vivienda, en el esquema, tres validadores, el editor, la tarjeta y la detección geométrica. Configurar otra vivienda exigía modificar código. V2 convierte los espacios en datos de la instancia (`rooms: [{id,label}]`, `roomId` nulo mientras no se conozca), mantiene la convención `room-${roomId}` del SVG y migra V1 en memoria sin escribir. Ver [contrato](contract.md#migración-desde-v1).

Los dispositivos de movilidad `fixed` no se desplazan mediante el arrastre normal. Si se añade reubicación, exige un modo administrativo explícito, validación y guardado deliberado; no se confunde con uso cotidiano.

## D08 — Plano autenticado como dato inline

El editor importará y sanitizará el SVG y lo guardará inline como dato de configuración HA. Esta decisión evita depender de `/local/`, cuyos archivos estáticos no requieren autenticación. [Advertencia oficial sobre `www`](https://www.home-assistant.io/integrations/http/#hosting-files).

La configuración no es secreta frente a todas las demás sesiones autenticadas de HA. Se deberán probar tamaño, carga y restauración antes de aceptar el plano real. No se incorporan credenciales GitHub al frontend; la instancia privada es fuente y respaldo, no una API que consulta la tarjeta.

## D09 — Distribución y versiones

Fuentes en `src/`, compilación en `dist/`, entrada estable `homemanager.js`, versiones mediante tags y releases. La distribución prevista es Dashboard en HACS; no implica que un mismo paso instale una integración Python. No se publica una release funcional hasta completar las pruebas y la aprobación de publicación. Véase [hacs.md](hacs.md).

## D10 — Licencia y seguridad pendientes de completar

El propietario autorizó MIT para el código público el 28 de octubre de 2026. Las dependencias y recursos incorporados deben admitir esa distribución y conservar sus avisos. El plano privado tiene derechos independientes.

Los requisitos de sanitización SVG, validación de bindings, permisos, guardado y ejecución segura corresponden a las implementaciones de frontend y conexión. Esta fundación no los sustituye con documentación o un escáner de expresiones regulares. La revisión del integrador debe comprobarlos con evidencia. Véase [security.md](security.md).

## D11 — Almacenamiento del plano y la configuración

Estado: **aceptada por el propietario el 29 de octubre de 2026 e implementada** en `custom_components/homemanager` ([integration.md](integration.md)). Lovelace `storage` sigue soportado para tarjetas existentes, detrás de la misma interfaz `ConfigurationStore`, y el editor ofrece migrar. Esta decisión sustituye la preferencia de D02/D05 de no añadir backend Python: el backend se limita a almacenamiento, permisos y servir el frontend; la ejecución sigue en la sesión HA del usuario. Evaluación completa en [audit-2026-10-29.md](audit-2026-10-29.md#3-almacenamiento-del-plano).

| Opción | Autenticación | Concurrencia | Rendimiento | Versionado del plano | Veredicto |
| --- | --- | --- | --- | --- | --- |
| SVG inline en la tarjeta Lovelace (actual) | Lectura: todo usuario HA; escritura: admin | Sin CAS; doble lectura | El plano viaja con el dashboard completo en cada carga; tope 4 MiB por mensaje | No | Válido para V1 y una vivienda; no escala a producto |
| `/local` (`www/`) | **Ninguna** | — | Bueno | Manual | Descartado (D08) |
| `image_upload` de HA | Servido sin autenticación; no acepta SVG | — | Bueno | No | Descartado |
| Integración `homemanager` con `Store` propio + WebSocket | Lectura: usuario autenticado; escritura: admin | Revisión atómica en el bucle de eventos de HA | El plano se carga una vez, cacheable por hash, separado del dashboard | Sí (historial y restauración) | **Recomendado** |

La integración compañera (dominio `homemanager`, sin dependencias externas) guardaría en `.storage/homemanager` los hogares, sus espacios, dispositivos, acciones, paneles y un historial acotado de planos, y expondría `homemanager/home/get`, `homemanager/home/save` (con `revision` esperada, `require_admin`) y `homemanager/plan/get|history|restore`. Permitiría además registrar un panel lateral propio (la "aplicación" de HomeManager) y servir el bundle, de modo que HACS instale un único paquete de categoría Integración. La tarjeta pasaría a referenciar `home_id`; la migración importaría la `configuration` de la tarjeta existente y dejaría la tarjeta con una referencia. La categoría HACS pasa a **Integración** con un único paquete (`homemanager.zip`) que incluye el bundle; ver [hacs.md](hacs.md).

## D12 — Reemplazo del plano sin perder configuración

Los dispositivos, bindings, acciones y paneles no dependen del SVG; sólo `position` y la detección de espacio dependen de su geometría. Al importar un plano nuevo el editor informa espacios sin zona y zonas nuevas, exige exportar una copia si cambia el viewBox y ofrece dos migraciones de posiciones: **mismo punto del dibujo** (predeterminada: recortes o ampliaciones del mismo dibujo) o **misma proporción** (reescalado completo). Un dispositivo que quede fuera del nuevo viewBox se lleva al borde y se informa; nunca se elimina.

## D13 — Idiomas

Textos en el código como fuente en español con traducción por clave (`t('…')`, estilo gettext) y un diccionario por idioma (`src/i18n/en.ts`). El idioma sigue al usuario de Home Assistant (`hass.locale.language`). Una prueba falla si una cadena carece de traducción o pierde una variable. Se eligió frente a claves abstractas porque mantiene el código legible y una traducción ausente nunca muestra una clave.

## D14 — Entidades en estado `unknown`

`unknown` significa que Home Assistant no conoce el estado (dispositivos optimistas o asumidos, habituales en RF), no que la entidad rechace comandos: las acciones se permiten. Sólo `unavailable` las bloquea. El estado mostrado sigue las reglas de confianza: nunca *confirmado* sin una fuente medida y verificada.

## D15 — Versiones y publicación

SemVer con una sola versión en `package.json`, replicada en `manifest.json`, el bundle y `CHANGELOG.md` (comprobado por prueba). Las releases las crea sólo el propietario; el workflow `release.yml` verifica el tag, ejecuta todas las pruebas y adjunta `homemanager.zip`. La CI prueba la integración en la versión mínima declarada y en la actual de Home Assistant.

## D16 — Gestor de controles RF propio

Aceptada por el propietario el 29/10/2026 (opción D). Cambia la regla inicial "los scripts y la lógica RF existente permanecen en Home Assistant": la lógica RF sigue dentro de Home Assistant, pero en la integración HomeManager y no en scripts del usuario. Los códigos viven en `.storage/homemanager.rf`, nunca en el plano, en el navegador ni en el repositorio; el validador del plano sigue rechazando claves como `rf_code`. Un paquete ESPHome único por transmisor sustituye las acciones por temporización, los helpers y el script enrutador. Los comandos siguen mostrándose como enviados o estimados, nunca confirmados. Lo existente en la instalación no se modifica ni se retira sin decisión expresa del propietario. Detalle: [rf-manager.md](rf-manager.md).

## D17 — Controles RF libres: partes, roles y diseño

Aceptada por el propietario el 29/10/2026 (plan 0.5, parte B). Un botón ya no tiene una función fija: es nombre, icono y código. Lo que Home Assistant recibe se declara aparte, en **partes** (ventilador o luz) cuyos roles nombran botones, para que cada "apagar" pertenezca a su equipo. El aspecto del control es un **diseño** en una cuadrícula de 4 columnas, validado por el servidor; sin diseño se dibuja uno automático. Un código se confirma con 3 tramas idénticas en una pulsación o con dos pulsaciones separadas por más de 0,3 s. HomeManager no edita YAML de ESPHome: genera el bloque a pegar y enlaza a ESPHome Builder. La biblioteca pasa a la versión 2 con migración automática que conserva las entidades de 0.4. Detalle: [rf-manager.md](rf-manager.md).

## D18 — Controles por cómo se usan

Propuesta el 29/10/2026 a partir de los comentarios del propietario sobre 0.5.0-beta.1; pendiente de su aprobación con la prueba de 0.6.0-beta.1. Los símbolos del plano y los paneles usan un único vocabulario de controles, elegidos por **cómo se operan** (pulsador, ciclo, deslizador, subir / bajar, selector) y no por lo que controlan: no hay "atenuador" ni "velocidad de ventilador", sino un deslizador al que se le pone nombre. Lo que hace cada paso es una acción del plano, así que todo envío pasa por la lista de servicios permitidos y las comprobaciones en vivo del adaptador. Un toque ejecuta un control o abre el panel; mantener pulsado abre siempre el panel (un mismo gesto no puede elegir entre 4 accesos). Hasta 3 controles pueden quedar fijos junto al símbolo. Las opciones por defecto se escriben como controles visibles y editables, nunca como un "si no se elige nada". Un envío se informa como enviado y, con el eco RF, como oído en el aire: nunca como estado físico confirmado. Detalle: [contract.md](contract.md).


## D19 — HomeManager prepara los equipos ESPHome

Propuesta el 29/10/2026; **pendiente de aprobación del propietario**. Cambia una regla de D16 y de [rf-manager.md](rf-manager.md): "HomeManager no edita el YAML de ESPHome". Con ESPHome Builder disponible, HomeManager agrega o actualiza las líneas de su paquete en la configuración de un equipo y lo reinstala por OTA, **sólo tras la confirmación de un administrador** que ve exactamente las líneas que cambian. Usa la misma conexión con ESPHome Builder que la integración ESPHome de HA usa para instalar actualizaciones de firmware. Antes de escribir, guarda una copia del archivo; inserta las líneas como texto sin reformatear y, si la compilación falla, restaura la copia. El archivo sale de la lista de ESPHome Builder, nunca de un dato del usuario; nunca lee `secrets.yaml` y nunca envía el contenido del archivo al navegador. Sin ESPHome Builder se mantiene el flujo de copiar y pegar. Antes de implementar la escritura, una sonda de sólo lectura se prueba en la instalación real. Detalle: [vision.md §8](vision.md#8-esphome-sin-copiar-y-pegar).

## D20 — Panel de control, arquetipos y canal de respuesta

Propuesta el 29/10/2026; **pendiente de aprobación del propietario**. La pantalla principal se separa de la administración. Una barra superior lleva el logo, la barra de actividad, las alertas y un menú para todo lo demás. Los espacios se representan con iconos. Cada dispositivo tiene un **arquetipo** (actuador, equipo, sensor, medidor, mando, infraestructura) que decide su forma en el plano y lo que hace un toque. Todos los arquetipos comparten una gramática: anillo = activo; insignia = alertas; marca de salud = sólo si hay un problema. Toda decisión de presentación sale de funciones puras (`symbolSpec`, `alertsOf`) con pruebas. Detalle: [vision.md](vision.md) y [roadmap.md](roadmap.md).

## D21 — Categorías de dispositivo elegibles

Propuesta el 30/10/2026; **pendiente de aprobación del propietario**. La persona elige una de ocho **categorías**: interruptor, equipo, control remoto, medidor, planta, alerta, presencia y aperturas, e infraestructura. La categoría decide el arquetipo de D20, lo que hace un toque y las secciones de la ficha: un medidor no tiene editor de botones, y una planta y una alerta tienen sus propias reglas de aviso. La app propone la categoría al vincular un dispositivo y la deja escrita en la ficha. Campo opcional `display.category`; `display.archetype` sigue siendo válido. Detalle: [vision.md §12](vision.md#12-categorías).

## D22 — Espacios propios de la app y vista por espacio

Propuesta el 30/10/2026; **pendiente de aprobación del propietario**. Cada espacio tiene una forma propia (`rooms[].shape`), copiada de la zona del SVG al importarlo o dibujada en la app. Un SVG nuevo nunca la pisa, y un SVG sin zonas también sirve. Sobre esas formas, una **vista por espacio** encuadra un espacio al 100 % y navega con flechas que apuntan al centro de cada destino: mantener muestra el nombre, tirar viaja y deslizar empuja el plano. Flechas y deslizar se activan por separado. Detalle: [vision.md §13–§14](vision.md#13-vista-por-espacio).
