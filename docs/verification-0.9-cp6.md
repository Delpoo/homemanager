# CP6 · RF y diálogos · verificación visual

El CP6 inicial se entregó en el PR #33 y fue fusionado por el propietario como `f008850`, incluyendo su mejora `128e50f` para leer los nombres RF en móvil. La revisión adicional continúa en `chatgpt/0.9-rf-dialogs-followup`, desde ese `main`, conservando la mejora. Se hereda la versión 0.9.0-beta.3; el seguimiento no modifica versión ni CHANGELOG. Su alcance son dos correcciones en los componentes compartidos y RF: foco tras cancelar y ancho del grupo Tipo. No implica que toda la etapa 0.9 esté terminada.

## Ejecución y arquitectura

1. Leer roadmap 0.9 y abrir en navegador la maqueta §6, §10 y §11.
2. Reutilizar tokens y componentes existentes; añadir campos, ayudas, acciones, diálogos y composición RF en `src/ui/`.
3. Reemplazar estilos locales en RF y en el bloque de creación de hogar. Mantener captura, envío, guardado, roles, geometría del diseñador y YAML.
4. Verificar regresiones, temas, móvil, textos visibles y frontera pública; capturar cada vista junto a su referencia.
5. Abrir PR borrador después de pasar la verificación local. Sin merge ni publicación.

La implementación nueva se reparte entre `panel-components.ts` (campos/ayudas, acciones, diálogo y hoja), `rf-components.ts` (composición RF y representación de su cuadrícula) y `home-start.ts` (estado vacío y creación). Las pantallas RF no contienen estilos, colores propios ni escrituras de geometría CSS. Las hojas de componentes se adoptan una vez por raíz; los hijos RF heredan el tema del contenedor. Los iconos y tokens siguen siendo los de HomeManager.

Las traducciones nuevas se agregan en `src/i18n/en-rf.ts` y `en.ts`, como parte de la aclaración del propietario de resolverlo con la arquitectura global. Los únicos apoyos fuera de la lista de código de producto son pruebas, fixtures sintéticos, evidencia y su lista exacta de imágenes permitidas. No se modifica editor, card, model, contrato, validadores, integración Python, ESPHome, versión ni CHANGELOG.

## Comportamiento conservado

- El envío sigue diciendo **Enviado**; el eco **en el aire** conserva su significado. Una llamada aceptada no prueba la reacción del equipo. **Señal reconocida** describe sólo una captura coincidente.
- Timers, criterios de captura, intentos, números, payloads, servicios, roles y almacenamiento no cambian.
- `packageYaml` conserva sus líneas y sustituciones; no se añade ninguna operación sobre ESPHome. D19 sigue pendiente.
- La cuadrícula del diseñador conserva cuatro columnas, filas de 64 px y separación de 10 px; el cálculo de arrastre, teclado y tamaño no cambia.
- El diálogo conserva resultado booleano, foco inicial en Cancelar, Esc, ciclo de tabulación y retorno al disparador. Los flujos probados no superponen diálogos.
- Nuevo hogar conserva el identificador explícito y la creación local hasta el primer guardado; la carga del plano sigue después.

## Pruebas y datos

El servidor RF simulado se extrae sin cambiar su semántica a `tests/browser/fixtures/rf-server.js` y se comparte entre la regresión existente y CP6. Los controles, equipos, plano y señales son inventados. No se accede a la vivienda ni se envía RF físico. Los iconos de la simulación usan vectores MDI 7.4.47 con su licencia; producción sigue usando `ha-icon` de Home Assistant.

Las pruebas RF existentes mantienen las comprobaciones de servicios, payloads, roles, diseño, llamadas y YAML exacto. Se ajustan únicamente etiquetas visibles y accesibles, apertura explícita del detalle ahora plegado y apertura de Más opciones antes de elegir receptor. Las pruebas de hogar/E2E apuntan al mismo campo, ahora llamado Nombre del hogar. No se relaja una comprobación funcional.

