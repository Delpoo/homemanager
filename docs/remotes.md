# Remotes · etapa 2

La biblioteca de Remotes permite leer los controles RF existentes y representar controles IR con señales crudas. El contrato nuevo se consulta por `homemanager/remotes/library`, con el mismo acceso para administradores y lectores autorizados que el resto de HomeManager.

## Compatibilidad RF

Remotes proyecta la biblioteca RF cargada por HomeManager, incluidos los datos de versión 1 convertidos por la migración existente. Lee los controles de versión 2 en su ubicación habitual, `.storage/homemanager.rf`. Conserva sus identificadores, botones, partes, roles, ajustes y diseños. Las ediciones RF aparecen en la proyección al volver a consultarla.

La API `homemanager/rf/*`, el gestor de RF, su transmisión y captura, el eco, las entidades, los vínculos y el diseñador siguen usando la biblioteca RF existente. Al volver a una versión anterior, HomeManager sigue leyendo ese mismo archivo RF.

## Contrato de lectura

La respuesta contiene `remotes`, una lista de controles. `source` identifica la biblioteca de origen (`rf` o `ir`). La pareja `(source, id)` distingue dos registros con el mismo identificador. Cada botón agrega `command_type` (`rf_rcswitch` o `ir_raw`). El identificador del botón es estable dentro de su control y el diseño lo usa por referencia. La variante se identifica por botón para permitir que un futuro control visual combine transportes.

Los botones se exponen con nombre, icono y huella. En IR, el emisor y la señal completa quedan en el backend.

## Señal IR para ESPHome IR Proxy

El almacén privado de IR, `.storage/homemanager.ir` versión 1, contiene los controles por identificador en `remotes`. El control guarda una referencia explícita al emisor infrarrojo de Home Assistant, con un emisor opcional por botón. Cada botón guarda la señal con los siguientes campos.

- `timings_us` guarda la secuencia completa en microsegundos. Las marcas son positivas, las pausas negativas y la secuencia empieza con una marca. Se conservan el orden, las pausas entre tramas y la última duración. El modelo admite hasta 4096 tiempos y 2 segundos por señal.
- `carrier_hz` guarda la portadora en Hz como entero. `0` representa una señal sin modulación. Una señal con portadora desconocida guarda `null` y queda pendiente de asignación antes de poder enviarse.
- `carrier_source` identifica si la frecuencia es `known`, `estimated` o `unknown`.

El siguiente incremento conecta el aprendizaje manual y envía la secuencia aprendida una vez mediante la transmisión cruda del proxy. La elección del emisor es explícita y puede usar las capacidades anunciadas por ESPHome a través de la conexión que gestiona Home Assistant. El segundo receptor sirve para diagnóstico opcional. La aceptación del envío, el eco observado y la reacción física del aparato son observaciones separadas.

## Comprobación

Las pruebas de integración siembran bibliotecas sintéticas de ambas versiones RF y comprueban la migración existente, la vista mixta de bibliotecas, los permisos, la privacidad de las señales y el envío RF a través de su API histórica. Las pruebas del modelo verifican la conservación de signos, pausas y portadora, y el rechazo de señales fuera de límites. La validación del aprendizaje y del envío IR desde HomeManager corresponde al incremento siguiente.
