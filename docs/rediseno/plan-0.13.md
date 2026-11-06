# Plan 0.13 · Rediseño con maquetas

**Origen:** prueba de `v0.12.0-beta.1` por el propietario, 2026-11-05. Las tareas del plan 0.12 estaban hechas, pero la app se ve amateur: mucho texto, botones con frases, pantallas completas sin vista previa, funciones repetidas en varios lugares.

**Maqueta:** [`maqueta-0.13/index.html`](maqueta-0.13/index.html) (se abre en el navegador; datos inventados). Arriba se elige cada pantalla y «Notas de diseño» dice qué cambia y qué hay que decidir.

**Estado:** maqueta lista para revisión (versión 3: datos reales de los indicadores, diseñador avanzado, base de controles y comprobaciones). **No se programa nada de 0.13 hasta que el propietario apruebe la maqueta** (por pantalla o completa).

## Reglas de diseño (obligatorias en cada pantalla)

1. **Símbolos, no palabras.** Toda acción es un icono conocido (papelera, ×, lápiz, ↺, ★, ↑↓, unir). La explicación va en una ayuda al pasar el mouse. Esas ayudas se apagan desde Ayuda.
2. **Cero textos aclaratorios.** Si algo necesita explicación larga, va en Ayuda o en un «?». Formatos: «SVG / PNG / JPG».
3. **Panel al costado, nunca pantalla completa**, con **vista previa en vivo** sobre el plano: tamaño, color, forma, vista inicial y Ahora se ven mientras se cambian.
4. **Una sola puerta por función.** Nada duplicado ni secciones de una sola función.
5. **Jerarquía clara:** Casa (selector arriba) → Editar (todo lo que cambia el plano) → Ajustes (alertas, automatizaciones, controles, mantenimiento, ayuda).
6. **Campos alineados y pocas capas.** Nada escondido tres niveles abajo; interruptores e iconos en vez de listas desplegables raras.
7. **Nada parece deshabilitado si se puede usar** (contraste de etiquetas y textos de campos).
8. **No quitar opciones «por el bien del usuario»** (ejemplo: el rojo no se reserva para alertas).

## Cómo se trabaja

1. **Maqueta primero.** Cada pantalla tiene su maqueta HTML; el propietario la usa y la aprueba o la corrige.
2. **Implementación igual a la maqueta.** Mismos iconos, orden, espacios y textos. Si algo no se puede hacer igual, se avisa antes, no después.
3. **Prueba visual obligatoria.**
   - Un tester abre la app real en Chrome y la maqueta con los mismos datos inventados. Lo hace en PC (1440×900) y teléfono (390×844), en claro y oscuro.
   - Saca capturas, las compara lado a lado y lista cada diferencia.
   - Las capturas y la lista van en el PR.
   - Base: [`maqueta-0.13/capturas.cjs`](maqueta-0.13/capturas.cjs), que ya recorre la maqueta, prueba las interacciones y avisa errores.
4. Pruebas de código y CI como siempre (`npm run check`, Playwright, Home Assistant desechable).
5. Un PR por lote, sin fusionar. El propietario prueba una beta al final de cada grupo de lotes que él elija.

## Nueva organización: antes → después

| Hoy (0.12) | En 0.13 |
|---|---|
| — | Menú ☰ arriba del carril de espacios: abre a la izquierda todas las secciones de Editar y Ajustes; cada una se abre en el panel de la derecha |
| Ajustes › Hogares | Selector de casa arriba a la izquierda: cambiar, crear, duplicar, renombrar, borrar |
| Ajustes › Apariencia (claro/oscuro) | Botón ☀/🌙 en la barra principal |
| Ajustes › Apariencia (capas, vínculo, cuadrícula) | Editar › Tamaño y vista |
| Ajustes › Tamaño y vista inicial | Editar › Tamaño y vista, con curva, zoom de prueba y marco de la vista inicial |
| Ajustes › Plano y espacios + Alternativas del plano | Editar › Plano: imágenes claro/oscuro con ★ principal, espacios y herramientas de dibujo |
| Ajustes › Conectar con Home Assistant | En Editar › Plano: «Traer áreas de Home Assistant» y «Crear esta área en Home Assistant» por espacio |
| «Agregar espacio sin dibujarlo», «Revisar espacios contra el plano» | Se eliminan |
| Ajustes › Panel Ahora | Editar › Ahora: se edita en el mismo panel, con bloques, galería y ↺ |
| Ajustes › Reglas | Ajustes › **Alertas**, con armado en forma de frase y guía paso a paso |
| — | Ajustes › **Automatizaciones** (nuevo) |
| Ajustes › Controles RF | Ajustes › Controles RF (lista con iconos) |
| Ajustes › Estado de la casa + Avanzado › Referencias pendientes | Ajustes › Estado de la casa, con filtros |
| Ajustes › Almacenamiento + Copias | Ajustes › Datos y copias |
| Avanzado › Acciones lógicas | Pasos «Hacer» de Automatizaciones (decisión pendiente) |
| Avanzado › Paneles avanzados | Diseñador de controles (decisión pendiente) |
| ⚙ dentro de la barra de edición | Se quita: Ajustes sólo fuera de la edición |
| Filtros: controles, energía, sensores, infraestructura… | Dos: Dispositivos e Infraestructura |
| Ficha: «Capa: auto», «Origen del estado» | Interruptor «Infraestructura»; el estado sale del dispositivo vinculado |
| Ficha: tamaño Small/Medium/Large | Sólo %, con número y vista en vivo |
| Ficha: «Valores en el plano» | **Indicadores**: anillo, borde, color del icono, LED, número y etiqueta, cada uno con su lectura y color fijo, por rango o por estado |
| Controles RF (pantalla actual) + Remotes de #107 | Controles RF/IR con el mismo estilo: equipos, asistente Control → Aprender → Probar → Diseñar, ficha técnica y diseñador nuevo |