CP6 añade un recorrido de navegador en las dos resoluciones y los dos temas. Recorre lista, creación, envío, aprendizaje, captura, prueba, diseñador, elemento, funciones, avanzado, confirmar, equipos, YAML y hogares. Escanea texto visible, opciones seleccionadas y valores editables: falla con `_`, patrones de `entity_id` o vocabulario técnico de la lista de la prueba. La única excepción es `pre[data-yaml]`. Los nombres del fixture incluyen guiones bajos deliberadamente: se limpian sólo para mostrarlos. Un segundo caso comprueba que cambiar un icono o un rol conserva los nombres almacenados exactamente; el adaptador de presentación `rfEditedText` evita que la limpieza visual renombre datos por accidente. También se comprueban las ayudas junto al título, ✓ accesible, ausencia de desbordamiento horizontal, dimensiones PNG y cancelación sin mutaciones. Una prueba de código rechaza estilos, colores y geometría CSS dentro de las pantallas RF.

### Revisión adicional: apariencia global y foco

La revisión posterior al primer cierre reprodujo un fallo en RF: el diálogo devolvía el foco al botón original, pero el dibujo posterior de la pantalla lo reemplazaba por otro nodo. El foco terminaba perdido al cancelar o usar Esc. `keepPanelFocus`, en el componente compartido, conserva la identidad lógica del control mediante sus identificadores estables y mantiene la selección de los campos. RF reutiliza ese mecanismo al dibujarse; no se añaden excepciones a cada acción destructiva.

La nueva prueba comprueba el foco inicial, el ciclo de Tab, Esc, Cancelar y la vuelta al botón recreado, sin cambiar la configuración RF. También comprueba que Claro y Oscuro elegidos en HomeManager prevalecen sobre el tema de HA, y que Automático vuelve a seguirlo. Ambos recorridos pasan en escritorio y móvil. No se cambian los comandos, el almacenamiento ni el criterio de confirmación física.

La comparación visual detectó además una colisión con el selector de categorías agregado en `main`: su clase de cuadrícula `k-choices` estrechaba el grupo Tipo del diseñador RF. El campo agrupado genérico usa ahora `k-fieldset`, separado del selector de tarjetas por categoría. Una comprobación geométrica exige que las opciones ocupen el ancho disponible del diálogo en ambos temas y tamaños; no se sobreescriben los estilos de categorías ni se introducen reglas por pantalla.

### Resultados locales

Verificación del 30/10/2026, sobre la base `f008850` y la implementación final:

| Comprobación | Resultado |
| --- | --- |
| `npm ci --ignore-scripts` | Pasa; 0 vulnerabilidades en la instalación |
| `npm run check` | Pasa: frontera pública, tres contratos, TypeScript y 193 pruebas |
| `npm run format:check` | Pasa |
| `npm run test:browser` | 291 pasan, 3 omisiones previstas de gestos táctiles en escritorio; esos casos corren en móvil |
| RF, CP6 y diálogos compartidos | 32 casos de regresión pasan en escritorio y móvil, sin relajar las comprobaciones RF existentes |
| `python -m pytest -q` · HA 2026.2.3 | 226 pasan |
| `python -m pytest -q` · HA 2026.10.4 | 226 pasan |
| E2E local · HA temporal y bundle final | 13 comprobaciones pasan; vivienda, persistencia, comandos, conflictos, móvil y RF |
| Alcance del diff respecto de `main` | Sin cambios en los directorios excluidos, contrato, versión ni CHANGELOG |

Los dos pytest locales usan una adaptación del entorno de pruebas para los sockets/eventos de Windows, fuera del repositorio publicado. La CI ejecuta las mismas versiones de HA en Linux sin esa adaptación. El E2E ignora cuatro errores de página externos a HomeManager mediante su filtro existente; los errores de HomeManager siguen siendo fallos. Son pruebas sintéticas/de integración, no evidencia de ejecución RF ni reacción de hardware real.

### Auditoría por pedido

| Pedido | Evidencia |
| --- | --- |
| Lista, control, aprendizaje y diseñador con el mismo diseño | Componentes compartidos, recorrido CP6 y las comparaciones de cada vista más abajo |
| Equipos con un estado y una acción principal | Capturas Equipos y prueba RF existente; secundarias en Más opciones |
| Confirmación, Nuevo hogar y vacío con el marco común | Capturas en ambos temas y tamaños; regresión de foco, cancelación y roles |
| Sin estilos ni colores de pantalla nuevos | `cp6-presentation.test.mjs`; RF sólo importa los componentes de `src/ui/` |
| Sin «Aplicar…» donde alcanza un icono | ✓ con nombre accesible en el elemento y ajustes; verificación del botón Guardar en navegador |
| Ayudas junto al título | Campos Nombre, Tipo, Pulso y Pausa; verificación DOM y capturas |
| Textos humanos y traducción | Catálogos español/inglés, i18n y escaneo de texto visible incluso con nombres de fixture con `_` |
| Comportamiento RF y YAML conservados | Regresión RF con los mismos valores, servicios, roles y bloque YAML exacto; prueba adicional de nombres almacenados |
| Revisión visual verificable | 76 PNG a las resoluciones pedidas, comparados con §6/§10/§11 y protegidos por hash |

