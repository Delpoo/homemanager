# HomeManager · diseño del sistema

Propuesta del 29/10/2026, **pendiente de aprobación del propietario**. Describe cómo debería ser HomeManager completo, para que cada versión implemente una parte de un todo coherente en lugar de resolver casos sueltos. El plan de entrega está en [roadmap.md](roadmap.md). La maqueta visual está en [vision-mockup.html](vision-mockup.html); abrila en el navegador.

Este documento es genérico: no contiene datos de ninguna vivienda. Los ejemplos usan nombres inventados.

## 1. Por qué hoy se siente pesado

Una revisión con capturas de 0.6.0-beta.1 (escritorio 1440 px y móvil 390 px, un catálogo real de 20 dispositivos en un Home Assistant de prueba) muestra que el problema no son las funciones que faltan. Las que hay no forman un sistema.

| Qué se ve | Por qué pasa | Qué cambia en este diseño |
|---|---|---|
| Todos los símbolos son iguales: círculo, icono y un punto de estado. | Un único marcador para luces, sensores, medidores y mandos. | Seis **arquetipos** con forma y comportamiento propios (§4). |
| Un sensor de fuga mojado se ve amarillo, "Encendido", igual que una luz prendida. | El estado se traduce con el vocabulario de un interruptor. No hay concepto de alerta. | **Alertas** por clase de dispositivo, en rojo, con contador (§5). |
| Un termómetro muestra un termómetro, no la temperatura. | El símbolo siempre es un icono. | Los **medidores** muestran su valor (§4). |
| Vincular un medidor de energía obliga a elegir un canal entre todas las entidades de la casa. | El vínculo es una entidad. El selector es una lista plana de todas las entidades. | Se vincula un **dispositivo de HA**. Su pantalla muestra todas sus lecturas (§6). |
| La pantalla diaria muestra *Almacenamiento*, *Nuevo hogar* y el selector de hogar. En el móvil ocupan 300 px. | El uso diario y la administración comparten pantalla. | **Panel de control** para el día a día. La administración va a un menú (§3). |
| Los cuartos son pastillas de texto. Al elegir uno, se resalta un rectángulo que se mete en otros cuartos. | El resaltado usa el rectángulo envolvente de la zona. | Los cuartos son **iconos**. Al elegir uno, se oscurece el resto y se dibuja su contorno real (§3). |
| Los botones de capas (⏻ ◌ ⚙ ϟ) no se entienden. | Son caracteres Unicode sin texto. | Capas con icono y nombre, en una barra discreta (§3). |
| Pulsar algo da, como mucho, una nota de 4 s junto al símbolo. | No hay un canal de respuesta. | **Barra de actividad** arriba: enviado, en el aire, confirmado, error (§5). |
| La ficha de edición tapa el símbolo que se edita. Los cambios no se ven hasta guardar. | Es una hoja flotante con un modelo aparte. | **Inspector acoplado con vista previa en vivo** (§7). |
| Agregar el paquete a un ESPHome obliga a copiar y pegar YAML. | HomeManager nunca escribe la configuración de ESPHome (D16). | **Instalador asistido** con vista previa, copia de seguridad y vuelta atrás (§8). |
| Los colores son el azul de HA sobre un plano verde salvia. | No hay identidad visual propia. | **Lenguaje visual** derivado del plano, con logo (§9). |

La causa de fondo es la misma en todas las filas: cada versión resolvió un caso concreto (un ventilador RF, un panel, una ficha) sobre un único marcador y un único vínculo. El código lo refleja: `home-manager-card.ts` tiene 1700 líneas y cada nuevo tipo de dispositivo agrega ramas dentro del mismo dibujo.

## 2. Principios

1. **El día a día primero.** La pantalla principal sirve para mirar y tocar. Configurar está a un menú de distancia, nunca en medio.
2. **La forma dice qué es.** Antes de leer, se distingue un actuador, un medidor, un sensor y un mando.
3. **Lo importante sube solo.** Una alerta se ve desde cualquier cuarto, en el símbolo, en el cuarto y en la barra superior.
4. **Todo toque tiene respuesta.** Siempre se ve qué pasó: *enviado*, *en el aire*, *confirmado* o *error*. Enviado nunca se muestra como confirmado: la regla de D14 y D18 se mantiene.
5. **Editar es ver.** Cada cambio se ve en el plano mientras se edita. Nada queda oculto hasta guardar.
6. **Genérico por diseño.** Arquetipos, capacidades y paquetes; nunca una rama de código para un modelo de dispositivo.
7. **Sin copiar y pegar.** Lo que HomeManager puede hacer por el usuario, lo hace, con confirmación y vuelta atrás.