## Lotes

Cada lote cierra con la prueba visual contra la maqueta.

| Lote | Qué incluye |
|---|---|
| **0 · Aprobación** | El propietario revisa la maqueta y contesta las decisiones de abajo. |
| **1 · Base** | <ul><li>Colores con buen contraste.</li><li>Botón-icono con ayuda al pasar el mouse, que se puede apagar.</li><li>Panel lateral único: Ajustes deja de ser pantalla completa.</li><li>Barra principal: casa, ☀/🌙, ✎, ⛶, ⚙.</li><li>Barra de edición ámbar sin texto, con borde limpio.</li><li>Dos filtros y la nueva marca de vínculo.</li><li>Se quitan los 41 textos aclaratorios y los 98 botones con palabras pasan a iconos.</li><li>Arreglos de errores: importar reconoce el archivo por su contenido y acepta JSON / SVG / PNG / JPG (hoy da «Unexpected token <»); tocar otro símbolo cambia la ficha; Editar zonas sólo existe dentro de Editar.</li></ul> |
| **2 · Ficha del símbolo** | <ul><li>Icono y nombre editables en el título; espacio debajo.</li><li>Interruptor Infraestructura.</li><li>Tamaño y fondo en %; forma con dibujos.</li><li>Paletas de 10 colores, color libre y Mi paleta.</li><li>Módulos como subtítulos, «Agregar» sin repetir y botones del pie con iconos.</li></ul> |
| **2b · Indicadores** | <ul><li>Sistema genérico de elementos visuales sobre el símbolo: anillo con mínimo y máximo, borde, color del icono, LED, número arriba o abajo, etiqueta.</li><li>Cada elemento toma una lectura y elige color fijo, por rango de valores o por estado, con colores editables.</li><li>Vista previa grande con «probar valor» y el plano en vivo.</li><li>Sirve para cualquier sensor o dispositivo.</li><li>Campo nuevo opcional en el contrato, validado en los tres lugares.</li></ul> |
| **3 · Plano y espacios** | <ul><li>Herramientas abajo, como Roborock: elegir, dibujar, agregar parte, dividir, unir, renombrar, borrar y deshacer.</li><li>Conjuntos de imágenes claro/oscuro con principal.</li><li>Traer y crear áreas de Home Assistant.</li><li>Contorno exterior al elegir un espacio.</li></ul> |
| **4 · Ahora** | <ul><li>Editor de bloques en el mismo panel: arrastrar, ancho, ajustes y quitar.</li><li>Galería de bloques, estilo lista, mosaico o gráfico.</li><li>Selector con buscador; ↺ vuelve al estándar.</li></ul> |
| **5 · Tamaño y vista** | <ul><li>Tamaño para la casa y para un espacio, que crece de forma lineal con el zoom.</li><li>Un % por símbolo encima de eso.</li><li>Curva y zoom de prueba.</li><li>Vista inicial con marco; marca de vínculo y cuadrícula.</li></ul> |
| **6 · Alertas** | <ul><li>Cambia el nombre.</li><li>Armado en frase, cómo se ve y dónde.</li><li>Vista previa con el valor actual.</li><li>Guía de cinco pasos.</li><li>Las alertas incluidas aparte.</li></ul> |
| **7 · Automatizaciones** | <ul><li>Lista con ★ «en la pantalla principal».</li><li>Pasos Cuando → Hacer → Comprobar → Si falla.</li><li>«Comprobar» usa el consumo de energía (coordinar con el módulo que el propietario arma con ChatGPT): reenvía hasta N veces y no reenvía si el medidor no responde.</li><li>«Si falla» dispara una alerta.</li></ul> |
| **8 · Mantenimiento y ayuda** | <ul><li>Estado de la casa con filtros.</li><li>Datos y copias.</li><li>Controles RF.</li><li>Ayuda con buscador, temas y estados.</li></ul> |
| **8b · Controles RF/IR** | <ul><li>Base funcional: el PR #107 (incluye #105 y #106), revisado y fusionado antes como candidato único.</li><li>Lista RF e IR con etiqueta y equipos ESPHome con lo que pueden hacer.</li><li>Asistente de cuatro pasos con animación: el receptor late, la cuenta de 15 s, cada botón aparece con su forma de onda y un nombre sugerido.</li><li>Probar con 👍/👎 y ajustes rápidos (pulso, repeticiones, emisor); comprobaciones opcionales: auto-eco, receptor B, cámara.</li><li>Ficha técnica con portadora, protocolo, tramas, línea de tiempo captura/envío e histograma.</li><li>Diseñador nuevo: el control en grande sobre el plano, elementos que se arrastran y se editan al costado.</li><li>Se conserva todo lo técnico y los vínculos; volver a aprender no rompe nada.</li></ul> |
| **9 · Avanzado** | <ul><li>Llevar Acciones lógicas y Paneles avanzados a su nuevo lugar y quitar la sección.</li><li>Los datos guardados siguen siendo válidos: sólo cambia dónde se editan.</li></ul> |
| **Cierre** | <ul><li>Prueba de punta a punta en un Home Assistant desechable.</li><li>Capturas comparadas.</li><li>Beta para el propietario.</li></ul> |

