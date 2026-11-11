# Remotes en el PR #113

La rama `claude/plan013-lotes-6-8-9` incorpora los cambios sobre `3ce21c13df44`. Usa el mismo panel Controles, diseñador y reproductor de Home Management. Los controles RF/IR aprendidos se siguen abriendo desde Ajustes → Controles. Los accesos **Controles de estado absoluto** y **Biblioteca IR/RF** están en la misma pantalla.

## Instalar y probar

1. En un entorno desechable con Node 24 y Python 3.13 o superior, obtené la rama y ejecutá `npm ci` y `npm run package`.
2. En una instancia de pruebas compatible con el mínimo de Home Assistant declarado en `hacs.json`, hacé un respaldo e instalá el contenido del ZIP generado bajo `.work/release/` siguiendo la instalación manual de la integración. Reiniciá Home Assistant y recargá el frontend.
3. Para una revisión sin equipos, ejecutá `npm run build` y `npm run dev`. Abrí `/tests/browser/fixtures/remotes-demo.html` en el servidor que indica la consola. El aviso **Demostración con datos sintéticos** identifica la sesión. La página ejecuta el bundle y simula el servidor y Recorder.
4. Para repetir las pruebas, ejecutá `npm run check`, `npx playwright install chromium` y `npm run test:browser`. En Linux, instalá `requirements_test.txt` y ejecutá `npm run test:integration`. Para obtener las capturas de Remotes, definí `HM_REMOTES_EVIDENCE` con una ruta local y ejecutá `npx playwright test tests/rf/resources.browser.spec.mjs`.

## Uso y persistencia

- En aprendizaje RF/IR se puede guardar la captura sin emitir. Se pueden repetir las pruebas, registrar la reacción física por separado y consultar la ficha técnica de cada botón guardado. Las últimas seis pruebas de aprendizaje se conservan en el historial acotado del botón. Si guardás mientras una prueba está en curso, el botón se guarda con los ajustes de captura y el resultado se asocia al terminar la prueba. En RF, **Probar botones** sigue usando la ruta con eco. En IR, **Pruebas e historial** abre las pruebas y verificaciones de cada botón.
- Para crear un estado absoluto, seleccioná un perfil, una señal aprendida válida del mando y un emisor ESPHome IR Proxy. Se verifica el encabezado y checksum al decodificar. El estado solicitado incluye encendido, temperatura, modo, ventilador, lamas y las funciones que expone el perfil. La emisión registrada indica la solicitud al proxy. El aire físico queda sin confirmación hasta que alguien lo compruebe.
- ECONO COOL se habilita en frío. SMART SET guarda y recupera un ajuste dentro de Home Management. Para POWERFUL COOL se vincula una captura específica del mando original, en frío y encendido. La interfaz muestra la hora de fin prevista de 15 minutos. Una emisión absoluta posterior reemplaza esa indicación. El vínculo se comprueba con la huella de la captura.
- **Temporizadores** tiene un formulario para el reloj y el temporizador del mando y otro para horarios recurrentes de Home Management. Cada horario guarda acción, hora, días, zona IANA y una copia del estado absoluto. El protocolo Mitsubishi incluye los campos del reloj y del temporizador nativo en cada trama. Los horarios guardados conservan esos campos de la copia elegida. Podés editar, pausar y eliminar el horario. El programador comprueba la hora una vez por minuto y persiste el intento antes de emitir. Una hora repetida en el cambio de hora se ejecuta una vez. Las horas inexistentes o transcurridas con HA detenido se omiten. Un intento que quedó pendiente por apagado conserva esa indicación.
- El diseñador conserva referencias a botones, lecturas y comandos al previsualizar o aplicar Clásico, Digital, Retro o Futurista. Los cambios de apariencia se aplican al control nombrado y se pueden deshacer. El mismo reproductor muestra las lecturas tanto en el lienzo como en el mando y conserva los controles anclados existentes. El inspector ofrece una gráfica independiente o integrada en una pieza operable, con lectura independiente de la que gobierna el comando.
- Recorder consulta la entidad o el atributo y el período de la pieza. Se usan las marcas temporales de Recorder, huecos, formato y escala. La unidad explícita cambia la presentación. Las unidades se declaran en el sensor o en el inspector. Para un rango de 30 días, la disponibilidad depende de la retención real del Recorder.
- La biblioteca lee archivos locales. Flipper-IRDB admite raw y NEC/NECext. SmartIR admite listas de pulsos y paquetes IR Broadlink básicos. IRremoteESP8266 admite `rawData` y estados Mitsubishi Electric 144 con checksum. Otros formatos aparecen como no admitidos. Podés revisar, seleccionar, importar a un control nuevo o existente y editar sus botones. Se conservan marca, modelo, fuente, entrada, revisión y formato identificado, con el carácter parcial de la importación. La identificación de un modelo es declarativa y la compatibilidad de una señal importada se comprueba con el equipo.
- El estado absoluto y la programación usan un almacén privado y atómico adicional `homemanager.absolute_remotes`, versión 1. Los botones aprendidos y sus asociaciones conservan los modelos de RF, IR y diagnósticos. Los campos de gráfica y procedencia son aditivos. Para volver a una versión anterior después de usar estos campos, restaurá el respaldo completo. El perfil y las capturas crudas se resuelven en el backend.

