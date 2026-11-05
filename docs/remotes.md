# Remotes · aprendizaje manual y biblioteca

La biblioteca de Remotes reúne los controles RF existentes y los controles IR aprendidos. Se consulta por `homemanager/remotes/library`, con el mismo acceso para administradores y lectores autorizados que el resto de HomeManager.

## Compatibilidad RF

Remotes proyecta la biblioteca RF cargada por HomeManager, incluidos los datos de versión 1 convertidos por la migración existente. Lee los controles de versión 2 en su ubicación habitual, `.storage/homemanager.rf`. Conserva sus identificadores, botones, partes, roles, ajustes y diseños. Las ediciones RF aparecen en la proyección al volver a consultarla.

La API `homemanager/rf/*`, el gestor de RF, su transmisión y captura, el eco, las entidades, los vínculos y el diseñador siguen usando la biblioteca RF existente. Al volver a una versión anterior, HomeManager sigue leyendo ese mismo archivo RF.

## Contrato de lectura

La respuesta contiene `remotes`, una lista de controles. `source` identifica la biblioteca de origen (`rf` o `ir`). La pareja `(source, id)` distingue dos registros con el mismo identificador. Cada botón agrega `command_type` (`rf_rcswitch` o `ir_raw`). El identificador del botón es estable dentro de su control y el diseño lo usa por referencia. La variante se identifica por botón para permitir que un futuro control visual combine transportes.

Los botones se exponen con nombre, icono y huella. En IR, el emisor y la señal completa quedan en el backend.

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

HomeManager usa la conexión ESPHome que ya administra Home Assistant. La disponibilidad de IR depende de que esa versión de Home Assistant pueda cargar el nodo y exponer sus capacidades IR Proxy. En particular, Home Assistant 2026.2.3 puede seguir ejecutando HomeManager y RF, pero su integración ESPHome estándar carece de la plataforma infrarroja. El flujo funciona con un solo receptor. Un segundo receptor puede usarse fuera del flujo como diagnóstico opcional.

Las operaciones de descubrimiento, captura, prueba y guardado exigen permisos de administrador. Los lectores autorizados pueden pulsar botones IR guardados. Cada captura queda asociada a la sesión que la abrió. El navegador recibe el identificador temporal y un resumen, mientras que los tiempos y destinos de los botones guardados quedan en el backend.

## Comprobación

Las pruebas de integración cubren las dos versiones de almacenamiento RF, los permisos, la privacidad y el envío RF por su API histórica. Las pruebas IR usan señales sintéticas para verificar selección del receptor y emisor, liberación al cancelar o desconectar, guardado y recarga, y envío nativo con la portadora y las pausas originales. Falta validar el flujo integrado con mandos y aparatos reales.
