# Remotes · aprender, diseñar y diagnosticar

La biblioteca de Remotes reúne los controles RF existentes y los controles IR aprendidos. Se consulta por `homemanager/remotes/library`, con el mismo acceso para administradores y lectores autorizados que el resto de HomeManager.

## Compatibilidad RF

Remotes proyecta la biblioteca RF cargada por HomeManager, incluidos los datos de versión 1 convertidos por la migración existente. Lee los controles de versión 2 en su ubicación habitual, `.storage/homemanager.rf`. Conserva sus identificadores, botones, partes, roles, ajustes y diseños. Las ediciones RF aparecen en la proyección al volver a consultarla.

La API `homemanager/rf/*`, el gestor de RF, su transmisión y captura, el eco, las entidades, los vínculos y el diseñador siguen usando la biblioteca RF existente. Al volver a una versión anterior, HomeManager sigue leyendo ese mismo archivo RF.

## Contrato de lectura

La respuesta contiene `remotes`, una lista de controles. `source` identifica la biblioteca de origen (`rf` o `ir`). La pareja `(source, id)` distingue dos registros con el mismo identificador. Cada botón agrega `command_type` (`rf_rcswitch` o `ir_raw`). El identificador del botón es estable dentro de su control y el diseño lo usa por referencia. La variante se identifica por botón para permitir que un futuro control visual combine transportes.

La biblioteca expone los botones con nombre, icono y huella. El emisor IR y la señal completa quedan en el backend. La ficha avanzada exige una sesión de administrador y sirve los datos bajo demanda, también para exportar. Las API de lectura y pulsación habituales conservan sus permisos y omiten las señales.

## Señal IR para ESPHome IR Proxy

El almacén privado de IR, `.storage/homemanager.ir` versión 1, contiene los controles por identificador en `remotes`. El control guarda una referencia estable al emisor ESPHome, con una selección opcional por botón. Cada botón guarda la señal con los siguientes campos.

- `timings_us` guarda la secuencia completa en microsegundos. Las marcas son positivas, las pausas negativas y la secuencia empieza con una marca. Se conservan el orden, las pausas entre tramas y la última duración. El modelo admite hasta 4096 tiempos y 2 segundos por señal.
- `carrier_hz` guarda la portadora en Hz como entero. `0` representa una señal sin modulación. Una señal con portadora desconocida guarda `null` y queda pendiente de asignación antes de poder enviarse.
- `carrier_source` identifica si la frecuencia es `known`, `estimated` o `unknown`.

## Aprender un botón

1. Abrí **Controles RF → Infrarrojos** como administrador y elegí un receptor y un emisor. Se puede usar un mismo nodo para ambas funciones si anuncia las dos capacidades.
2. Iniciá la captura y pulsá una vez el botón del mando original. La ventana escucha durante 15 segundos y se cierra con la primera secuencia válida del receptor seleccionado.
3. Revisá la portadora. El proxy devuelve los tiempos de la señal y la interfaz propone 38 kHz como estimación editable. Si conocés la frecuencia, indicá el valor en Hz y marcala como conocida.
4. Probá la señal si querés observar la reacción del aparato. Después guardala como botón de un control nuevo o existente. La captura temporal dura dos minutos y se usa una sola vez para guardar.
5. Pulsá el botón guardado para enviar la secuencia completa una vez al emisor elegido. **Enviado** indica que se pidió la emisión. La reacción del equipo se comprueba por separado.

**Capturar varios botones** recoge hasta ocho señales distintas en una ventana. Pulsá y soltá cada botón por separado y revisá la lista antes de guardar. Las capturas de lote duran cinco minutos. En el modo libre RF, la lista de lecturas confirmadas de la sesión permite revisar los botones pendientes sin perder el recorrido guiado.

HomeManager usa la conexión ESPHome que ya administra Home Assistant. La disponibilidad de IR depende de que esa versión de Home Assistant pueda cargar el nodo y exponer sus capacidades IR Proxy. En particular, Home Assistant 2026.2.3 puede seguir ejecutando HomeManager y RF, pero su integración ESPHome estándar carece de la plataforma infrarroja. El flujo funciona con un solo receptor. Un segundo receptor puede usarse fuera del flujo como diagnóstico opcional.

Las operaciones de descubrimiento, captura, prueba y guardado exigen permisos de administrador. Los lectores autorizados pueden pulsar botones IR guardados. Cada captura IR queda asociada a la sesión que la abrió. La vista previa usa un identificador temporal y un resumen digital.

## Diseñar y vincular