## Evidencia y diferencias

76 PNG: 16 vistas del producto y tres referencias, en 1440×900 y 390×844, claro y oscuro. Cada archivo tiene hash SHA-256 en `docs/public-assets.json`. La admisión pública permite sólo nombres exactos de este conjunto y sus bytes revisados; una imagen distinta sigue siendo rechazada.

La maqueta §10 es un lienzo de escritorio de ancho fijo: la referencia móvil lo muestra recortado por su propio contenedor. El producto se adapta al ancho del teléfono: riel resumido, aprendizaje arriba y formulario/hoja con desplazamiento vertical. La referencia móvil §6 encuadra su panel claro u oscuro correspondiente. En oscuro se activa la variante oscura ya incluida en los ejemplos de la maqueta, sin editar el documento. Las diferencias de datos (nombres, cantidad de botones, estado) se deben exclusivamente al fixture inventado.

Se conserva la navegación existente por pestañas para Equipos; la maqueta los dibuja debajo como otro ejemplo. La cabecera usa la actividad real disponible: no inventa «Aprendiendo», estado en línea, puntos de confirmación ni progreso de tres pasos. El aprendizaje mantiene sus controles y criterio de coincidencia existentes; no añade Saltar ni cambia el número de señales exigidas. Nuevo hogar sigue siendo un bloque de página con el marco del diálogo, sin introducir una nueva modalidad. Estas diferencias preservan el alcance de diseño de CP6.

### Lista de controles

§10. La lista queda en el riel; el centro pide elegir un control en vez de abrir uno automáticamente. Conserva la selección explícita existente.

| Tamaño / tema | Producto | Maqueta |
| --- | --- | --- |
| 1440×900 · claro | ![Lista de controles desktop-light](evidence/0.9-cp6/desktop-light-list.png) | ![Referencia desktop-light](evidence/0.9-cp6/desktop-light-reference-rf.png) |
| 1440×900 · oscuro | ![Lista de controles desktop-dark](evidence/0.9-cp6/desktop-dark-list.png) | ![Referencia desktop-dark](evidence/0.9-cp6/desktop-dark-reference-rf.png) |
| 390×844 · claro | ![Lista de controles mobile-light](evidence/0.9-cp6/mobile-light-list.png) | ![Referencia mobile-light](evidence/0.9-cp6/mobile-light-reference-rf.png) |
| 390×844 · oscuro | ![Lista de controles mobile-dark](evidence/0.9-cp6/mobile-dark-list.png) | ![Referencia mobile-dark](evidence/0.9-cp6/mobile-dark-reference-rf.png) |

### Nuevo control

§6. No hay una pantalla específica en la maqueta: campo con ayuda junto al título, selector de iconos y acciones compartidas. Agregar a la maqueta.

| Tamaño / tema | Producto | Maqueta |
| --- | --- | --- |
| 1440×900 · claro | ![Nuevo control desktop-light](evidence/0.9-cp6/desktop-light-new.png) | ![Referencia desktop-light](evidence/0.9-cp6/desktop-light-reference-components.png) |
| 1440×900 · oscuro | ![Nuevo control desktop-dark](evidence/0.9-cp6/desktop-dark-new.png) | ![Referencia desktop-dark](evidence/0.9-cp6/desktop-dark-reference-components.png) |
| 390×844 · claro | ![Nuevo control mobile-light](evidence/0.9-cp6/mobile-light-new.png) | ![Referencia mobile-light](evidence/0.9-cp6/mobile-light-reference-components.png) |
| 390×844 · oscuro | ![Nuevo control mobile-dark](evidence/0.9-cp6/mobile-dark-new.png) | ![Referencia mobile-dark](evidence/0.9-cp6/mobile-dark-reference-components.png) |