## Resolución de la auditoría

| Hallazgo | Resolución y verificación |
| --- | --- |
| El horario invertía la acción y perdía la hora al cambiar CLOCK | Borradores independientes y estado de encendido explícito. El recorrido comprueba Apagar, edición a Encender y cambio de reloj con el formulario abierto. |
| Una señal reabierta perdía el historial | RF abre la ficha por botón e IR incluye Pruebas e historial. El almacenamiento de diagnóstico y el guardado directo se ejercitan con fixtures. |
| El aire no mostraba el alcance de sus funciones ni el vencimiento | El perfil declara las capacidades, las filas de programación muestran acción y zona, y POWERFUL COOL muestra su fin previsto cuando hay una solicitud vigente. |
| El período estiraba la misma gráfica y la vista previa divergía | Consulta temporal por período y lectura, render compartido, 1 h / 24 h / 7 días / 30 días, lectura, estilo y escala configurables. |
| Una respuesta tardía de Recorder sobreescribía otra serie | Cada pieza activa retiene su identidad por lectura, atributo y período. La prueba entrega las dos respuestas fuera de orden y comprueba el trazo de la nueva lectura. |
| El diseñador mostraba otra lectura y omitía teclado y herramientas existentes | La demo usa el diseñador, el reproductor y la navegación de producción. Conserva prueba por teclado, anclaje y duplicación de diseño de la rama base. |
| La plantilla se previsualizaba en otro control | Vista previa sobre el diseño seleccionado, aplicación con el nombre visible y opción de cancelar o deshacer. |
| La biblioteca ofrecía completar coincidencias parciales | Cuenta explícita de señales seleccionadas, filas no soportadas identificadas, procedencia y marca de importación parcial. |
| El objetivo táctil de Severity era angosto | Pista vertical con objetivo más ancho, número visible, orientación y valor textual accesibles y restitución del foco por teclado. |
| La navegación del mockup mezclaba comparación y rutas del producto | La demo abre Ajustes → Controles del producto. Los botones de icono conservan nombre accesible y ayuda. |

## Validación física pendiente

Los ensayos sintéticos comprueban la codificación, el checksum, el uso de la ruta de envío y la persistencia. La prueba física anterior con ESPHome IR Proxy documentó el encendido directo de Mitsubishi. En esta rama queda por verificar, con permiso y en la instalación objetivo, la captura semilla, la reproducción integrada por el proxy, cada modo y lamas, ECONO COOL, la captura POWERFUL COOL, el reloj y los temporizadores nativos. También queda por comprobar la recepción y reacción en los Athom A/B y en dispositivos de catálogo. La reconciliación por recepción del mando físico está fuera de este cambio.

Referencias del protocolo y del equipo [IRremoteESP8266](https://github.com/crankyoldgit/IRremoteESP8266/blob/master/src/ir_Mitsubishi.h) y [evidencia previa del repositorio](remotes-evidence.md).