## 3. El panel de control

La pantalla principal se parece a una pared de control: un plano grande, con lo que importa alrededor.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ⌂ HomeManager · Casa   │ ✓ Enviado · Ventilador · Velocidad 3 · en el aire │ ⚠ 1 │ 18:42 │ ⋮ │
├────┬───────────────────────────────────────────────────────────┬─────────────┤
│ ⌂  │                                                           │ AHORA       │
│ 🛋 •│                                                           │ Clima       │
│ 🍳 1│                    plano                                  │  🛋 23,4° 52%│
│ 💻 │                                                           │  🛏 22,1° 58%│
│ 🛏 │                                                           │ Activos (3) │
│ 🚿 │                                                           │  Luz · ⏻    │
│ 🛁 │                                                  [+][−]   │ Energía     │
│ 🌿 │  [⏻ Controles][◉ Sensores][ϟ Energía][⚙ Infra]            │  1,79 kW    │
└────┴───────────────────────────────────────────────────────────┴─────────────┘
```

**Barra superior** (56 px; 48 px en el móvil):
- logo y nombre del hogar;
- **barra de actividad** (§5), que ocupa el espacio central;
- **píldora de alertas** (oculta cuando no hay ninguna): al tocarla, la lista de alertas; al tocar una alerta, el plano encuadra el dispositivo;
- reloj;
- menú **⋮**, con todo lo que no es uso diario: *Editar plano*, *Controles RF*, *Equipos ESPHome*, *Ajustes*, *Hogares*, *Almacenamiento* y *Ayuda*. Sólo un administrador ve lo que modifica algo.

**Riel de espacios** (izquierda; abajo en el móvil):
- Los espacios son **iconos**. El nombre aparece en la descripción emergente, en `aria-label` y en el encabezado de la columna *Ahora*.
- Cada icono puede llevar un número rojo (alertas del espacio) o un punto cálido (algo encendido).
- El primero es la casa entera.
- El contrato gana `rooms[].icon` (opcional). El editor sugiere uno según el nombre: living → sofá, cocina → olla, dormitorio → cama, baño → ducha, oficina → escritorio, balcón → planta.

**Elegir un espacio:**
- encuadra su zona;
- oscurece el resto del plano y atenúa sus símbolos (no los oculta);
- dibuja el **contorno real** de la zona, no su rectángulo envolvente.

El contorno sale de las formas de la zona `room-*`, clonadas en la capa de resaltado. Un espacio en L se ve en L.

**Plano:**
- Ocupa todo el centro.
- Arriba a la derecha, +/− en pequeño.
- Abajo a la izquierda, las **capas**: un grupo de botones con icono **y nombre** (*Controles*, *Sensores*, *Energía*, *Infraestructura*). Infraestructura está apagada por defecto.
- Los grupos de símbolos superpuestos ("3") se mantienen, con el color neutro del lenguaje visual.

**Columna *Ahora*** (derecha, desde 1100 px; en tableta un cajón; en el móvil una hoja que se desliza desde abajo). Sólo muestra lo que existe en la casa:
- **Clima**: temperatura y humedad por espacio, de los medidores;
- **Activos**: actuadores encendidos, cada uno con su control rápido para apagarlo;
- **Energía**: potencia total ahora;
- **Alertas**.

Si hay un espacio elegido, la columna se filtra a ese espacio.

**Modo pared** (pantalla completa, para una tableta fija):
- tema oscuro opcional;
- objetivos táctiles más grandes;
- vuelta a la casa entera tras 60 s sin uso.

## 4. Arquetipos de símbolo

El **tipo** de dispositivo (`kind`, ya existe) dice qué es. El **arquetipo** dice cómo se ve y qué hace un toque. Cada `kind` tiene un arquetipo por defecto, y la ficha lo puede cambiar (`display.archetype`, opcional).

| Arquetipo | `kind` por defecto | Cuerpo en el plano | Indicador | Toque | Mantener pulsado |
|---|---|---|---|---|---|
| **Actuador** | light, switch, fan, curtain, lock | círculo con icono | **anillo** cálido si está activo; un arco si tiene nivel (brillo, posición) | ejecuta su control de toque (D18) | panel |
| **Equipo** | ac, purifier, robot, appliance, media | círculo con icono y una etiqueta corta debajo (*22°*, *Auto*, *Limpiando*) | anillo si está activo | abre su pantalla (configurable) | panel |
| **Sensor** | sensor binario: puerta, ventana, fuga, movimiento, humo | icono **que cambia con el estado** (puerta abierta / cerrada) | **rojo** si es una alerta | abre su pantalla | — |
| **Medidor** | sensor con valor: temperatura, humedad, energía, planta, calidad del aire | **píldora con el valor** (*23,4°*, *61 %*, *1,2 kW*); con dos valores, *23,4° · 61 %* | rojo o ámbar si cruza un umbral | abre su pantalla | — |
| **Mando** | entidad RF de HomeManager, un mando IR | círculo con icono y una marca de botonera | — | abre el mando | panel |
| **Infraestructura** | infra (hub, router, puente RF) | punto pequeño neutro | sólo salud | abre su pantalla | — |

**Una gramática común a todos los arquetipos.** Cada señal tiene un único lugar y un único significado:

| Lugar | Significado | Cuándo se ve |
|---|---|---|
| Cuerpo (icono o valor) | qué es y cuánto mide | siempre |
| Anillo | activo, o nivel | sólo actuadores y equipos, sólo si están activos |
| Insignia arriba a la derecha | **número de alertas**: rojo si son críticas, ámbar si son avisos | sólo si hay alguna |
| Marca abajo a la derecha | salud: gris tachado = *no disponible*; contorno discontinuo = *estimado, sin confirmar* | **sólo si hay un problema** |

El punto de estado de hoy (un LED en cada símbolo) desaparece cuando todo está bien. Así el plano queda limpio, y una marca significa siempre que algo merece atención. En un actuador, el anillo reemplaza al LED como indicador de actividad.

**Qué muestra el cuerpo** (`display.show`, opcional): `icon`, `value` o `both`. Por defecto, `value` en los medidores e `icon` en los demás.

**Tamaños:** `s`, `m` y `l` (ya existen). La píldora de un medidor crece con su texto, hasta 9 caracteres.

**Implementación.** Toda esta decisión vive en una función pura:

```
symbolSpec(device, hass, now) → { archetype, body: {icon | value}, ring, badge, health, tap, hold, label }
```

El marcador sólo dibuja lo que devuelve; ya no decide nada por su cuenta. Las pruebas unitarias cubren cada arquetipo y cada estado.

## 5. Respuesta y alertas

### Barra de actividad

Es un canal único que cuenta, en una línea discreta arriba, lo último que pasó:

| Evento | Texto (ejemplo) | Color |
|---|---|---|
| Comando enviado | ✓ Enviado · Ventilador · Velocidad 3 | neutro |
| Eco RF oído (ya existe) | … · en el aire | neutro |
| Estado confirmado por una fuente independiente | … · confirmado | verde |
| Error del servicio, del transmisor o de la validación | ✕ No se pudo enviar · Athom no responde | rojo |
| Alerta nueva / resuelta | ⚠ Fuga detectada · Cocina / ✓ Fuga resuelta | rojo / verde |
| Guardado del plano | ✓ Plano guardado | neutro |

- Cada mensaje se ve 6 s y después queda como "último: …" en gris.
- Al tocar la barra se abre el **historial** (los últimos 50).
- Los mensajes de un mismo comando se **actualizan en el lugar**: enviado → en el aire → confirmado, en la misma línea.
- Una línea que nunca pasa de *enviado* indica dónde buscar el problema.

**Implementación:**
- Un almacén `ActivityLog`, único por aplicación, que alimentan:
  - el resultado de `runStep`;
  - el ciclo de vida de comandos del adaptador (TTL);
  - `onAir`;
  - los cambios de estado de las entidades vigiladas;
  - el motor de alertas.
- La nota junto al símbolo (0.6) se mantiene, más corta, porque está donde se miró.
- Fase posterior: un búfer en la integración (`homemanager/activity/subscribe`) para que todas las pantallas vean los envíos RF y sus ecos, aunque los haya hecho otra pantalla.

### Alertas

Las alertas salen de reglas por **clase de dispositivo**, no por modelo:

| Regla | Nivel | Por defecto |
|---|---|---|
| `moisture`, `smoke`, `gas`, `carbon_monoxide`, `safety`, `problem` en `on` | crítica | activa |
| `door` o `window` abierta más de N minutos | aviso | inactiva; se activa con N |
| batería por debajo del 15 % | aviso | activa |
| entidad no disponible más de 10 min | aviso | activa |
| un medidor fuera de un rango configurado | aviso o crítica | inactiva |

- El motor es una función pura `alertsOf(device, hass, now)`.
- La ficha tiene una sección *Alertas* con estas reglas visibles y editables; nunca hay un "si no elegís nada…".
- Una alerta crítica se ve en la insignia del símbolo, en el icono del espacio, en la píldora de la barra superior y en la columna *Ahora*.
- Las notificaciones al móvil quedan para una fase posterior, mediante una automatización de HA que HomeManager genera.

## 6. Dispositivos de Home Assistant completos

**Vínculo.** El vínculo principal pasa a ser un **dispositivo del registro de HA** (`bindings.deviceId`, opcional). `entityId` queda como **entidad principal** de ese dispositivo: la que da el valor del cuerpo y el estado del anillo. Un vínculo de 0.6 sin `deviceId` sigue funcionando igual.

**Selector en dos pasos:**
1. **Dispositivo:**
   - Se busca por nombre, área, fabricante o modelo.
   - Cada resultado muestra el icono de la integración y cuántas entidades tiene.
   - Con el campo vacío, sugiere los dispositivos del espacio y los que todavía no están en el plano.
2. **Entidad principal:**
   - Lista sólo las entidades de ese dispositivo, agrupadas por clase.
   - Viene preseleccionada según el arquetipo: el medidor de energía, la potencia total; el sensor de clima, la temperatura.
   - Un enlace *Buscar cualquier entidad* mantiene la búsqueda actual para casos especiales.

El navegador ya tiene esta información sin pedir nada nuevo: `hass.devices`, `hass.entities[*].device_id` y `hass.areas`.

**Pantalla del dispositivo.** Es la que se abre al tocar un sensor, un medidor, un equipo o infraestructura. Muestra:
- encabezado: icono, nombre, espacio y salud;
- **valor principal grande**;
- **lecturas**: todas las entidades del dispositivo, agrupadas por clase. Un medidor de varios canales se ve como una tabla: canal, potencia ahora, energía de hoy. Las entidades de diagnóstico van plegadas;
- controles (D18), si los tiene;
- alertas activas;
- un enlace **Abrir en Home Assistant** a la página del dispositivo, sólo para administradores.

Por ahora el plano no resume más que el cuerpo del símbolo. Una vista resumida en el plano 2D queda para después.

## 7. Editar es ver

**Inspector acoplado:**
- En escritorio, el modo edición acopla un **inspector** de 360 px a la derecha, en lugar de la hoja flotante.
- El plano se achica y la cámara **desplaza el símbolo elegido** al centro del área visible.
- En el móvil, el inspector es una hoja de hasta el 55 % de la altura, y la cámara lleva el símbolo a la parte visible de arriba.

**Vista previa en vivo:**
- Cada cambio del inspector escribe en el borrador del plano (`draft`) **en el momento**; el símbolo se redibuja con cada tecla.
- Agregar un control fijado, cambiar el tamaño o el icono se ve al instante, en el plano y en una miniatura arriba del inspector.
- El inspector no tiene un modelo aparte: es el plano.

**Botones:**

| Botón | Qué hace |
|---|---|
| ✓ | Listo: cierra el inspector y conserva los cambios en el borrador. |
| ✕ | Devuelve ese dispositivo a como estaba al abrir el inspector. |
| Deshacer / rehacer | Cubren cada edición del inspector. |
| Guardar (barra de edición) | Persiste el plano, como hoy. |

**Secciones según el arquetipo**, siempre en este orden:
1. **Básico**: nombre, icono, espacio, arquetipo.
2. **Vínculo**: dispositivo de HA y entidad principal.
3. **En el plano**: tamaño, qué muestra, controles fijados.
4. **Toque**: lo que hace tocar el símbolo.
5. **Controles** (D18): sólo actuadores, equipos y mandos.
6. **Alertas**: sólo sensores y medidores.
7. **Avanzado**.

Un medidor no ve la sección *Controles*.

**Espacios:**
- *Ajustes del plano* gana **Fusionar en…**: mueve los dispositivos de un espacio a otro y quita el primero.
- Al reemplazar el plano, si un espacio queda sin zona, se ofrece fusionarlo con el espacio donde ahora caen sus dispositivos.

## 8. ESPHome sin copiar y pegar

Hoy *Equipos RF* muestra el bloque YAML para copiar, porque D16 dice que HomeManager no edita la configuración de ESPHome. La propuesta **D19** cambia esa regla: HomeManager **la edita por el usuario**, con su confirmación, una copia de seguridad y vuelta atrás. ESPHome Builder sigue siendo el dueño del archivo, y todo lo que HomeManager hace se puede deshacer desde ESPHome Builder.

**Cómo, con lo que Home Assistant ya usa:**
- La integración ESPHome de HA ya habla con ESPHome Builder (`homeassistant.components.esphome.dashboard.async_get_dashboard`). Así instala las actualizaciones de firmware: compila (`compile`) y sube por OTA (`upload`).
- Con esa misma conexión se obtiene, para cada equipo, el nombre de su archivo y su configuración ya interpretada (`json-config`).
- Las configuraciones viven en la carpeta `esphome/` de la configuración de HA.
- HomeManager reutiliza esa conexión y no implementa el protocolo de ESPHome Builder. Que siga funcionando cuando ese protocolo cambie (como en 2026.6) es responsabilidad de HA.

**Flujo** (en *Equipos ESPHome*, que reemplaza a *Equipos RF*):
1. **Detectar.** Para cada equipo ESPHome, la configuración interpretada dice:
   - qué componentes tiene (por ejemplo `remote_transmitter` y `remote_receiver`) y sus `id`;
   - si ya tiene el paquete de HomeManager, y en qué versión.
2. **Proponer.** El botón **Preparar para HomeManager** muestra exactamente qué líneas se agregan (3 a 6), en qué archivo, y que se hará una copia de seguridad. Los `id` vienen de la detección, así que no hay nada que completar.
3. **Aplicar.** Al confirmar:
   - se guarda una copia del archivo;
   - se insertan las líneas como texto, sin reformatear el YAML, conservando sus comentarios y `!secret`;
   - se compila y se instala por OTA, con el avance en pantalla (*Compilando…*, *Subiendo 45 %*).
4. **Verificar.** El equipo vuelve a conectarse y HA expone su acción `homemanager_rf_send`. Entonces dice **✓ Listo para RF**.
5. **Si falla:**
   - Si falla la compilación, se restaura el archivo automáticamente. El equipo sigue con su firmware anterior y se muestra la línea del error.
   - Si falla la subida, el archivo queda con el paquete y se ofrece reintentar o restaurarlo.
6. **Actualizar.** Cuando cambia la versión de HomeManager, un solo botón (*Actualizar paquete en 2 equipos*) cambia la línea `@vX.Y.Z` y reinstala.

**Paquetes genéricos.** Un registro de paquetes de HomeManager define, para cada uno:
- su URL fijada a la versión instalada;
- la regla de detección (componentes requeridos);
- las sustituciones que se completan solas desde la detección;
- la versión mínima de ESPHome.

Hoy sólo existe `rf`. Mañana puede haber `ir`, presencia u otros, sin código nuevo en la interfaz. Por eso el flujo sirve para cualquier equipo futuro, no sólo para un Athom.

**Seguridad:**
- Sólo administradores.
- El archivo sale de la lista de ESPHome Builder, nunca de un texto del usuario. Debe ser un `.yaml` simple dentro de `esphome/`, y nunca `secrets.yaml`.
- Al navegador sólo llegan las líneas que cambian, nunca el archivo.
- Una instalación a la vez.
- Cada paso queda en la barra de actividad.

**Sin ESPHome Builder** (instalaciones Docker o Core): el flujo de hoy, copiar y pegar, sigue como alternativa.

## 9. Lenguaje visual

Los colores salen del plano: salvia, marfil y grafito. El color de estado se reserva para el estado; la marca no lo usa.

| Token | Claro | Oscuro (modo pared) | Uso |
|---|---|---|---|
| `--hm-ink` | #1F2A24 | #E8ECE6 | texto |
| `--hm-muted` | #5F6E66 | #9AA59F | texto secundario |
| `--hm-bg` | #F4F5F0 | #121714 | fondo de la aplicación |
| `--hm-surface` | #FFFFFF | #1B221E | barras, tarjetas, símbolos |
| `--hm-line` | #DDE2D8 | #2C3530 | bordes |
| `--hm-brand` | #4F7A5A | #8FB38B | logo, selección, foco |
| `--hm-active` | #E8A33D | #F0B455 | anillo de un actuador activo |
| `--hm-cool` | #4F8FBF | #6FA9D6 | equipo de frío activo |
| `--hm-ok` | #3F8F5F | #5DB07F | confirmado, resuelto |
| `--hm-warn` | #D98B1F | #E9A23B | aviso |
| `--hm-alert` | #D0453A | #E5645A | alerta crítica, error |
| `--hm-unknown` | #9AA59F | #6E7A73 | sin dato |

- **Tipografía:** la de HA. Los valores usan cifras tabulares (`font-variant-numeric: tabular-nums`). Tres tamaños: 12, 14 y 18 px; los valores grandes de la pantalla del dispositivo, 32 px.
- **Iconos:** sólo MDI (`ha-icon`). Ningún carácter Unicode como icono.
- **Logo:** una casa de trazo simple cuyo interior es un plano en planta. Monocromo `--hm-brand`; funciona a 20 px.
- **Movimiento:** 150 a 250 ms, una sola curva, y nada si `prefers-reduced-motion`.
- **Superficies:** un radio de 12 px y una sombra sutil. Nada de bordes negros de 2 px en los botones.
- **Tema de HA:** HomeManager respeta claro/oscuro de HA y usa sus tokens propios; el azul primario de HA no aparece dentro de HomeManager.

## 10. Arquitectura del código

Para que no vuelva a crecer por casos, el frontend se ordena en capas con una dirección única:

```
src/model/     funciones puras, sin DOM: archetype, symbolSpec, alertsOf, deviceScreen, activity
src/shell/     barra superior, riel de espacios, columna Ahora, menú, modo pared
src/card/      plano, cámara, marcadores (sólo dibujan un SymbolSpec), capas
src/editor/    inspector y ajustes del plano, sobre el mismo draft
src/panels/    pantalla del dispositivo y paneles de controles (D18)
src/ui/        piezas reutilizables y tokens del tema
```

Reglas:
- `model/` no importa nada de las otras carpetas, y todo lo demás puede importar `model/`.
- Ningún `if (kind === …)` fuera de `model/archetype.ts`.
- `home-manager-card.ts` queda por debajo de 600 líneas.
- Cada función de `model/` tiene pruebas unitarias.

En la integración:
- `esphome_packages.py`: detección, propuesta, aplicación y restauración;
- comandos websocket `homemanager/esphome/inspect`, `…/prepare` (devuelve las líneas y un token de un solo uso) y `…/apply` (con el token; transmite el avance);
- más adelante, `homemanager/activity/subscribe`.

**Contrato V2**, sólo campos opcionales nuevos, así que un plano de 0.6 sigue siendo válido:

| Campo | Valores |
|---|---|
| `rooms[].icon` | `mdi:*` |
| `bindings.deviceId` | ID del registro de dispositivos de HA |
| `display.archetype` | `actuator`, `equipment`, `sensor`, `meter`, `remote`, `infrastructure` |
| `display.show` | `icon`, `value`, `both` |
| `bindings.alerts` | umbrales y reglas activadas, validados como los demás campos |

Los tres validadores (`validation.mjs`, `validation.py` y el JSON Schema) cambian juntos, como siempre.

## 11. Fuera de alcance por ahora

- Vista resumida del plano con varios valores por símbolo.
- Notificaciones al móvil.
- Historial de gráficos en la pantalla del dispositivo (se abre el de HA).
- Escenas y automatizaciones creadas desde HomeManager.