### Control

§10. Se conserva la cuadrícula persistida de cuatro columnas, no las tres del ejemplo: cambiarla reubicaría elementos guardados. Se conserva la mejora del propietario para mostrar los nombres largos en varias líneas en móvil, además de su nombre accesible completo.

| Tamaño / tema | Producto | Maqueta |
| --- | --- | --- |
| 1440×900 · claro | ![Control desktop-light](evidence/0.9-cp6/desktop-light-remote.png) | ![Referencia desktop-light](evidence/0.9-cp6/desktop-light-reference-rf.png) |
| 1440×900 · oscuro | ![Control desktop-dark](evidence/0.9-cp6/desktop-dark-remote.png) | ![Referencia desktop-dark](evidence/0.9-cp6/desktop-dark-reference-rf.png) |
| 390×844 · claro | ![Control mobile-light](evidence/0.9-cp6/mobile-light-remote.png) | ![Referencia mobile-light](evidence/0.9-cp6/mobile-light-reference-rf.png) |
| 390×844 · oscuro | ![Control mobile-dark](evidence/0.9-cp6/mobile-dark-remote.png) | ![Referencia mobile-dark](evidence/0.9-cp6/mobile-dark-reference-rf.png) |

### Escucha

§10. Receptor seleccionable y aprendizaje existentes, con detalles de señal plegados. En móvil aparece primero el aprendizaje y debajo el control.

| Tamaño / tema | Producto | Maqueta |
| --- | --- | --- |
| 1440×900 · claro | ![Escucha desktop-light](evidence/0.9-cp6/desktop-light-learn.png) | ![Referencia desktop-light](evidence/0.9-cp6/desktop-light-reference-rf.png) |
| 1440×900 · oscuro | ![Escucha desktop-dark](evidence/0.9-cp6/desktop-dark-learn.png) | ![Referencia desktop-dark](evidence/0.9-cp6/desktop-dark-reference-rf.png) |
| 390×844 · claro | ![Escucha mobile-light](evidence/0.9-cp6/mobile-light-learn.png) | ![Referencia mobile-light](evidence/0.9-cp6/mobile-light-reference-rf.png) |
| 390×844 · oscuro | ![Escucha mobile-dark](evidence/0.9-cp6/mobile-dark-learn.png) | ![Referencia mobile-dark](evidence/0.9-cp6/mobile-dark-reference-rf.png) |

### Señal reconocida

§10. Se conserva el criterio de reconocimiento; la etiqueta describe la captura, sin afirmar el estado físico. Los números detallados quedan plegados.

| Tamaño / tema | Producto | Maqueta |
| --- | --- | --- |
| 1440×900 · claro | ![Señal reconocida desktop-light](evidence/0.9-cp6/desktop-light-candidate.png) | ![Referencia desktop-light](evidence/0.9-cp6/desktop-light-reference-rf.png) |
| 1440×900 · oscuro | ![Señal reconocida desktop-dark](evidence/0.9-cp6/desktop-dark-candidate.png) | ![Referencia desktop-dark](evidence/0.9-cp6/desktop-dark-reference-rf.png) |
| 390×844 · claro | ![Señal reconocida mobile-light](evidence/0.9-cp6/mobile-light-candidate.png) | ![Referencia mobile-light](evidence/0.9-cp6/mobile-light-reference-rf.png) |
| 390×844 · oscuro | ![Señal reconocida mobile-dark](evidence/0.9-cp6/mobile-dark-candidate.png) | ![Referencia mobile-dark](evidence/0.9-cp6/mobile-dark-reference-rf.png) |

### Prueba de señal

§10 + §6. La pregunta de reacción del equipo permanece y no supone confirmación por envío. El detalle desplegado muestra tipo, tamaño y pulso sin identificadores.