## Indicadores: de dónde salen los datos y cómo se pintan

Cada indicador (anillo, borde, color del icono, LED, número, etiqueta) tiene una **fuente**: una entidad de Home Assistant y, si hace falta, uno de sus atributos (por ejemplo `cover.cortina` › `current_position`).

**Tipo de dato.** HomeManager lo deduce de la entidad y no lo pregunta:

| Tipo | Cómo se reconoce | Ejemplos |
|---|---|---|
| Número | estado o atributo numérico; `unit_of_measurement` o `state_class: measurement` | temperatura, humedad, potencia, batería, `current_position`, `brightness` |
| Sí / no | dominios `binary_sensor`, `switch`, `light`, `fan`, `input_boolean` (on/off) | conexión, puerta, encendido |
| Estados | lista cerrada: `climate` (`hvac_modes`), `cover`, `vacuum`, `select`/`input_select` (`options`), `sensor` con `device_class: enum` | modo del aire, cortina abierta/cerrada, robot en base |
| Texto | cualquier otro valor | «Living y cocina» |

**Reglas según el tipo.** Las reglas que se muestran dependen del tipo de la fuente:

- **Número:** rangos «de – a» con color y un nombre opcional. Ejemplo: Posición 0 = Cerrada (gris), 1–99 = Entreabierta (naranja), 100 = Abierta (verde).
- **Sí / no:** dos filas con el nombre traducido (Conectado / Desconectado).
- **Estados:** una fila por cada opción que declara la entidad (`open`, `opening`, `closing`, `closed`), con su nombre traducido.
- **Texto:** coincidencia exacta.
- **Siempre**, una fila «Sin dato» para `unavailable`, `unknown` o una lectura vieja.

**Vista previa.** La línea «Ahora» muestra el valor actual y qué regla se cumple. «Probar valor» simula otros valores y el plano cambia en vivo.

**Elementos que necesitan un número.** El anillo y el número sólo aceptan fuentes numéricas: el selector deshabilita las demás y dice por qué.

**Cambiar la fuente.** Al cambiarla, las reglas se rehacen para el tipo nuevo, sin dejar reglas que no encajan.

**Contrato.** Campo nuevo opcional `display.indicators[]` con `{type, source: {entityId, attribute?}, rules, none, …}`, validado en los tres lugares. Un plano viejo sigue igual: la etiqueta de valor actual pasa a ser un indicador «etiqueta».

## Controles RF/IR: lo que agrega la maqueta sobre #107

- **Base de controles (IR).**
  - Con cada botón aprendido, la búsqueda se acota (1.240 → 214 → 37 → 3).
  - Cada perfil se puede **probar** (envía su Encender) o **usar** (trae todos sus botones con nombre y un diseño sugerido).
  - Los nombres se proponen según el perfil.
  - *Abierto:* elegir la fuente de datos (por ejemplo IRDB o Flipper-IRDB) y revisar su licencia.
  - RF de 433 MHz no tiene base útil: sus códigos son propios de cada mando.
