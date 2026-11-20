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

## Etapa 2 · lista de trabajo

Sale de la maqueta v14 (pantalla 4, «Editor del control», y las notas de las versiones 8, 9, 12, 13 y 14). Se publica junto con las etapas 3 y 4.

1. **«Editar», no «Diseñar».** El botón del control, el título del editor y la pestaña dicen «Editar»; la otra pestaña sigue siendo «Probar».
2. **Guardar al final.**
   - Los cambios quedan en borrador. Arriba, una franja «Editando el control de …» con Deshacer, Descartar cambios y Guardar.
   - Si salís con cambios sin guardar, pregunta: seguir editando, descartar o guardar.
   - Deshacer y rehacer siguen en el lienzo.
3. **Panel «Editar control»** (sin nada elegido), con estos módulos:
   - **Botones aprendidos:** cuántos y cuántos sin usar. Cada uno dice qué botón del control lo usa o «Sin usar» con «+» para ponerlo; «›» abre el botón que lo usa. Al final, «Aprender un botón más».
   - **Botones de este control:** cada uno con su nombre y su tipo; tocarlo lo abre. Al final, «Botón nuevo».
   - **Estilo y lienzo:** columnas y filas, separación, esquinas, tema, plantillas, color del cuerpo, estilo de los botones y acento, con un resumen («Normal · 4 × 10»).
   - **Más:** copiar el diseño de otro control, copiar este, duplicar para otro aparato y volver al inicio.
   - El catálogo de la izquierda (Aprendidos, Elementos, Bloques, Marcas) desaparece; todo eso queda en estos módulos y en «Botón nuevo».
4. **Cada botón se edita por pasos.**
   - Cabecera con volver, nombre, tipo, duplicar y quitar.
   - Pasos: 1 Qué botón es · 2 Forma y tamaño · 3 Aspecto · 4 Qué hace · 5 Gestos · 6 Qué muestra. Cada uno con su resumen en una línea.
   - Un paso abierto tiene Descartar y Aceptar. Un paso con cambios sin aceptar queda amarillo con un punto. Abajo aparecen «Aceptar todo» y «Descartar todo».
   - Sólo pregunta al irte de ese botón con cambios sin aceptar.
5. **Un solo catálogo** en «Qué botón es» y en «Botón nuevo», con cinco pestañas y un número que dice cuántos hay ya en el control:
   - **Botones:** Botón, Prender / apagar, Secuencia y Botón de app.
   - **Grupos:** Cruceta, Teclado numérico, Reproducción, Colores y Fila de botones.
   - **Niveles y listas:** Nivel y Opciones.
   - **Información:** Valor, Gráfica, Título y Separador.
   - **Especiales:** Ventana. La pantalla del aire, los programas y «Reenviar» llegan en la etapa 3; las rutinas y la limpieza por ambientes, en la 4.
6. **Nivel y Opciones son un tipo cada uno.**
   - Subir / bajar, barra, escalones y perilla pasan a ser formas del Nivel, en «Forma y tamaño».
   - En «Qué hace», los valores son Números, Nombres o «Sólo sube y baja».
   - Botones, lista y «un botón que pasa al siguiente» son formas de Opciones.
7. **Botón con una sola lista «Envía».** Al elegir un botón aprendido, si la pieza no tiene nombre ni símbolo propios, los toma de ese botón.
8. **«Qué controla»** aparece sólo en los aparatos con estado (aire con estado completo); en controles comunes por infrarrojo o radio no aparece.
9. **Botones sin aprender («!»).**
   - Un botón del control puede esperar un botón que todavía no se aprendió. En el control queda inactivo con «!» y, al tocarlo, avisa que falta aprenderlo.
   - En el editor, «Botones aprendidos» los muestra como «Sin aprender», con el ícono de señal para aprenderlos ahí mismo.
   - En Controles, cada control muestra «Sin aprender».
   - La validación se suma en los tres lugares (tarjeta, integración y esquema), con casos compartidos.
10. **Verificación:** pruebas automáticas y recorrido en PC y teléfono, en HA claro y oscuro, con los seis estilos. No se pierde ninguna función del editor actual.

### Estado de la etapa 2

Hecha en la rama `claude/controles-etapa2`, sin publicar. Se publica junto con las etapas 3 y 4.

- **Hecho:** los puntos 1 a 9.
  - En el teléfono, el lienzo va arriba y el panel debajo.
  - El catálogo de la izquierda se fue sin perder nada:
    - Aprendidos → módulo «Botones aprendidos».
    - Elementos y Bloques → «Botón nuevo».
    - Marcas → «Botón de app», donde se elige la marca en «Qué hace».
  - El diseño automático y duplicar pasaron a «Más».
