# Gestor de controles RF

Estado: **fases 1 y 2 implementadas y probadas con hardware simulado** (rama `claude/rf-manager`); falta la prueba con un transmisor real. Decisión: [D16](decisions.md#d16--gestor-de-controles-rf-propio). Sustituye, para los equipos que se den de alta aquí, la cadena actual de scripts, helpers y botones de dashboard. Lo existente en Home Assistant no se toca.

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
3. **Biblioteca** (`rf_model.py`, `rf.py`): controles con sus ajustes y botones con nombre, función y código.
4. **API WebSocket** (`rf_websocket.py`): leer la biblioteca y pulsar botones (cualquier usuario); transmisores, captura, prueba y edición (sólo administradores). Ningún comando devuelve un código.

## El asistente, paso a paso

En el panel lateral **HomeManager → Controles RF** (sólo administradores). El orden importa: no se puede probar un transmisor sin un botón capturado.

1. **Captura.** Nombre del equipo, tipo (ventilador, luz u otro), cuántas velocidades tiene y qué receptor está más cerca del control físico. → "Presiona *Apagar* en tu control" → "Otra vez". Un código cuenta como **confirmado** cuando aparece igual en dos pulsaciones separadas por más de un segundo. Las lecturas parciales (menos bits, por ejemplo 10 de 24) nunca ganan a una completa, y si un código ya existe en otro control, el asistente lo avisa.
2. **Prueba del primer botón.** HomeManager lo envía con lo medido (protocolo, bits, pulso), 5 repeticiones y espera 0. Pregunta "¿El equipo reaccionó?".
   - **Sí:** esos ajustes quedan en el control y valen para todos sus botones.
   - **No:** prueba variantes, una por vez y siempre preguntando: el otro transmisor; el pulso alternativo (350 ↔ 400); más repeticiones. Cada intento queda registrado para no repetir combinaciones.
3. **Resto de botones.** Capturar, poner nombre y elegir qué hace: apagar, luz, velocidad N, subir/bajar, dirección, temporizador, otro. En la plantilla "ventilador con luz" el asistente propone un orden típico (apagar, velocidades, dirección, luz, temporizador) y permite saltar los que el control no tenga. Cada botón se puede probar antes de guardarlo.
4. **Listo.** El control queda guardado y Home Assistant crea sus entidades. Desde el detalle del control se renombran botones, se cambian funciones, se prueban, se agregan más o se ajusta la transmisión.

### Ajustes de transmisión (los que costó encontrar a mano)

- **Pulso (`pulse_us`).** Se mide en cada trama capturada sobre el periodo completo de cada bit (mediana, redondeada a 10 µs). Si la prueba falla, se intenta el valor alternativo.
- **Repeticiones (`repeats`, 1–20).** Cuántas tramas se envían por pulsación. Los controles de ventilador suelen emitir entre 4 y 8 tramas por pulsación; se empieza con 5.
- **Espera entre tramas (`wait_us`, 0–100 000 µs).** Empieza en **0**: la pausa de sincronización ya forma parte de cada trama, y una espera adicional hace que algunos receptores no reconozcan la secuencia.

Los tres, con el transmisor, aparecen en "Ajustes avanzados" del control; después de guardarlos se usa **Probar** en cualquier botón. No hace falta tocarlos si la primera prueba funciona.

## Cómo se elige el control en pantalla

Sale de las funciones que tienen los botones, no de suposiciones:

| Botones del control | Control en el panel |
| --- | --- |
| Velocidad 1…N | **Selector por pasos** con N paradas + apagado |
| Sólo subir/bajar velocidad (con el número de velocidades declarado) | Selector por pasos; HomeManager pulsa subir/bajar las veces necesarias desde el nivel estimado |
| Luz con encendido y apagado separados | Interruptor |
| Luz con un único botón que alterna | Interruptor **estimado**: sólo envía si el estado pedido difiere del estimado; "Marcar como encendido/apagado" corrige el estimado sin enviar nada |
| Dirección | Selector de dirección del ventilador |
| Brillo, tono, temporizadores, otros | Entidades `button` con su nombre |

Cualquier ventilador de Home Assistant con pocas velocidades (2 a 12) usa el mismo selector por pasos, sea RF o no.

**El selector por pasos se comporta también como botones.** Cada parada se puede tocar, incluida la que ya está marcada: tocar "3" estando en "3" vuelve a enviar Velocidad 3. Al arrastrar no se envía nada hasta soltar, y entonces se envía una sola vez la parada donde quedó. La parada marcada es la última **enviada** (estado *estimado*): el RF no informa el estado real del equipo.

## Qué es una "entidad" aquí

- El **control remoto** es configuración: transmisor, temporización y botones. No es una entidad.
- Cada control es un **dispositivo de HA** (por ejemplo "Ventilador sala") con entidades estándar derivadas de las funciones: `fan` (velocidades, apagado, dirección), `light` (luz) y `button` (temporizadores y otros). Se crean, actualizan y borran solas al editar el control. En el plano se vinculan como cualquier otra entidad (*Entidad del dispositivo*). Su estado es asumido (`assumed_state`), así que automatizaciones, escenas y asistentes de voz pueden usarlos sin que nadie los confunda con un estado medido.

## Dónde se guarda

`/config/.storage/homemanager.rf`, versionado y en las copias de seguridad de HA:

```json
{
  "remotes": {
    "ventilador-sala": {
      "name": "Ventilador sala",
      "transmitter": "athom_rf_ir_remote",
      "protocol": 1, "nbits": 24, "pulse_us": 350, "repeats": 5, "wait_us": 0, "speeds": 6,
      "buttons": {
        "velocidad-3": { "name": "Velocidad 3", "function": "speed_3", "code": "<24 bits>" }
      }
    }
  }
}
```

Los navegadores sólo reciben nombres, funciones, ajustes y una huella corta de cada código. El plano no contiene códigos.

## Fases

1. **Backend y firmware** — hecho: decodificación, biblioteca, envío con cola, captura, prueba y paquete ESPHome.
2. **Asistente, entidades y panel** — hecho: asistente de captura y prueba, detalle del control, entidades `fan`/`light`/`button`, selector por pasos y corrección del estado estimado.
3. **Pendiente:** importación de catálogos de códigos ya capturados, apariencia personalizable del panel, brillo con pulsación mantenida y **escucha del control físico** (con el receptor escuchando de forma continua, una pulsación del control real actualizaría el estado estimado; opcional para no inundar HA de eventos).

## Límites conocidos

- RF es de una vía: los estados son estimados. Si alguien usa el control físico, el estimado se desincroniza; se corrige con "Marcar como…" o volviendo a enviar la velocidad.
- Protocolos RCSwitch invertidos o con sincronización larga (3, 5, 6 y 8) no se decodifican.
- Los aires acondicionados por infrarrojos no encajan en "capturar botones" (cada código lleva el estado completo). Para ellos se usa la plataforma de clima IR de ESPHome.
- El paquete se aplica una vez por transmisor y requiere conocer los `id` del transmisor y del receptor de 433 MHz en su YAML.
