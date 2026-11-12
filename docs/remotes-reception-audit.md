# Auditoría de Remotes en 0.13.0-beta.3

12 de noviembre de 2026. Base contrastada con GitHub: `main` y la etiqueta `v0.13.0-beta.3` apuntan a `8b99150`, merge del [PR #113](https://github.com/Delpoo/homemanager/pull/113). Comparación con `v0.13.0-beta.2` (`0e0ca26`), `v0.11.0-beta.2` (`97d4ad4`) y la implementación inicial.

## Defectos reproducidos

| Tramo | Causa y origen | Antes | Después |
| --- | --- | --- | --- |
| Tiempos crudos → decodificador → candidato RF | Desde `d9f1fa4`, el decodificador aplicaba a toda la recepción la mediana de las pausas largas. Una pausa de cierre suficientemente larga cambiaba la sincronización usada para una trama íntegra y la dejaba como ruido. | Con 14 códigos históricos distintos y tiempos reconstruidos a 350 y 400 µs, las tres versiones aceptan 28/28 sin pausa atípica y 0/28 si la pausa final dura 90 ms. | `rf_codec.py` interpreta la sincronización adyacente a cada trama. 28/28 con y sin esa pausa. Se mantienen las tramas que llegan sin pausa de sincronización. |
| Segmentación → protocolo RF 7 | Desde `d9f1fa4`, el separador genérico de más de cinco pulsos corta las pausas de datos de seis pulsos del protocolo 7. | Los vectores de 24 y 25 bits de protocolo 7 no producían candidatas. Seis de ocho combinaciones de protocolo y longitud aprobadas. | `rf_codec.py` reintenta protocolo 7 con su propio umbral cuando el recorrido normal no devuelve tramas. Ocho de ocho combinaciones aprobadas. |
| Sesión → servicio de captura ESPHome | Desde `d9f1fa4`, todas las sesiones de un receptor comparten una ventana física y cada cierre enviaba `seconds: 0`. Un inicio con menos segundos también acortaba la ventana de la sesión previa. La protección del eco incorporada en `e097aeb` no cubría el cierre de capturas concurrentes. | Una captura de 20 s seguida de una de 5 s abría 20 s, luego 5 s y enviaba 0 al cerrar la primera. | `rf.py` serializa el armado y cierre por receptor, conserva la ventana más larga y cierra el dispositivo al terminar la última sesión. El eco usa la misma exclusión para evitar acortar una captura. |
| Suscripción → interfaz RF | Desde `8e810ba`, las respuestas y el cierre de una suscripción podían llegar tras seleccionar otro receptor. El modo guiado incorporado en `3314fa7` mantiene la primera candidata confirmada, por lo que una lectura tardía del receptor anterior bloquea la correcta. | En Chromium, al cambiar de A a B, un evento tardío de A (350 µs) ocupaba la pantalla de B y bloqueaba su evento (400 µs). Falló en escritorio y móvil. | `learn.ts` descarta eventos y errores de sesiones antiguas, libera confirmaciones de suscripción tardías y al cerrar conserva la referencia a la suscripción correcta. Pasó en escritorio y móvil. |

Las cuatro condiciones son independientes. El PR #113 añadió pruebas e historial de las señales; su diff de recepción no introdujo estos mecanismos. La secuencia concreta que produjo el fallo de la vivienda sigue pendiente de observar.

## Evidencia y límites

- El registro local C01 contiene 148 líneas de protocolo 1 de 24 bits, correspondientes a 14 códigos. ESPHome ya había decodificado esas líneas. Se usaron los códigos localmente con tiempos generados, sin publicar códigos del hogar. Los 90 ms representan un caso controlado de pausa final.
- El paquete RF, el modelo y el códec versionados limitan el recorrido HomeManager a los protocolos 1, 2, 4 y 7 desde la implementación inicial. La observación histórica de protocolo 6/25 bits debe contrastarse con la configuración instalada y la ruta anterior. El historial de la vivienda informa que esa señal funcionó. No prueba que pasara por este decodificador. Las longitudes de 24/25 bits y los tiempos de 350/400 µs se evalúan por separado del protocolo.
- La evidencia IR histórica registra recepción de Philips y encendido de Mitsubishi por el IR Proxy nativo. Eso verifica la ruta histórica directa. La verificación actual de ambos Athom requiere una pulsación física con trazas de extremo a extremo.
- La inspección de Home Assistant en vivo se detuvo antes de identificar el firmware efectivo, porque la herramienta no pudo verificar la URL de la ventana de Chrome. Las capturas de pantalla de esta auditoría se generaron con el frontend compilado, servicios simulados y datos ficticios. No hubo transmisiones físicas ni cambios en el firmware o los datos de la vivienda.
- El cambio no introduce una migración. Se conservaron los contratos de almacenamiento, los IDs, los códigos, los ajustes de transmisión y el YAML del paquete ESPHome. Se añadieron pruebas de decodificación, sesiones y navegador. El inventario de capturas se registra en `docs/public-assets.json` y el control de publicación de imágenes sigue validando sus hashes.

## Matriz de verificación

| Funcionalidad | Evidencia | Verificación pendiente en instalación |
| --- | --- | --- |
| RF libre y guiado, tramas y pulsaciones repetidas, cambio de A/B, guardar y volver a aprender | Casos de navegador de RF y regresión del cambio de receptor. Decodificación con códigos históricos y temporizaciones reconstruidas. | Dos receptores, ruido en reposo, mandos físicos, paquetes de 24/25 bits y protocolo 6 por la ruta anterior. |
| IR individual, guiado y por lote; releer y guardar sin probar; confirmación opcional | Recorridos simulados de navegador. Contratos de captura nativa y pruebas de integración en `test_ir_learning.py` y `test_ir_proxy.py`. | Señales completas de Philips y Mitsubishi en ambos Athom, duración, llave de receptor y detección de repeticiones reales. |
| Pruebas RF/IR, ficha, forma de onda, historial, eco RF y receptor de contraste | Navegador con envíos y observaciones simulados. Pruebas de integración en `test_rf_echo.py`, `test_signal_analysis.py` y `test_remote_diagnostics.py`. | Correlacionar el comando, la señal que llega a B y la respuesta física. La respuesta física requiere autorización para emitir. |
| Crear, editar, borrar y duplicar controles, botones, diseñador, plantillas, plano y vínculos HA | Recorridos de navegador con controles ficticios. Validación de diseño y pruebas de compatibilidad en `test_remote_duplicate.py`, `test_rf_entities.py` y `test_remotes.py`. | Verificar que la instalación carga sus controles existentes sin guardar cambios sobre ellos. |
| Mitsubishi AC144, modo, temperatura, ventilador, lamas, funciones, checksum | Setpoints y controles absolutos en navegador con emisor simulado. Codificación, checksum y perfiles cubiertos por los casos de `test_absolute_remotes.py`. | Confirmar el modelo exacto y comparar su mando físico con el perfil usado. |
| Temporizadores nativos y horarios de HomeManager | En navegador se editó reloj y horario de manera independiente y se cambió Apagar por Encender. Persistencia y disparo corresponden a `test_absolute_remotes.py`. | Comprobar la zona horaria y, cuando se autorice emitir, el disparo y la reacción del aire. |
| Gráficas de Recorder, formatos y Severity vertical | En navegador se verificaron unidades, interacción con teclado, pista vertical, respuesta tardía de otro sensor y un tramo plano. | Consultar Recorder con los sensores reales y confirmar unidades, período y datos de la instalación. |
| Flipper-IRDB, SmartIR e IRremoteESP8266 | Importación parcial de Flipper y trazabilidad en navegador. Los otros formatos se revisaron en `remote_catalog.py` y tienen casos en `test_absolute_remotes.py`. | Validar por modelo únicamente las señales que se vayan a usar y cuya emisión esté autorizada. |

## Capturas del frontend compilado

| Flujo | Escritorio | Móvil |
| --- | --- | --- |
| Cambio A → B, antes: se queda con 350 µs | [PNG](evidence/remotes-reception/rf-switch-before-desktop.png) | [PNG](evidence/remotes-reception/rf-switch-before-mobile.png) |
| Cambio A → B, después: reconoce 400 µs | [PNG](evidence/remotes-reception/rf-switch-after-desktop.png) | [PNG](evidence/remotes-reception/rf-switch-after-mobile.png) |
| Aprendizaje IR | [PNG](evidence/remotes-reception/aprendizaje-ir-desktop.png) | [PNG](evidence/remotes-reception/aprendizaje-ir-mobile.png) |
| Ficha e historial de señal | [PNG](evidence/remotes-reception/historial-senal-desktop.png) | [PNG](evidence/remotes-reception/historial-senal-mobile.png) |
| Estado absoluto y horario | [Estado](evidence/remotes-reception/clima-desktop.png) · [Horario](evidence/remotes-reception/horarios-desktop.png) | [Estado](evidence/remotes-reception/clima-mobile.png) · [Horario](evidence/remotes-reception/horarios-mobile.png) |
| Gráfica, Severity y plantilla | [Gráfica](evidence/remotes-reception/grafica-severity-desktop.png) · [Plantilla](evidence/remotes-reception/plantilla-desktop.png) | [Gráfica](evidence/remotes-reception/grafica-severity-mobile.png) · [Plantilla](evidence/remotes-reception/plantilla-mobile.png) |
| Catálogo parcial | [PNG](evidence/remotes-reception/biblioteca-parcial-desktop.png) | [PNG](evidence/remotes-reception/biblioteca-parcial-mobile.png) |

## Comprobación pasiva en Athom A y B

1. Registrar por equipo el estado de la entrada ESPHome, versión y fecha de compilación efectivas, servicios RF y entidades nativas IR de recepción y emisión. Comparar con el YAML renderizado, incluidos pines, inversión, filtro, tolerancia, idle y buffer. No incluir claves, direcciones ni señales de la vivienda en el PR.
2. Medir primero en reposo con un receptor seleccionado. Abrir una ventana de aprendizaje y pulsar el mismo botón tres veces con pausas. Correlacionar por hora el log físico, el evento RF o IR de ESPHome, la llegada a HA, la candidata y la interfaz. Repetir con el otro receptor y luego alternarlos. Registrar por tramo recuentos de eventos y longitudes.
3. Si ESPHome decodifica el mando y HA no recibe eventos, revisar el paquete y la conexión efectiva. Si HA recibe eventos que HomeManager descarta, comparar protocolo, delimitación, polaridad, duración y la longitud efectiva de cada bloque. Si llega la candidata al navegador, contrastar receptor y sesión. Para protocolo 6, identificar primero la ruta de recepción y transmisión que se usaba anteriormente.
4. Para Philips y Mitsubishi, capturar desde el mando original y comparar el número de tiempos y la forma de onda en ambas placas. La retransmisión desde la aplicación y la respuesta del aparato constituyen otra verificación y quedan pendientes.

## Ejecuciones

- `npm run check`: compilación, TypeScript, contratos y 324 pruebas unitarias aprobadas.
- Regresión de cambio de receptor: 2 fallos reproducidos en la base, 2 aprobados con la corrección.
- Suite de Remotes en Chromium: 46 aprobados en escritorio y móvil. La ejecución dedicada a la generación de capturas aprobó los 8 casos de recursos.
- Códec Python aislado: 5 casos aprobados, incluidos los 2 fallos reproducidos contra la base. Captura compartida con bus y servicio simulados: en la base, 20, 5 y 0 al cerrar la primera sesión. Con la corrección, 20 y 20, con un único 0 al cerrar la última.
- La instalación local del arnés Python de Home Assistant quedó bloqueada en la compilación de `lru-dict` para Windows por falta del compilador MSVC requerido. Los jobs del PR prueban las dos versiones de HA fijadas por el repositorio. Los 28 vectores por versión se comprobaron aparte con tiempos reconstruidos.