- **No entra en esta etapa:**
  - «Fila de botones» y «Botón «más»» como tipos propios. Hoy existe «Detrás de un botón» como forma de los grupos.
  - «Traer el diseño de otro control». Hoy se puede copiar el diseño de este control a otro.
- La lista «Sin aprender» está en la página de los controles de radio y de los infrarrojos.
- **Arreglo de paso:** «Ctrl+D» sobre el lienzo duplicaba dos veces una vez que se guarda al final.

## Etapa 3 · lista de trabajo

Sale de la maqueta v14 (pantalla 3, «Crear un control nuevo», y las notas de las versiones 8 a 12).

1. **Plantillas por aparato** para Aire, Tele, Luz, Ventilador y Cortina, cada una en Clásico, Moderno y Avanzado.
   - Se arman con las piezas de la app y piden los mismos botones, en el mismo orden, que la maqueta. Por ejemplo, el Aire Moderno pide 22 botones y el Ventilador, 7.
   - Cada botón de la plantilla es un botón sin aprender («!») hasta que se aprende.
2. **Guía «Control nuevo» de 5 pasos**, para radio e infrarrojo:
   1. Qué aparato es (o «Sin plantilla»), cómo se controla (radio o infrarrojo) y con qué equipo.
   2. Diseño de partida: Clásico, Moderno o Avanzado, con vista previa y cuántos botones tiene y cuántos hay que aprender.
   3. Aprender los botones de a uno. Cada uno se escucha, se prueba, se repite o se saltea si tu control no lo tiene. La vista previa se va encendiendo y la lista muestra cuáles se aprendieron y cuáles se saltearon.
   4. Botones extra que tu control tiene y la plantilla no (es opcional).
   5. Nombre y resumen. «Crear y editar» abre el editor con el control armado. Los botones salteados quedan con «!».
   - Cada paso tiene Atrás. Si salís sin terminar, pregunta.
3. **Diseño después.** En el editor, el módulo «Diseño» muestra Clásico, Moderno y Avanzado del aparato, con vista previa.
   - Cambiar de diseño conserva los botones aprendidos, porque los busca por nombre.
   - Pregunta antes, porque reemplaza el acomodo, y se puede deshacer.
4. **Aire con estado completo:**
   - «Reenviar estado» como botón destacado del control: vuelve a mandar todo el estado sin cambiar nada.
   - «Pantalla del aire» como pieza especial: modo, temperatura pedida y ventilación.
5. **Ayuda «?» en cada control.** Numera cada botón y abajo dice en una frase qué hace. Está en Probar y en el control.
6. **Verificación:** pruebas automáticas y recorrido en PC y teléfono, con HA claro y oscuro.

Quedan para la etapa 4: «Traer de la biblioteca» al aprender, los programas del aire, el robot y la luz por Home Assistant.

### Estado de la etapa 3

Hecha en la rama `claude/controles-etapa3`, sin publicar.

- **Hecho:** los puntos 1 a 5.
  - Las plantillas están en `src/model/remote-templates.ts`. Se validan en la tarjeta, en la integración y en el esquema con `tests/fixtures/remote-templates.json`, que se regenera con `scripts/remote-templates-fixture.mjs`.
  - La guía sirve para radio e infrarrojo. En el paso 3, el aprendizaje de radio o de infrarrojo recibe el nombre del botón ya escrito.
  - «Sin plantilla» va directo a aprender botones libremente y después al nombre.
- **Diferencias con la maqueta:**
  - La Luz por radio o infrarrojo pide encender/apagar, brillo, tono, noche y temporizador. En la maqueta, la Luz va por Home Assistant.
  - La Tele pide los números de a uno («Número 1» … «Número 0»), porque el teclado necesita un botón por número.
  - Las piezas de datos del Avanzado (valor y gráfica) arrancan sin sensor; se elige en «Qué muestra».
- **Lo que sacó la guía:** el paso «Probar» de la creación anterior. Cada botón se prueba al aprenderlo, y «Probar botones» sigue en la página del control.

## Etapa 4 · lista de trabajo

Sale de la maqueta v14 (notas de las versiones 11, 12 y 14) y de lo que dejó la etapa 3.

1. **Programas del aire.** Hasta seis estados completos guardados; un toque deja el aire así y manda todo. Se ven como una pieza especial del control, y en el panel del aire se guardan, se corren o se quitan. El programa que coincide con el estado queda encendido.
2. **Mis bibliotecas.** Se sube un archivo Flipper-IRDB, SmartIR o IRremoteESP8266 con su nombre, marca y modelo, y queda guardado para usarlo después. Se pueden quitar.
3. **Reconocer.** Al aprender un botón infrarrojo, si la señal coincide con una biblioteca, aparece «Marca · Modelo · coincide N %» con el nombre de ese botón.
4. **Traer de la biblioteca.** En la guía, se traen de una biblioteca los botones que la plantilla pide, cuando sus nombres coinciden.
5. **Rutinas del robot y dispositivos.**
   - En el editor del control de un símbolo del plano, «Especiales» ofrece «Rutinas» con los botones de Home Assistant del aparato, en tarjetas grandes.
   - «Agregar un control al símbolo» usa el mismo selector de dispositivos que el resto de la app.
