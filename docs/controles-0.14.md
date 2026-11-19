# Controles 0.14 · etapa 1

La rama `claude/controles-maqueta` parte de `0.13.0-beta.3` (`8b99150`) y lleva a la app la primera parte de la maqueta de controles v14. Todos los campos nuevos son opcionales. Un control guardado con 0.13 se ve y funciona igual.

## Qué incluye

- **Forma de cada pieza.** La pieza conserva su tipo, es decir, lo que hace, y cambia la forma en que se dibuja.

  | Tipo | Formas |
  | --- | --- |
  | Pulsador y secuencia | redondo, cuadrado, píldora, solo símbolo |
  | Encender / apagar | interruptor, luz, redondo, píldora |
  | Barra | termostato con dial de 240°, barras, ventana |
  | Escalones | barras |
  | Perilla | termostato |
  | Modos | segmentos con indicador deslizante, barras |
  | Valor | pantalla, número grande, medidor |
  | Teclado numérico, reproducción, colores, cruceta | detrás de un botón («123» o «⋯») |

  Cada forma envía los mismos botones que la pieza original: toque, arrastre, `+`/`−` y teclado.
- **Ventana.** Tiene cinco tipos: persiana enrollable, veneciana, vertical, dos cortinas y una cortina. En la vertical y en la de una cortina se elige el lado donde se junta. Se ven el cielo, el sol, una nube y un pájaro. Al tocar, la ventana se abre o se cierra desde el borde correcto.
- **Seis estilos de botones.** Normal, Digital, Retro, Colorido, Cristal y Futurista. Se elige uno para todo el control, con un color de acento, y cualquier pieza puede tener su propio estilo. Los temas de 0.13 (Grafito, Claro, Arena, Vidrio) y las plantillas siguen disponibles. Mientras no se elija un estilo, el control se ve igual que antes.
- **Movimiento del símbolo.** Opciones: gira, gira lento, titila, flota, late y se mece. Se mueve mientras la pieza está activa o siempre. En Modos, cada opción tiene su propio color y su propio movimiento mientras está elegida. Con «reducir movimiento» activado en el sistema, todo queda quieto.
- **Inspector.** La sección «Estilo» de Aspecto muestra una fila de símbolos con el nombre al pasar el mouse. El lienzo tiene «Estilo de los botones» con vista previa y color de acento. Las opciones de Modos tienen color y movimiento.
- **RF: ruido de fondo.** Un receptor sin nada que escuchar capta ruido: ráfagas de pulsos al azar, muchos de menos de 100 µs. Antes, cada ráfaga contaba como «señal no reconocida» y cambiaba el gráfico dos o tres veces por segundo. Ahora pasa esto:
  - Una trama que no se decodifica cuenta como ruido de fondo si más de la mitad de sus pulsos duran menos de 150 µs o si al menos uno de cada ocho dura menos de 100 µs. Ningún control real, ni siquiera uno de un protocolo no admitido, manda pulsos tan cortos. Nunca se descarta una trama que se decodifica.
  - El ruido se informa cada 5 s como máximo y no genera muestra ni gráfico. En la pantalla aparece un único símbolo quieto con el nombre al pasar el mouse.
  - Una señal real que no se reconoce queda fija en pantalla mientras dura el aviso.

## Contrato

- `ControlPiece` suma `form`, `style`, `accent` (solo el lienzo), `symAnim`, `symWhen`, `win` y `winSide` (solo con `form: "window"`), y `options[].color` y `options[].anim`.
- La validación está en tres lugares y coincide en los mismos casos de `tests/fixtures/designer-look.json`:
  - `piece_look.py`;
  - `src/ha/validation.mjs`;
  - `schemas/catalog.schema.json`.
- Con un tipo nuevo, una pieza solo conserva una forma que ese tipo admita. Cambiar a una forma que no sea ventana borra el tipo y el lado de la ventana.

## Probar

1. Demostración local: ejecutá `npm run build` y `npm run dev`, y abrí `/tests/browser/fixtures/remotes-demo.html`.
2. Home Assistant:
   1. Ejecutá `npm run package`.
   2. Hacé un respaldo.
   3. Instalá a mano el contenido de `.work/release/homemanager.zip` en `custom_components/homemanager`.
   4. Reiniciá Home Assistant.

   El ZIP no se publica como versión.

## Inventario: app actual y maqueta

| Hoy en la app | Con la maqueta |
| --- | --- |
| Aprender RF/IR con historial, ficha técnica y pruebas | Se mantiene. La guía de creación lo va a usar paso a paso. |
| Estado absoluto Mitsubishi (SMART SET, POWERFUL, ECONO, temporizadores, horarios) | Se mantiene. Falta el botón destacado «Enviar estado» (etapa 3). |
| Biblioteca IR/RF (Flipper, SmartIR, IRremoteESP8266) | Se mantiene. Falta el módulo para subir bibliotecas y el reconocimiento automático (etapa 4). |
| Diseñador: catálogo por categorías, bloques, marcas, secuencias, lecturas, gráficas, piezas ancladas | Se mantiene. El catálogo se unifica como en v14 (etapa 2). |
| Temas y plantillas Clásico / Digital / Retro / Futurista | Conviven con los seis estilos. En la etapa 3 las plantillas pasan a ser los diseños de partida Clásico, Moderno y Avanzado, intercambiables. |
| Botón «Diseñar» del control | Pasa a decir «Editar» (etapa 2). |
| «Un botón que rota» | Se mantiene, pero no se sugiere para IR/RF porque el aparato no confirma qué recibió. |

## Próximas etapas

1. **Catálogo y edición.**
   - Un solo catálogo de botones; cada botón es configurable.
   - «Qué controla» solo para aparatos con estado.
   - Botones de plantilla sin aprender con «!», que se pueden aprender ahí mismo.
   - Cambios marcados en amarillo con «Aceptar todo».
   - «Editar» en lugar de «Diseñar».
2. **Guía de creación.**
   - Pasos: tipo de aparato, diseño de partida, aprender de a uno, botones extra y nombre.
   - El diseño Clásico, Moderno o Avanzado se puede cambiar después.
   - «Enviar estado» en el aire.
   - Ayuda «?» por botón.
3. **Dispositivos y bibliotecas.**
   - El selector real de dispositivos (`src/editor/device-picker.ts`) dentro del control.
   - Subir bibliotecas y reconocer el modelo.
   - Rutinas del robot y programas del aire.
4. **Auditoría completa** con la cuenta real, en PC y teléfono, en los seis estilos y con HA claro y oscuro.
