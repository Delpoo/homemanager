# Remotes · evidencia de transmisión IR

## Observaciones comunicadas

Con el reproductor por ranuras **IR Send** de Athom v3.0.8 y ESPHome 2026.10.1 se comunicaron capturas Philips RC6 de 42 tiempos y Mitsubishi AEHA de 385. En la prueba más reciente con ese reproductor, la cámara mostró luz en el LED del emisor A. El receptor B no registró las retransmisiones y los dos aparatos quedaron sin respuesta. La indicación del firmware registra la solicitud de envío. La luz visible registra actividad del LED.

En una prueba anterior por **ESPHome IR Proxy directo**, el Mitsubishi encendió con una señal de encendido a 38 029 Hz y B recibió la transmisión. El RC6 enviado por el mismo mecanismo llegó a B en otra prueba, con la reacción del televisor pendiente. Son ensayos de rutas distintas. El recorrido integrado de HomeManager requiere su propia comprobación física.

## Hipótesis prioritaria

El script de Athom revisado clasifica cada tiempo por posición par o impar y entrega los tiempos de pausa de la captura cruda a `space()`. ESPHome recibe la duración en un entero sin signo y aplica el signo de pausa internamente. Una pausa guardada con signo negativo puede salir con signo positivo o con una duración incorrecta al pasar por ese contrato. Es consistente con ver actividad del LED sin que B reciba una trama decodificable. La causa de las pruebas domésticas queda pendiente de una comparación física controlada. [Script oficial de Athom](https://github.com/athom-tech/esp32-configs/blob/main/athom-rf-ir-remote.yaml#L530-L550) · [Contrato de ESPHome 2026.10.1](https://github.com/esphome/esphome/blob/2026.10.1/esphome/components/remote_base/remote_base.h#L18-L31)

El reporte independiente describe el defecto con firmware v3.0.7, observó una emisión visible y recuperó la reproducción de una señal NEC al corregir el tratamiento de signos. Su caso Hitachi siguió sin responder incluso con la reproducción corregida. Eso deja abiertas otras causas, como portadora, longitud, tiempos, orientación, saturación o estructura de la trama. [Reporte IRremoteESP8266 #2285](https://github.com/crankyoldgit/IRremoteESP8266/issues/2285)

HomeManager envía la secuencia firmada mediante el proxy de ESPHome usando su conexión existente. El siguiente ensayo físico compara el mismo botón original, la preparación y la recepción de B, con el resultado de cámara y la reacción del aparato en el historial. Se pueden registrar todas esas evidencias dentro de una prueba de extremo a extremo. [IR/RF Proxy de ESPHome](https://esphome.io/components/ir_rf_proxy/)