6. **Verificación:** pruebas automáticas y recorrido.

### Estado de la etapa 4

Hecha en la rama `claude/controles-etapa4`, sin publicar.

- **Hecho:**
  - **Programas del aire:** integración, pieza, panel, prueba y validación.
  - **Mis bibliotecas:** almacén `homemanager.ir_libraries` con 8 bibliotecas como máximo, y comandos `libraries/list|add|remove|entries|match|bring`.
  - **Reconocimiento:** al capturar una señal infrarroja, aparece «Marca · Modelo · coincide N % · «botón»».
  - **«Traer de la biblioteca»** en la guía, con una tabla de nombres equivalentes (`libraryNames`).
  - **«Rutinas»** en Especiales, para los botones de Home Assistant del aparato del símbolo.
  - **Arreglo:** la integración ahora acepta la «Pantalla del aire» en el diseño.
- **«Agregar un control al símbolo»:**
  - El módulo Controles del símbolo muestra sus controles, cada uno con ✕, y el botón «Agregar un control».
  - Ese botón abre un selector con buscador y dos pestañas, «Todos» y «Controles aprendidos». Los controles aparecen agrupados por radio e infrarrojo, con su ícono y cuántos botones tienen; lo que ya está en el símbolo queda marcado.
  - El aparato de Home Assistant del símbolo aparece en «Todos» como ya elegido, porque un símbolo tiene un solo aparato. Se cambia con el selector de dispositivos de siempre.
- **Sin cambios:** la Luz por Home Assistant ya se maneja desde el editor del símbolo, con sus acciones de Home Assistant.

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

## Control de calidad y diferencias con la maqueta (0.14.0-beta.5 y beta.6)

La revisión completa del plan, la maqueta v14 y los cambios #117 a #120 encontró 11 errores, arreglados en 0.14.0-beta.5, y 10 diferencias con la maqueta. El propietario eligió las diez como la maqueta (0.14.0-beta.6):

| | Diferencia | Cómo quedó |
|---|---|---|
| A | «?» de la ayuda | En la esquina de arriba a la derecha del control; no en las vistas previas. |
| B | «Agregar un control» | Lista con buscador dentro del panel del símbolo, no una ventana. |
| C | Salir de la guía a la mitad | Con botones aprendidos, la ✕ pregunta: Seguir, Descartar o Guardar lo aprendido. |
| D | Lápiz en los botones de Controles | Abre el botón en el editor; uno sin usar se agrega como borrador. |
| E | «Traer de la biblioteca» | Pestaña fija en el paso 3 por infrarrojo; sin bibliotecas, lleva a agregar una. |
| F | Modos sólo con símbolo | Así arrancan en Moderno y Avanzado; el Clásico conserva las palabras. |
| G | Paso «Gestos» | También en interruptores, modos, listas y atajos (mantener: nada u otro botón). |
| H | «Diseño» dice cuál | Reconoce el diseño en uso comparando las piezas; «con cambios» o «A medida». |
| I | Interruptor por biblioteca | `recognise` en cada biblioteca; las apagadas no se comparan. |
| J | Programas de ejemplo | Dormir, Humedad, Ahorro y Rápido al crear el aire, o una vez en un aire sin programas. |

## Tercera revisión (0.14.0-beta.7)

La tercera revisión encontró 10 errores, 4 diferencias más con la maqueta (K a N) y 12 mejoras propias (P1 a P12). El propietario eligió arreglar primero los errores y las mejoras chicas:

- **Nombres de los botones:** `fitKeys()` en `src/rf/remote-view.ts` prueba, en orden, el nombre al lado del símbolo, el símbolo arriba, lo que distingue al botón (`distinctNames()` en `src/model/names.ts`) y sólo el símbolo con el nombre en `title`. En un botón redondo cuenta el cuadrado dentro del círculo.
- **Símbolo por el nombre:** `iconFromName()` en `src/ui/remote-keys.ts` reemplaza la mano que tenían todos los botones sin símbolo.
- **Desplegables:** `foldStyles()` en `src/ui/side-panel.ts`.
- **Editor:** se sale con ← o ✕; el ✓ flotante ya no está.
- **Pendiente de decidir:** K (iluminar el botón en el paso 3), L (lista del paso 3), M (página «Controls») y N (ficha › «Control»). Las mejoras grandes P2, P3, P4 y P6 van primero en maqueta.
