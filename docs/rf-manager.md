# Gestor de controles RF

Estado: **0.5.0-beta.1** (aprendizaje libre, partes, diseñador, equipos RF y control en el plano). Falta la prueba con un transmisor real. Decisión: [D16](decisions.md#d16--gestor-de-controles-rf-propio). Sustituye, para los equipos que se den de alta aquí, la cadena actual de scripts, helpers y botones de dashboard. Lo existente en Home Assistant no se toca.

## Qué reemplaza

| Hoy (configuración manual en HA) | Con el gestor |
| --- | --- |
| Acciones ESPHome distintas por temporización (`rf_send_24`, `rf_send_24_400`) | Una acción del paquete HomeManager con la temporización como parámetro |
| `input_boolean` del modo 350/400 µs por control | `pulse_us` del control, **medido** al capturar y confirmado al probar |
| `input_select` del transmisor por control | `transmitter` del control, elegido al probar |
| `input_boolean` de bloqueo por control | Cola por transmisor: dos pulsaciones nunca se intercalan |
| Script enrutador con plantillas | El backend arma el envío con los datos del control |
| Códigos copiados en botones del dashboard | Biblioteca en `.storage/homemanager.rf`; los navegadores no reciben códigos |
| Repeticiones y espera fijas en el firmware | `repeats` y `wait_us` por control, ajustables y probables |

## Piezas

1. **Paquete ESPHome** [`esphome/homemanager-rf.yaml`](../esphome/homemanager-rf.yaml), una sola vez por transmisor. Añade:
   - `homemanager_rf_send(code, protocol, pulse_length, repeats, wait_us)`: arma la trama RCSwitch con esa temporización, la envía `repeats` veces y espera `wait_us` entre tramas;
   - `homemanager_rf_capture(seconds)`: abre una ventana de hasta 60 s en la que cada recepción se envía a HA como evento `esphome.homemanager_rf_raw` con los **tiempos crudos**. Fuera de la ventana no envía nada.

   Validado con `esphome config` y compilado (ESP-IDF 5.5.6) en ESPHome 2026.10.0 sobre el paquete oficial *Athom RF IR Remote*, junto a acciones y disparadores existentes; todavía no probado en un equipo real. Los eventos `esphome.*` no necesitan permisos adicionales en HA. No sustituye ni modifica las acciones actuales del Athom.
2. **Decodificador** (`rf_codec.py`): a partir de los tiempos crudos obtiene protocolo, bits y **duración del pulso**, medida sobre el periodo completo de cada bit (marca + espacio) para que la asimetría típica del receptor no la sesgue. Acepta recepciones con varias tramas y también tramas sueltas: un receptor con `idle` de 10 ms (como el del paquete Athom) corta cada trama antes de su pausa de sincronización. Esto es lo que distingue un control de 350 µs de uno de 400 µs. Admite los protocolos RCSwitch 1, 2, 4 y 7; los controles de ventilador de 433 MHz suelen usar el 1 con 24 bits.
3. **Biblioteca** (`rf_model.py`, `rf.py`): controles con sus ajustes, botones (nombre, icono, código), partes con roles y diseño.
4. **API WebSocket** (`rf_websocket.py`): leer la biblioteca y pulsar botones (administradores y lectores elegidos); transmisores, equipos, captura, prueba y edición (sólo administradores). Ningún comando devuelve un código.

## Aprender botones

En **HomeManager → Controles RF** (sólo administradores). Un control es **nombre + icono** (y una descripción opcional); no hace falta decir de antemano qué tipo de equipo es.

1. **Nuevo control → Aprender botones.** El receptor elegido (el *receptor por defecto* de Equipos RF, o el del control) escucha mientras el panel está abierto; se puede cambiar en cualquier momento. Los botones se aprenden **en cualquier orden**: se pulsa uno en el control físico, se le pone nombre (hay sugerencias: Encender, Velocidad 1, Tono…) e icono, y se guarda.
2. **Qué se está oyendo, en vivo.** *Pulsá un botón* → *Recibido, falta confirmar* (con cuántas tramas llegaron) → *Código confirmado*. Si llega señal que ningún protocolo explica, lo dice (*Llega señal, pero no se reconoce*) y sugiere acercar el control u otro receptor. Si el código ya está guardado en otro botón, también lo avisa.
3. **Cuándo un código es confiable.** Con **3 tramas idénticas en una misma pulsación** (lo habitual: un control emite entre 4 y 8 por pulsación) o con el mismo código en **dos pulsaciones** separadas por más de 0,3 s. Antes de 0.5 hacían falta dos pulsaciones separadas por más de un segundo, y dos pulsaciones rápidas contaban como una: por eso a veces no confirmaba. Las lecturas parciales (menos bits) nunca ganan a una completa.
4. **Probar.** El primer botón de un control nuevo se envía con lo **medido** de la señal (protocolo, bits, pulso), 5 repeticiones y espera 0; los siguientes, con los ajustes del control. Si el equipo no reacciona, prueba variantes **de a una**, en orden fijo y diciendo qué cambió: otro transmisor, pulso +50 µs, pulso −50 µs, más repeticiones. Lo que funcione pasa a ser el ajuste del control. También se puede **guardar sin probar**.
5. **Opcional: para Home Assistant.** Al guardar se puede elegir el rol del botón en una parte (por ejemplo *Luz · Apagar*). Se puede hacer después, en Editar.

El control se guarda con su primer botón (de él salen protocolo, bits y pulso). Si se cierra sin aprender ninguno, no queda nada guardado.

### Ajustes de transmisión

- **Pulso (`pulse_us`).** Se mide en cada trama capturada sobre el periodo completo de cada bit (mediana, redondeada a 10 µs) y se guarda también como `measured_pulse_us`. En *Editar → Avanzado* se ve si el valor actual es el medido o uno ajustado después.
- **Repeticiones (`repeats`, 1–20).** Cuántas tramas se envían por pulsación; se empieza con 5.
- **Espera entre tramas (`wait_us`, 0–100 000 µs).** Empieza en **0**: la pausa de sincronización ya forma parte de cada trama.

## El control en pantalla (diseñador)

Cada control se dibuja como un control remoto: **elementos en una cuadrícula de 4 columnas**. Mientras nadie lo diseñe, HomeManager dibuja uno automático (primero las partes: encendido, velocidades, más/menos; después el resto de los botones).

| Elemento | Botones | Uso |
| --- | --- | --- |
| Botón | 1 | Envía un código |
| Interruptor | encender (o uno que alterna) + apagar opcional | Encender/apagar |
| Menos / más | bajar, subir | Brillo, velocidad por pasos |
| Selector por pasos | 2–12, en orden | Velocidades 1…N |
| Selector de modos | 2–8, con nombre | Tonos, modos |

En **Editar**: *Agregar elemento*, arrastrar para mover, la esquina para cambiar el tamaño, tocar para editar, ✕ para quitar (con confirmación). Con teclado: flechas mueven, Mayús+flechas cambian el tamaño, Enter edita, Supr quita. Un elemento que cae sobre otros los corre hacia abajo. Un botón nuevo aparece al final del control. Quitar un elemento no borra el botón; *Diseño automático* vuelve al dibujo por defecto.

En uso, cada toque **envía** y lo indica (*Enviado: Velocidad 3*); nunca muestra un estado físico, porque RF es de una vía. El servidor valida cada diseño (límites de la cuadrícula, botones existentes, cantidad por tipo).

## Partes: qué recibe Home Assistant

Los botones no tienen una función fija. Lo que Home Assistant ve se decide en **Editar → En Home Assistant**, con **partes**:

- una parte **Ventilador** con roles: encender, apagar, alternar, velocidad 1…12, más/menos velocidad (con el número de velocidades), dirección;
- una parte **Luz** con roles: encender, apagar, alternar.

Cada parte es una entidad (`fan` o `light`), y cada rol apunta a un botón **de esa parte**: el *Apagar* de la luz ya no puede terminar en el ventilador. Un control puede tener varias partes. Los botones sin rol son entidades `button`. Las entidades se crean, actualizan y borran solas.

| Roles de la parte | Entidad |
| --- | --- |
| Velocidad 1…N | `fan` con N velocidades; cada velocidad se envía aunque sea la estimada (así se resincroniza) |
| Sólo más/menos velocidad | `fan`; HomeManager pulsa más/menos las veces necesarias desde el nivel estimado |
| Encender y apagar separados | Encendido y apagado directos |
| Un único botón que alterna | Sólo se envía si el estado pedido difiere del estimado; *Marcar como encendido/apagado* corrige sin enviar |

Una parte llamada igual que el control toma el nombre del dispositivo.

## Equipos RF

**Controles RF → Equipos RF** lista **todos** los dispositivos ESPHome de Home Assistant, no sólo los que ya tienen el paquete:

- **Listo para RF**: tiene el paquete. Se puede elegir como *receptor por defecto* para aprender y **probar la recepción** (15 s escuchando: dice si llega un código, señal no reconocida o nada).
- **Sin paquete**: *Cómo agregarlo* muestra las líneas exactas para su YAML, fijadas a la versión instalada de HomeManager, con **Copiar** y un enlace a **ESPHome Builder** (cuando Supervisor lo ejecuta). Para placas que no son Athom, el bloque marca dónde poner los `id` de su transmisor y receptor.

HomeManager no edita el YAML de ESPHome: ESPHome Builder es su dueño y ESPHome no ofrece una forma segura de hacerlo desde fuera.

## Eco: ¿salió la señal?

Un envío por RF no tiene respuesta: el equipo no avisa si lo recibió. Desde 0.6, alrededor de cada pulsación los receptores con el paquete (el propio transmisor incluido) abren una ventana de escucha de 3 s **antes** de transmitir; si en los 1,5 s siguientes alguno decodifica el mismo código, el envío se informa como **oído en el aire** (`homemanager_on_air` en las entidades del control: `{ "at", "result": "heard" | "not_heard" | "unverified", "by" }`, y *en el aire ✓* junto al símbolo).

- Es evidencia de que la señal **se emitió**, no de que el equipo la recibió ni de su estado.
- *Sin eco* (`not_heard`) no prueba un fallo: muchos módulos no se oyen a sí mismos mientras transmiten. Un segundo receptor con el paquete (por ejemplo otro Athom) lo hace más fiable.
- *Sin verificar* (`unverified`): no hay ningún receptor con el paquete que pueda escuchar.
- Un receptor que está aprendiendo conserva su ventana; uno que no responde a tiempo se omite. El eco nunca retrasa más de 1 s ni hace fallar un envío.
- No necesita cambiar el firmware: usa la acción de captura del paquete de 0.4.

## Dónde se guarda

`/config/.storage/homemanager.rf` (versión 2), en las copias de seguridad de HA:

```json
{
  "remotes": {
    "ventilador-sala": {
      "name": "Ventilador sala", "icon": "mdi:ceiling-fan-light", "description": null,
      "transmitter": "athom_rf_ir_remote",
      "protocol": 1, "nbits": 24, "pulse_us": 400, "measured_pulse_us": 400, "repeats": 5, "wait_us": 0,
      "buttons": { "velocidad-3": { "name": "Velocidad 3", "icon": "mdi:numeric-3", "code": "<24 bits>" } },
      "parts": { "fan": { "name": "Ventilador sala", "kind": "fan", "speeds": null, "roles": { "speed_3": "velocidad-3" } } },
      "layout": null
    }
  },
  "default_receiver": "athom_rf_ir_remote"
}
```

**Migración desde 0.4.** Al actualizar, cada función de botón pasa a un rol: las de ventilador a la parte `fan`, las de luz a la parte `light`, con los mismos identificadores únicos, así que las entidades y su historial se conservan. Los botones reciben un icono según su función anterior; el diseño queda automático.

Los navegadores sólo reciben nombres, iconos, ajustes y una huella corta de cada código. El plano no contiene códigos.

## Fases

1. **Backend y firmware** — hecho (0.4).
2. **Asistente, entidades y panel** — hecho (0.4).
3. **Aprendizaje libre, partes, diseñador y equipos RF** — hecho (0.5).
4. **Control en el plano** — hecho (0.5): el panel de un dispositivo dibuja su control RF (el elegido en *Al mantener pulsado → Control RF en el panel*, o el de su entidad) y el icono ofrece accesos rápidos al mantenerlo pulsado, sugeridos desde la entidad o los botones del control.
5. **Pendiente:** importación de catálogos de códigos; escucha continua del control físico para corregir el estado estimado.

## Límites conocidos

- RF es de una vía: los estados son estimados. Si alguien usa el control físico, el estimado se desincroniza; se corrige con "Marcar como…" o volviendo a enviar la velocidad.
- Protocolos RCSwitch invertidos o con sincronización larga (3, 5, 6 y 8) no se decodifican.
- Los aires acondicionados por infrarrojos no encajan en "capturar botones" (cada código lleva el estado completo). Para ellos se usa la plataforma de clima IR de ESPHome.
- El paquete se aplica una vez por transmisor y requiere conocer los `id` del transmisor y del receptor de 433 MHz en su YAML.