| Tamaño / tema | Producto | Maqueta |
| --- | --- | --- |
| 1440×900 · claro | ![Prueba de señal desktop-light](evidence/0.9-cp6/desktop-light-trial.png) | ![Referencia desktop-light](evidence/0.9-cp6/desktop-light-reference-rf.png) |
| 1440×900 · oscuro | ![Prueba de señal desktop-dark](evidence/0.9-cp6/desktop-dark-trial.png) | ![Referencia desktop-dark](evidence/0.9-cp6/desktop-dark-reference-rf.png) |
| 390×844 · claro | ![Prueba de señal mobile-light](evidence/0.9-cp6/mobile-light-trial.png) | ![Referencia mobile-light](evidence/0.9-cp6/mobile-light-reference-rf.png) |
| 390×844 · oscuro | ![Prueba de señal mobile-dark](evidence/0.9-cp6/mobile-dark-trial.png) | ![Referencia mobile-dark](evidence/0.9-cp6/mobile-dark-reference-rf.png) |

### Diseñador

§10 + §6. La maqueta no especifica el diseñador completo: mismos campos, cuadrícula y manejadores de arrastre existentes, con componentes compartidos. Agregar esta vista a la maqueta.

| Tamaño / tema | Producto | Maqueta |
| --- | --- | --- |
| 1440×900 · claro | ![Diseñador desktop-light](evidence/0.9-cp6/desktop-light-designer.png) | ![Referencia desktop-light](evidence/0.9-cp6/desktop-light-reference-rf.png) |
| 1440×900 · oscuro | ![Diseñador desktop-dark](evidence/0.9-cp6/desktop-dark-designer.png) | ![Referencia desktop-dark](evidence/0.9-cp6/desktop-dark-reference-rf.png) |
| 390×844 · claro | ![Diseñador mobile-light](evidence/0.9-cp6/mobile-light-designer.png) | ![Referencia mobile-light](evidence/0.9-cp6/mobile-light-reference-rf.png) |
| 390×844 · oscuro | ![Diseñador mobile-dark](evidence/0.9-cp6/mobile-dark-designer.png) | ![Referencia mobile-dark](evidence/0.9-cp6/mobile-dark-reference-rf.png) |

### Elemento del control

§11 + §6. El formulario conserva tipos, asignaciones y tamaños. Guardar se representa por ✓ con nombre accesible; los tipos tienen su ayuda junto al título. Agregar esta variante a la maqueta.

| Tamaño / tema | Producto | Maqueta |
| --- | --- | --- |
| 1440×900 · claro | ![Elemento del control desktop-light](evidence/0.9-cp6/desktop-light-widget.png) | ![Referencia desktop-light](evidence/0.9-cp6/desktop-light-reference-dialogs.png) |
| 1440×900 · oscuro | ![Elemento del control desktop-dark](evidence/0.9-cp6/desktop-dark-widget.png) | ![Referencia desktop-dark](evidence/0.9-cp6/desktop-dark-reference-dialogs.png) |
| 390×844 · claro | ![Elemento del control mobile-light](evidence/0.9-cp6/mobile-light-widget.png) | ![Referencia mobile-light](evidence/0.9-cp6/mobile-light-reference-dialogs.png) |
| 390×844 · oscuro | ![Elemento del control mobile-dark](evidence/0.9-cp6/mobile-dark-widget.png) | ![Referencia mobile-dark](evidence/0.9-cp6/mobile-dark-reference-dialogs.png) |

### Funciones en Home Assistant

§6. Sin pantalla específica en la maqueta: filas, campos y selectores compartidos para las asignaciones existentes. No se cambian roles ni entidades. Agregar a la maqueta.

| Tamaño / tema | Producto | Maqueta |
| --- | --- | --- |
| 1440×900 · claro | ![Funciones en Home Assistant desktop-light](evidence/0.9-cp6/desktop-light-roles.png) | ![Referencia desktop-light](evidence/0.9-cp6/desktop-light-reference-components.png) |
| 1440×900 · oscuro | ![Funciones en Home Assistant desktop-dark](evidence/0.9-cp6/desktop-dark-roles.png) | ![Referencia desktop-dark](evidence/0.9-cp6/desktop-dark-reference-components.png) |
| 390×844 · claro | ![Funciones en Home Assistant mobile-light](evidence/0.9-cp6/mobile-light-roles.png) | ![Referencia mobile-light](evidence/0.9-cp6/mobile-light-reference-components.png) |
| 390×844 · oscuro | ![Funciones en Home Assistant mobile-dark](evidence/0.9-cp6/mobile-dark-roles.png) | ![Referencia mobile-dark](evidence/0.9-cp6/mobile-dark-reference-components.png) |

### Ajustes avanzados