**Editar control** permite renombrar y borrar controles o botones IR, cambiar iconos y ajustar el emisor o la portadora. **Volver a aprender** conserva el identificador del botón y sus referencias en el diseño. **Editar diseño** abre el mismo diseñador que usa RF. Los botones IR son entidades `button` con identidad estable para automatizaciones. La pulsación conserva su naturaleza de comando y la respuesta física queda separada.

En la ficha de un símbolo del plano, agregá el módulo **Control** y elegí **Control IR en el panel**. También puede encontrarse automáticamente a través de la entidad de un botón IR. Los vínculos RF conservan su campo y su comportamiento. El catálogo incorpora `irRemoteId` como campo opcional. Para volver a una versión cuyo catálogo es anterior a ese campo, restaurá la copia anterior a la creación de vínculos IR.

## Ficha de señal

La ficha está disponible durante el aprendizaje y después en **Editar control → Ficha técnica**. Durante el aprendizaje, **Probar** deja disponible la última preparación para compararla con la captura antes de guardar. Las pestañas **Resumen**, **Señal**, **Decodificación**, **Emisión** y **Pruebas** separan la evidencia. La línea temporal permite hacer zoom, desplazarse, elegir una trama, alinear al primer pulso, marcar un intervalo y exportar el gráfico en SVG o PNG. Las tramas se infieren a partir de las pausas largas, y el histograma cuenta pulsos y pausas por rango. La ficha conserva la secuencia exacta al cambiar de vista.

El decodificador muestra campos cuando reconoce RCSwitch, NEC, AEHA o RC6 en modo 0. Una captura puede analizarse aunque su protocolo quede desconocido. El visor distingue tiempos recibidos, campos decodificados, ajustes configurados y estimaciones. Una portadora seleccionada para reproducir y la frecuencia nominal de un receptor son ajustes, no mediciones de la luz o la radio.

La ficha compara la captura original, la preparación del adaptador y las observaciones posteriores. Para IR, la preparación usa el mismo objeto de señal que se entrega al método nativo del proxy. Para RF, los tiempos se reconstruyen con los parámetros del servicio y el contrato del paquete ESPHome existente. El resultado describe la representación enviada al adaptador. La cuantización del transmisor y la recepción física se observan aparte.

Al enviar una prueba se puede elegir **Auto-eco** en el mismo nodo o **Receptor independiente B** en otro nodo. Cada ventana se abre para esa prueba y la recepción debe corresponder al nodo seleccionado. Un receptor puede oír otros mandos dentro de la ventana. La comparación informa diferencias de signo, longitud y duración por intervalo con una tolerancia del mayor valor entre 120 µs y 25 %. Los bloques y repeticiones ausentes sólo pueden interpretarse dentro de la ventana y los límites del receptor. El estado indeterminado o sin eco permite seguir con el flujo normal.

En **Pruebas → Comprobar con la cámara del teléfono**, comprobá primero el destello de un mando IR que funcione. Luego apuntá al LED del transmisor y solicitá una prueba. Algunas cámaras filtran infrarrojos. Si la cámara tampoco ve el mando, probá con la frontal u otro teléfono y registrá **No concluyente** si persiste. Se puede registrar **Emisión visible**, **No visible** o **No concluyente**. Ver luz indica actividad en el LED. La secuencia, la portadora, los tiempos y la respuesta del aparato requieren evidencia aparte. HomeManager guarda sólo la observación elegida y las notas opcionales, sin pedir acceso a la cámara.

El almacén privado `.storage/homemanager.signals` conserva originales RF aprendidos, hasta ocho pruebas u observaciones por botón y los datos para volver a dibujar una comparación guardada. Los originales IR están en `.storage/homemanager.ir`. La miniatura se deriva de los tiempos y tiene versión. Los botones anteriores al analizador siguen disponibles, con el original indicado como desconocido cuando sólo quedan el código o la forma guardada. El archivo de diagnóstico tiene una cuota de 12 MiB de datos serializados y **Limpiar historial** permite liberar pruebas conservando el botón y su captura. Un problema de almacenamiento del diagnóstico se informa aparte de la emisión.

## Comprobación

Las pruebas cubren las dos versiones de almacenamiento RF, los permisos, la privacidad y el envío RF por su API histórica. Las pruebas IR usan señales sintéticas para verificar selección, guardado, recarga y envío con la portadora y las pausas originales. La prueba de la entrega es un único recorrido desde aprender hasta volver a pulsar desde el plano, con diagnóstico optativo. La validación física y los hallazgos del reproductor de Athom están registrados por separado. [Evidencia de investigación](remotes-evidence.md)