- **Comprobaciones con pantalla propia.**
  - **Auto-eco** y **receptor B:** eligen los equipos, abren una ventana de 3 s y comparan captura y recepción (tramas, tiempos, signos, diferencia máxima con tolerancia de 120 µs o 25 %). Dan un veredicto.
  - **Cámara:** tres pasos. Calibrar con el mando original, mirar el LED mientras envía 10 s y anotar Visible / No visible / No concluyente.
  - Sólo se guarda la observación.
- **Diseñador avanzado.**
  - **Lienzo:** columnas × filas a elección. Los elementos se ponen en una celda, se arrastran y se agrandan desde la esquina.
  - **Elementos:**
    - Botón y botón de marca (YouTube, Netflix… con sus colores).
    - Encender/apagar y preset inteligente (secuencia de botones con esperas).
    - Más/menos, perilla, deslizadores vertical y horizontal, pasos y opciones.
    - Lectura y gráfico de un sensor, texto y separador.
  - **Cada elemento:** texto, icono (mostrar u ocultar cada uno), color de fondo y de texto, forma, posición y tamaño.
  - **Relación con lo aprendido:**
    - A la izquierda, la lista de botones aprendidos dice cuántas veces se usa cada uno y marca con «!» los que no se usan.
    - Se arrastran a un elemento (llena su primer lugar libre) o a una celda vacía (crea un botón).
    - En el panel, cada parte del elemento muestra su botón: encender/apagar, menos/más, cada paso, cada opción, cada paso del preset.
  - **Estado que muestra:** «estimado» (el último botón enviado) o «desde un sensor», por ejemplo consumo > 50 W = prendido.
  - *Abierto:* esto se conecta con la comprobación por consumo que se arma aparte.

### Avance de Controles (2026-11-06, PR #109)

- Hecho:
  - #107 revisado e integrado.
  - Panel Controles al costado del plano.
  - Aprender RF e IR con anillo y tarjetas.
  - Paso Probar con 👍/👎 y ajustes; comprobaciones que abren la ficha técnica de #107.
  - Diseñador libre: lienzo de hasta 30 columnas, perilla, preset, gráfico, botón de marca, colores, forma, vertical, bandeja de botones aprendidos y modo prueba.
- Distinto de la maqueta, por ahora:
  - La cuenta de 15 s no existe: el receptor escucha mientras la página está abierta (ventanas de 60 s, hasta 10 min).
  - Auto-eco y receptor B usan la pestaña Emisión de la ficha técnica, no una pantalla propia.
  - El gráfico dibuja las lecturas recibidas desde que se abrió el control; falta pedir el historial a Home Assistant.
  - El estado «desde un sensor» de cada elemento no está.
  - IR aprende en su propia página dentro del panel, todavía sin el paso Probar común.

## Cosas que quedan abiertas a propósito

Se conectan cuando lleguen los módulos que las completan:

- Comprobación por consumo para el estado de los controles y para «Comprobar» en Automatizaciones.
- Fuente y licencia de la base de controles IR.
- Historial de Home Assistant para el elemento gráfico.
- Estado de un elemento del control «desde un sensor» (va con la comprobación por consumo).
- Prueba física con los Athom: IR Send frente al proxy directo, y reacción del televisor Philips (ver #107).

## Decisiones pendientes del propietario

1. ¿La marca de «no vinculado» (aro punteado) se ve en la pantalla normal o sólo al editar?
2. ¿Cuántos atajos junto a un símbolo? (hoy 3)
3. Dividir un espacio: ¿con una línea dibujada a mano, como Roborock, o en mitades?
4. ¿Qué otros bloques querés en Ahora? (cámara, clima exterior, escenas…)
5. ¿«Alertas» está bien como nombre para lo que hoy es «Reglas»?
6. ¿Las automatizaciones viven en HomeManager o se crean como automatizaciones de Home Assistant?
7. Avanzado: ¿de acuerdo con llevar Acciones lógicas a Automatizaciones, Paneles avanzados al Diseñador y Referencias a Estado, y quitar la sección?
8. Indicadores: ¿qué otros elementos querés? (barra, icono que cambia según el estado, animación al prender…)
9. Controles: ¿revisamos y fusionamos primero #107 como base, y después le ponemos el diseño nuevo? (recomendado)
10. ¿Plantillas por marca al crear un control (Mitsubishi, Philips…)?

## Qué no cambia

- Los planos, símbolos, controles RF y reglas guardados siguen funcionando. Ningún cambio borra datos.
- Repositorio público: maquetas y pruebas sólo con datos inventados.
- Pruebas de punta a punta sólo en un Home Assistant desechable.
- Nada se fusiona ni se publica sin pedido del propietario.