§6. Sin pantalla específica: plegable y campos compartidos. Pulso y pausa conservan límites/valores; sus ayudas están junto al título. Guardar ajustes es ✓. Agregar a la maqueta.

| Tamaño / tema | Producto | Maqueta |
| --- | --- | --- |
| 1440×900 · claro | ![Ajustes avanzados desktop-light](evidence/0.9-cp6/desktop-light-settings.png) | ![Referencia desktop-light](evidence/0.9-cp6/desktop-light-reference-components.png) |
| 1440×900 · oscuro | ![Ajustes avanzados desktop-dark](evidence/0.9-cp6/desktop-dark-settings.png) | ![Referencia desktop-dark](evidence/0.9-cp6/desktop-dark-reference-components.png) |
| 390×844 · claro | ![Ajustes avanzados mobile-light](evidence/0.9-cp6/mobile-light-settings.png) | ![Referencia mobile-light](evidence/0.9-cp6/mobile-light-reference-components.png) |
| 390×844 · oscuro | ![Ajustes avanzados mobile-dark](evidence/0.9-cp6/mobile-dark-settings.png) | ![Referencia mobile-dark](evidence/0.9-cp6/mobile-dark-reference-components.png) |

### Confirmación destructiva

§11. Misma estructura título, explicación y pie; se usa el mensaje real de eliminar control. Cancelar conserva foco inicial, Esc, ciclo de tabulación y retorno del foco.

| Tamaño / tema | Producto | Maqueta |
| --- | --- | --- |
| 1440×900 · claro | ![Confirmación destructiva desktop-light](evidence/0.9-cp6/desktop-light-confirm.png) | ![Referencia desktop-light](evidence/0.9-cp6/desktop-light-reference-dialogs.png) |
| 1440×900 · oscuro | ![Confirmación destructiva desktop-dark](evidence/0.9-cp6/desktop-dark-confirm.png) | ![Referencia desktop-dark](evidence/0.9-cp6/desktop-dark-reference-dialogs.png) |
| 390×844 · claro | ![Confirmación destructiva mobile-light](evidence/0.9-cp6/mobile-light-confirm.png) | ![Referencia mobile-light](evidence/0.9-cp6/mobile-light-reference-dialogs.png) |
| 390×844 · oscuro | ![Confirmación destructiva mobile-dark](evidence/0.9-cp6/mobile-dark-confirm.png) | ![Referencia mobile-dark](evidence/0.9-cp6/mobile-dark-reference-dialogs.png) |

### Equipos

§10. Un estado y una acción principal por equipo. El receptor por defecto y Ver YAML quedan en Más opciones. Se conserva Cómo agregarlo: D19 sigue pendiente.

| Tamaño / tema | Producto | Maqueta |
| --- | --- | --- |
| 1440×900 · claro | ![Equipos desktop-light](evidence/0.9-cp6/desktop-light-devices.png) | ![Referencia desktop-light](evidence/0.9-cp6/desktop-light-reference-rf.png) |
| 1440×900 · oscuro | ![Equipos desktop-dark](evidence/0.9-cp6/desktop-dark-devices.png) | ![Referencia desktop-dark](evidence/0.9-cp6/desktop-dark-reference-rf.png) |
| 390×844 · claro | ![Equipos mobile-light](evidence/0.9-cp6/mobile-light-devices.png) | ![Referencia mobile-light](evidence/0.9-cp6/mobile-light-reference-rf.png) |
| 390×844 · oscuro | ![Equipos mobile-dark](evidence/0.9-cp6/mobile-dark-devices.png) | ![Referencia mobile-dark](evidence/0.9-cp6/mobile-dark-reference-rf.png) |

### Instrucciones y YAML

§10 + §6. Diferencia deliberada por D19: se mantiene el flujo de copiar YAML existente, sin instalar ni editar ESPHome. Sólo el bloque YAML admite nombres técnicos.

| Tamaño / tema | Producto | Maqueta |
| --- | --- | --- |
| 1440×900 · claro | ![Instrucciones y YAML desktop-light](evidence/0.9-cp6/desktop-light-yaml.png) | ![Referencia desktop-light](evidence/0.9-cp6/desktop-light-reference-rf.png) |
| 1440×900 · oscuro | ![Instrucciones y YAML desktop-dark](evidence/0.9-cp6/desktop-dark-yaml.png) | ![Referencia desktop-dark](evidence/0.9-cp6/desktop-dark-reference-rf.png) |
| 390×844 · claro | ![Instrucciones y YAML mobile-light](evidence/0.9-cp6/mobile-light-yaml.png) | ![Referencia mobile-light](evidence/0.9-cp6/mobile-light-reference-rf.png) |
| 390×844 · oscuro | ![Instrucciones y YAML mobile-dark](evidence/0.9-cp6/mobile-dark-yaml.png) | ![Referencia mobile-dark](evidence/0.9-cp6/mobile-dark-reference-rf.png) |

### Nuevo hogar

§11. Mismo marco y acciones. Se mantiene el formulario existente: nombre con minúsculas, números y guiones; el plano se importa después. Añadir carga de SVG aquí cambiaría comportamiento y queda fuera de CP6.

| Tamaño / tema | Producto | Maqueta |
| --- | --- | --- |
| 1440×900 · claro | ![Nuevo hogar desktop-light](evidence/0.9-cp6/desktop-light-new-home.png) | ![Referencia desktop-light](evidence/0.9-cp6/desktop-light-reference-dialogs.png) |
| 1440×900 · oscuro | ![Nuevo hogar desktop-dark](evidence/0.9-cp6/desktop-dark-new-home.png) | ![Referencia desktop-dark](evidence/0.9-cp6/desktop-dark-reference-dialogs.png) |
| 390×844 · claro | ![Nuevo hogar mobile-light](evidence/0.9-cp6/mobile-light-new-home.png) | ![Referencia mobile-light](evidence/0.9-cp6/mobile-light-reference-dialogs.png) |
| 390×844 · oscuro | ![Nuevo hogar mobile-dark](evidence/0.9-cp6/mobile-dark-new-home.png) | ![Referencia mobile-dark](evidence/0.9-cp6/mobile-dark-reference-dialogs.png) |

### Todavía no hay hogares

§11 + §6. El formulario comparte el marco de Nuevo hogar. En el primer hogar no hay Cancelar, como antes; el acceso de personas no administradoras sigue restringido.

| Tamaño / tema | Producto | Maqueta |
| --- | --- | --- |
| 1440×900 · claro | ![Todavía no hay hogares desktop-light](evidence/0.9-cp6/desktop-light-empty-home.png) | ![Referencia desktop-light](evidence/0.9-cp6/desktop-light-reference-dialogs.png) |
| 1440×900 · oscuro | ![Todavía no hay hogares desktop-dark](evidence/0.9-cp6/desktop-dark-empty-home.png) | ![Referencia desktop-dark](evidence/0.9-cp6/desktop-dark-reference-dialogs.png) |
| 390×844 · claro | ![Todavía no hay hogares mobile-light](evidence/0.9-cp6/mobile-light-empty-home.png) | ![Referencia mobile-light](evidence/0.9-cp6/mobile-light-reference-dialogs.png) |
| 390×844 · oscuro | ![Todavía no hay hogares mobile-dark](evidence/0.9-cp6/mobile-dark-empty-home.png) | ![Referencia mobile-dark](evidence/0.9-cp6/mobile-dark-reference-dialogs.png) |

### Sin controles

§6. Sin pantalla específica: aviso y acción Nuevo control con componentes compartidos. Agregar este estado a la maqueta.

| Tamaño / tema | Producto | Maqueta |
| --- | --- | --- |
| 1440×900 · claro | ![Sin controles desktop-light](evidence/0.9-cp6/desktop-light-empty.png) | ![Referencia desktop-light](evidence/0.9-cp6/desktop-light-reference-components.png) |
| 1440×900 · oscuro | ![Sin controles desktop-dark](evidence/0.9-cp6/desktop-dark-empty.png) | ![Referencia desktop-dark](evidence/0.9-cp6/desktop-dark-reference-components.png) |
| 390×844 · claro | ![Sin controles mobile-light](evidence/0.9-cp6/mobile-light-empty.png) | ![Referencia mobile-light](evidence/0.9-cp6/mobile-light-reference-components.png) |
| 390×844 · oscuro | ![Sin controles mobile-dark](evidence/0.9-cp6/mobile-dark-empty.png) | ![Referencia mobile-dark](evidence/0.9-cp6/mobile-dark-reference-components.png) |

