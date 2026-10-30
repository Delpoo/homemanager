# Inventario de funciones — E00

**Estado: entregado para revisión. No habilita E01 sin validación del propietario.**

Base examinada e integrada: `origin/main` en `764a9e052f8606831c99b35c6e81a55a98b0ee65`, incluidos el plano vinculado (#47) y Conectar mi casa (#50). Guías integradas: `claude/guias-rediseno`, commit `fa97550e1b9d548a98dfe01e4e34540b2bd333b8`. Fecha: 2026-10-31. La revisión inicial sobre `9a5d975` se amplió tras integrar esas dos ramas.

Cada fila dice cómo se comprobó: **código** acredita que se leyó su implementación; **captura** acredita sólo su representación visible en una imagen histórica identificada abajo. **App** se reserva a ejecución comprobada en esta sesión: no se usa sin resultado observado. Las limitaciones del entorno están en el registro de comprobaciones; no son decisiones de producto ni bloquean esta entrega documental, conforme a las guías actualizadas. E00 no requiere la maqueta.

Los destinos son obligaciones de conservación para las futuras etapas, no cambios realizados ni decisiones nuevas del propietario.

## Panel: barra superior y menú

Fuente: `src/shell/top-bar.ts`. Los comandos del contenedor se distinguen de los de la tarjeta; los de administración sólo se ofrecen al administrador. Las entradas de hogares y RF dependen del contexto de aplicación.

| Id | Función | Qué permite hacer | Dónde está hoy | Cómo se llega | Etapa que la toca | Qué pasa con ella | Comprobada en |
|---|---|---|---|---|---|---|---|
| F-001 | Identificar el hogar | Ver su nombre y la marca de la aplicación | Barra superior | Abrir el panel | E03 | Se conserva; hoy el nombre se oculta en móvil | código + captura histórica C01 |
| F-002 | Actividad reciente | Ver el último envío o resultado y su antigüedad | Barra superior | Abrir el panel | E03 | Se conserva, con el vocabulario de producto | código + captura histórica C01 |
| F-003 | Abrir historial | Consultar los eventos recientes | Botón de actividad | Tocar la actividad | E02, E03 | Se conserva; destino del historial pendiente de validar, ver D-E00-01 | código |
| F-004 | Acceder a alertas | Ver el número de avisos cuando existen | Barra superior | Tocar la píldora de alertas | E03, E07 | Se conserva; E03 incorpora el símbolo solicitado | código + captura histórica C01 |
| F-005 | Reloj | Consultar la hora | Barra superior en escritorio | Abrir el panel | E03 | Se conserva; no se muestra en móvil | código + captura histórica C01 |
| F-006 | Editar plano | Entrar a la edición como administrador | Menú principal | Menú → Editar plano | E01, E02 | Se conserva | código + captura histórica C01 |
| F-007 | Volver al plano | Elegir la sección Plano | Menú de la aplicación | Menú → Plano | E02 | Se conserva | código |
| F-008 | Abrir Controles RF | Acceder al gestor RF como administrador | Menú de la aplicación | Menú → Controles RF | E02, E09, E10 | Se conserva | código |
| F-009 | Abrir ajustes | Entrar a los ajustes del plano como administrador | Menú principal | Menú → Ajustes del plano | E02 | Cambia de lugar: pantalla de Ajustes, conservando sus secciones | código + captura histórica C01 |
| F-010 | Elegir hogar | Cambiar el hogar activo cuando hay más de uno | Menú de la aplicación | Menú → Hogar | E02 | Se conserva; selección local recordada, detalle en F-117 | código |
| F-011 | Nuevo hogar | Acceder a la creación como administrador | Menú de la aplicación | Menú → Nuevo hogar | E02 | Se conserva; creación efectiva con el primer guardado, detalle en F-117 | código |
| F-012 | Almacenamiento | Consultar el almacenamiento como administrador | Menú de la aplicación | Menú → Almacenamiento | E02 | Se conserva; mantenimiento detallado en F-119 | código |
| F-013 | Tema | Elegir automático, claro u oscuro; recordar la preferencia en este navegador | Menú principal | Menú → Apariencia | E03, E11 | Se conserva; el tema automático sigue HA y la preferencia local no reemplaza el guardado del hogar | código |
| F-014 | Pantalla completa | Solicitar pantalla completa | Menú principal | Menú → Pantalla completa | E13 | Se conserva; no equivale a dar por implementado todo el modo pared | código + captura histórica C01 |
| F-015 | Ayuda | Abrir la ayuda | Menú principal | Menú → Ayuda | E02 | Se conserva; explica gestos, confianza y versión | código + captura histórica C01 |
| F-016 | Navegar con teclado | Recorrer y cerrar el menú | Menú principal | Flechas, Inicio, Fin y Escape | E02, E03 | Se conserva, incluido el retorno del foco | código |
| F-017 | Menú de Home Assistant | Acceder al menú del contenedor en una pantalla estrecha | Menú de la aplicación | Menú → Menú de Home Assistant | E02 | Se conserva cuando el contexto lo ofrece | código |

## Historial y alertas

Fuente: `src/shell/activity-view.ts`. El historial se dibuja en orden inverso y las alertas se leen del estado de ejecución; no se cambió su comportamiento.

| Id | Función | Qué permite hacer | Dónde está hoy | Cómo se llega | Etapa que la toca | Qué pasa con ella | Comprobada en |
|---|---|---|---|---|---|---|---|
| F-018 | Consultar el detalle de actividad | Ver hora, mensaje, dispositivo, acción y resultado disponibles | Diálogo de historial | Tocar actividad | E02, E03 | A decidir: ubicación futura del historial; recomendación D-E00-01 | código |
| F-019 | Elegir un aviso | Elegir un dispositivo cuando hay varias alertas | Diálogo de alertas | Tocar alertas | E02, E07 | Se conserva; E07 debe mantener acceso al origen del aviso | código |
| F-020 | Localizar el origen de una alerta | Seleccionar y encuadrar el dispositivo, activar sus capas y llevarle el foco | Plano | Una alerta se localiza directamente; varias permiten elegir | E03, E07 | Se conserva, incluido acceso por teclado | código |

## Capas

Fuente: `src/shell/layers.ts`. La lista actual declara Controles, Sensores, Energía e Infraestructura. El estado de cada botón expresa si su capa está activa. Controles, Sensores y Energía están activos al inicio; Infraestructura empieza oculta. La agrupación depende del tipo del símbolo y no autoriza acciones.

| Id | Función | Qué permite hacer | Dónde está hoy | Cómo se llega | Etapa que la toca | Qué pasa con ella | Comprobada en |
|---|---|---|---|---|---|---|---|
| F-021 | Filtrar capas | Mostrar u ocultar grupos de símbolos | Barra de capas sobre el plano | Tocar cada capa | E03, E05 | Se conserva; E03 usa sólo símbolos, con nombres accesibles | código + captura histórica C02 |

## Ajustes: navegación, espacios y diagnóstico

Fuente: `src/editor/settings-page.ts`. La página tiene siete secciones y contadores de problemas. Los cuerpos de acciones, paneles, referencias e importación se generan en el editor y se detallan en F-079–F-089. La existencia de una entrada de menú no acredita la revisión de su flujo.

| Id | Función | Qué permite hacer | Dónde está hoy | Cómo se llega | Etapa que la toca | Qué pasa con ella | Comprobada en |
|---|---|---|---|---|---|---|---|
| F-022 | Cambiar sección de ajustes | Entrar a Plano y espacios, Conectar mi casa, Diagnóstico, Acciones lógicas, Paneles nativos, Referencias pendientes o Importar y exportar | Navegación de Ajustes | Abrir ajustes y elegir sección | E02 | Se conserva; funciones internas en F-075–F-089 y F-125 | código |
| F-023 | Consultar espacios | Ver nombre, icono, cantidad de dispositivos y situación de su forma | Plano y espacios | Abrir la sección | E02, E11 | Se conserva | código |
| F-024 | Ordenar y abrir un espacio | Acceder a su edición y al control de orden mediante agarre o teclado | Lista de espacios | Abrir una fila o usar su control de movimiento | E02, E11 | Se conserva; reordenar actualiza la lista en el borrador | código |
| F-025 | Reemplazar el dibujo | Acceder a la importación desde la miniatura del plano | Plano y espacios | Reemplazar plano | E02, E11 | Se conserva; revisión detallada en F-083–F-088 | código |
| F-026 | Consultar diagnóstico | Ver resumen del plano y problemas de zonas, ubicación, entidades o nombres duplicados | Diagnóstico | Elegir Diagnóstico | E02, E11 | Se conserva, con las acciones individuales que correspondan | código |
| F-027 | Resolver un problema individual | Abrir el elemento, agregar una zona no usada, quitar un espacio vacío o corregir una ubicación, según el caso | Diagnóstico | Botón de cada problema | E02, E11 | Se conserva; cada manejador trabaja sobre el borrador y conserva el deshacer general; no probado en ejecución | código |
| F-028 | Arreglar lo seguro | Solicitar correcciones de ubicación y retirada de espacios vacíos sin zona, con posibilidad de deshacer | Diagnóstico | Arreglar lo seguro | E02, E11 | Se conserva; aplicación/reversión contrastadas en código, no en ejecución | código |

## Plano, gestos, vista por espacio y Ahora

Fuentes: `src/card/gestures.ts`, `commands.ts`, `editing.ts`, `room-view.ts`, `plan-view.ts`, `markers.ts`, `src/panels/device-screen.ts` y `src/model/now.ts`. Verificación estática; no recorrido manual.

| Id | Función | Qué permite hacer | Dónde está hoy | Cómo se llega | Etapa que la toca | Qué pasa con ella | Comprobada en |
|---|---|---|---|---|---|---|---|
| F-029 | Acción al tocar | Ejecutar el control elegido o abrir el panel; conservar la acción principal anterior | Símbolo | Toque breve | E05, E06, E09 | Se conserva; la configuración pasa al módulo de gestos | código |
| F-030 | Abrir controles sin ejecutar el toque | Consultar los detalles mediante mantener, menú contextual o teclado | Símbolo | Mantener; clic derecho; Mayús+Enter o menú contextual del teclado | E06, E09 | Se conserva, incluido el acceso por teclado | código |
| F-031 | Atajos junto al símbolo | Usar hasta tres controles fijados sin abrir la ventana | Plano | Controles con alfiler | E05, E09 | Se conserva; no convertir un arrastre del deslizador en movimiento del plano | código |
| F-032 | Desplazamiento y ampliación | Mover el plano y ampliar con rueda, pellizco, botones o teclado | Plano | Arrastrar; pellizcar; rueda; +/−; flechas e Inicio | E11, E13 | Se conserva | código + captura histórica C02 |
| F-033 | Ampliar con doble toque del fondo | Ampliar en el punto tocado | Fondo del plano | Dos toques en el fondo | E06, E13 | Se conserva; no confundir este gesto existente del fondo con el doble toque de símbolos descartado por ahora | código |
| F-034 | Agrupar símbolos cercanos | Acercarse a un grupo para distinguir sus dispositivos | Marcadores agrupados | Tocar el grupo numerado | E05, E13 | Se conserva | código + captura histórica C02 |
| F-035 | Elegir espacio o casa completa | Encuadrar y resaltar un espacio; volver al conjunto | Riel de espacios | Elegir un espacio o la casa | E03, E13 | Se conserva | código + captura histórica C01, C02 |
| F-036 | Navegar con flechas de destino | Ver el nombre manteniendo y viajar al tirar hacia el destino | Vista por espacio | Activar Flechas y arrastrar una flecha | E13 | Se conserva; un toque no debe confundirse con viajar | código |
| F-037 | Navegar deslizando | Viajar entre espacios cuando está activado el gesto | Vista por espacio | Activar Deslizar y deslizar el plano | E13 | Se conserva; Flechas y Deslizar son opciones separadas | código |
| F-038 | Consultar Ahora | Ver alertas, clima, activos y energía disponibles, filtrados por espacio | Columna lateral u hoja móvil | Abrir Ahora | E12 | Se conserva; no mostrar grupos vacíos | código |
| F-039 | Actuar desde Ahora | Abrir el dispositivo o apagar un activo compatible | Lista Ahora | Tocar fila o acción rápida | E04, E12 | Se conserva, con comprobación de disponibilidad del comando | código |
| F-040 | Ver resultados de comandos | Mostrar el envío y, si se recibió, el eco; informar el error | Barra, aviso junto al símbolo y paneles | Ejecutar un control | E03, E09 | Se conserva; el eco no confirma el estado físico | código |

## Ficha y barra de edición

Fuentes: `src/editor/index.ts` (`deviceForm`, `stateForm`, eventos), `src/editor/controls-editor.ts`, `src/card/editing.ts` y `src/ui/alert-editor.ts`. La ficha se confirma explícitamente: no se presume que cada cambio de campo ya llegó al borrador ni a HA.

| Id | Función | Qué permite hacer | Dónde está hoy | Cómo se llega | Etapa que la toca | Qué pasa con ella | Comprobada en |
|---|---|---|---|---|---|---|---|
| F-041 | Elegir categoría | Elegir presentación y secciones; mantener datos de secciones ocultas | Ficha | Categoría | E01, E05 | Se conserva hasta E05; después cambia de lugar: base y módulos, sin perder datos | código |
| F-042 | Nombre e icono | Personalizar identificación del símbolo | Ficha | Nombre e icono del dispositivo | E01, E08 | Se conserva; E08 unifica y amplía selectores | código |
| F-043 | Vincular dispositivo y lecturas | Cambiar el equipo de HA, principal y adicionales manteniendo controles | Ficha | Vincular/Cambiar dispositivo | E01, E02, E05 | Se conserva | código + captura histórica C03 |
| F-044 | Elegir espacio | Cambiar la agrupación visual sin cambiar áreas de HA | Ficha | Habitación del dispositivo | E01, E05 | Se conserva incluso con posición fija | código + captura histórica C05 |
| F-045 | Qué muestra el símbolo | Elegir icono, valor o ambos cuando la categoría lo permite | Ficha | Qué muestra el símbolo | E01, E05 | Se conserva; indicadores configurables sustituyen restricciones por categoría | código + captura histórica C05 |
| F-046 | Avisos numéricos | Elegir lectura, límites inferior/superior, duración y gravedad; activar, editar, agregar o quitar | Ficha | Avisar si | E01, E07 | Cambia de lugar: pantalla de Reglas, con atajo en la ficha | código + captura histórica C05 |
| F-047 | Avisos binarios y resaltado | Resaltar presencia/apertura y contar como alerta | Ficha | Resaltar al detectar / Contar como alerta | E01, E05, E07 | Se conserva; destino de las reglas base, a decidir en D-E00-02 | código |
| F-048 | Avisos conservados no aplicables | Ver y quitar reglas incompatibles sin perderlas por cambiar categoría | Ficha | Otros avisos conservados | E01, E05, E07 | Se conserva; E05/E07 deben hacer explícita la incompatibilidad | código |
| F-049 | Elegir mando RF | Usar un control de la biblioteca dentro del panel del dispositivo, o el automático de su entidad | Ficha | Control RF en el panel | E01, E05, E09 | Se conserva; si el selector no se muestra, el vínculo existente se mantiene | código |
| F-050 | Movilidad, posición e identidad | Distinguir fijo/editable/portátil y editar coordenadas; conservar ID de dispositivos existentes | Más opciones | Abrir bloque avanzado | E01, E05 | Se conserva; campos técnicos permanecen avanzados | código |
| F-051 | Corregir posición fija | Autorizar explícitamente el cambio de ubicación de un fijo | Más opciones o selección | Corregir ubicación fija / Reubicar dispositivo fijo | E01, E05 | Se conserva; no desbloquear todos los dispositivos | código |
| F-052 | Panel nativo adicional | Asociar un panel definido en Ajustes | Más opciones | Panel nativo | E01, E05, E09 | Se conserva junto a los controles diseñados | código |
| F-053 | Fuente de estado | Elegir entidad, atributo y lectura informada, medida o sólo envío; quitar la fuente al dejar entidad vacía | Más opciones | Fuente de estado → Aplicar fuente | E01, E05 | A decidir: destino del editor avanzado; recomendación D-E00-03 | código |
| F-054 | Restablecer sugerencias | Reponer nombre, icono y controles sugeridos tras confirmar | Pie de ficha | Restablecer valores sugeridos | E01, E09 | Se conserva; no confundir con deshacer sólo este dispositivo | código |
| F-055 | Aplicar la ficha al borrador | Validar campos y acciones, conservar vínculos y cerrar la ficha embebida | Pie de ficha | Guardar dispositivo | E01 | Se conserva; el guardado compartido sigue siendo separado | código + captura histórica C05 |
| F-056 | Mover o quitar un símbolo | Elegir posición en el plano o quitarlo tras confirmar, conservando entidad HA | Pie de ficha | Mover / Eliminar dispositivo | E01, E05 | Se conserva con posibilidad de deshacer el cambio del borrador | código + captura histórica C05 |
| F-057 | Agregar símbolo | Crear desde HA o vacío; ubicarlo después en el plano | Barra y menú de agregar | Agregar dispositivo → origen | E01, E02, E05 | Se conserva; salir de colocación con Escape | código |
| F-058 | Deshacer y rehacer | Recorrer cambios del borrador, incluido movimiento por arrastre o teclado | Barra de edición | Deshacer/Rehacer; Ctrl+Z, Ctrl+Mayús+Z o Ctrl+Y | E01, E02 | Se conserva; la historia general no equivale a revertir sólo la ficha | código + captura histórica C05 |
| F-059 | Guardar y descartar | Persistir explícitamente o reponer la última configuración cargada | Barra de edición | Guardar cambios / Descartar | E01, E02 | Se conserva; error o conflicto mantiene el borrador | código |
| F-060 | Revisar movimientos de espacio | Confirmar cambios de agrupación al guardar | Confirmación de guardado | Guardar después de cambiar espacios | E02 | Se conserva la información: ubicación visual no altera entidades ni rutas | código |
| F-061 | Restricciones de edición | Exigir administrador y storage apropiado; bloquear acciones físicas mientras se edita | Editor y controles | Entrar a editar | E01, E02, E05 | Se conserva; ninguna elección visual amplía permisos | código |

## Vincular y buscar entidades

Fuentes: `src/editor/device-picker.ts`, `src/model/device-catalog.ts`, `src/model/names.ts` y `src/editor/entity-picker.ts`.

| Id | Función | Qué permite hacer | Dónde está hoy | Cómo se llega | Etapa que la toca | Qué pasa con ella | Comprobada en |
|---|---|---|---|---|---|---|---|
| F-062 | Buscar dispositivos agrupados | Buscar por nombre o espacio; ver Todos/Sin ubicar y marca En el plano | Paso 1 del selector | Vincular dispositivo | E02, E05 | Cambia de lugar: dentro de ficha o pantalla, ubicación a validar en E02 | código |
| F-063 | Lectura principal y adicionales | Elegir principal y hasta tres adicionales; consultar valores y otras lecturas plegadas | Paso 2 del selector | Elegir dispositivo | E02, E04, E05 | Se conserva; no exponer diagnósticos/configuración/ocultas/desactivadas como sugerencias | código + captura histórica C03 |
| F-064 | Búsqueda avanzada | Buscar cualquier entidad o conservar una referencia explícita escrita | Selector avanzado | Buscar cualquier entidad | E02, E05 | Se conserva como sección avanzada | código |
| F-065 | Volver, cancelar y detectar cambios | Volver entre pasos sin vincular de inmediato; avisar si cambió el registro | Selector | Volver/Cancelar; registro actualizado | E02 | Se conserva el borrador previo y el retorno del foco | código + captura histórica C03 |

## Pantalla del dispositivo y ventana de controles

Fuentes: `src/panels/device-screen.ts`, `src/model/device-screen.ts`, `src/panels/native-panel.ts`, `src/panels/controls.ts` y `src/model/control-capabilities.ts`.

| Id | Función | Qué permite hacer | Dónde está hoy | Cómo se llega | Etapa que la toca | Qué pasa con ella | Comprobada en |
|---|---|---|---|---|---|---|---|
| F-066 | Datos del dispositivo | Ver nombre, espacio, estado, antigüedad y lecturas; avisar de vínculo incompleto | Pantalla del dispositivo | Tocar sensor, medidor, equipo o infraestructura | E04 | Se conserva | código + captura histórica C04 |
| F-067 | Canales de medición | Ver tabla de canales cuando el modelo identifica las lecturas correspondientes | Pantalla del medidor | Abrir medidor | E04 | Se conserva; revisar casos donde los nombres no permiten reconocer canales | código + captura histórica C04 |
| F-068 | Alertas, actividad y diagnóstico | Consultar avisos y bloques plegados del dispositivo | Pantalla del dispositivo | Abrir bloques | E04, E07 | Se conserva | código + captura histórica C04 |
| F-069 | Abrir equipo en HA | Consultar el dispositivo registrado con permiso administrador | Pie de la pantalla | Abrir en Home Assistant | E04 | Se conserva, sólo cuando hay registro y permiso | código + captura histórica C04 |
| F-070 | Controles nativos por capacidad | Manejar luz, ventilador, cortina, clima, interruptor, botón y scripts según capacidades | Pantalla o ventana de controles | Abrir controles | E04, E09 | Se conserva; opciones no disponibles explican el motivo | código |
| F-071 | Diseños y acciones adicionales | Dibujar mando RF, controles propios, derivados de HA y acciones de panel | Ventana nativa | Mantener símbolo u otro acceso a controles | E09 | Cambia de lugar: diseño elegido primero; demás bloques plegados | código |
| F-072 | Corregir estado sin enviar | Marcar encendido/apagado estimado de una entidad RF compatible | Ventana nativa | ¿No coincide con el equipo? | E09 | Se conserva, plegada; no genera un comando físico | código |
| F-073 | Scripts con campos verificados | Completar valores de la firma del script y ejecutarlo sólo si es válido | Controles nativos | Campos del script → Ejecutar | E09 | Se conserva; no aceptar plantillas ni destinos arbitrarios | código |
| F-074 | Confianza y acceso por teclado | Mostrar confirmado/estimado/enviado/desconocido/error; cerrar y devolver foco | Ventana nativa | Consultar estado o cerrar panel | E04, E09 | Se conserva; distinguir envío y efecto físico | código |

## Ajustes, importaciones y zonas

Fuentes: `src/editor/index.ts`, `room-actions.ts`, `plan-review.ts`, `model.ts`, `src/card/zone-editor.ts`, `src/model/plan-import.ts` y `zone-edit.ts`.

| Id | Función | Qué permite hacer | Dónde está hoy | Cómo se llega | Etapa que la toca | Qué pasa con ella | Comprobada en |
|---|---|---|---|---|---|---|---|
| F-075 | Agregar espacios detectados | Agregar una zona o todas las zonas SVG todavía no declaradas | Plano y espacios | Agregar zona / Agregar todas | E02, E11 | Se conserva | código |
| F-076 | Crear espacio sin forma | Declarar ID y nombre aunque todavía no esté dibujado | Plano y espacios | Agregar un espacio sin dibujarlo | E02, E11 | Se conserva y se informa que falta forma | código |
| F-077 | Editar espacio | Renombrar, elegir icono, fusionar o quitar; reasignar o dejar sin espacio sus dispositivos | Ventana del espacio | Abrir espacio desde lista o riel en edición | E02, E11, E13 | Cambia de lugar: pantalla de edición de espacio | código |
| F-078 | Ajustes de navegación del espacio | Elegir encuadre, saltear al navegar y flechas de destino; editar forma o volver a zona SVG | Ventana del espacio | Vista por espacio | E02, E11, E13 | Se conserva | código |
| F-079 | Acciones lógicas | Crear o editar ID, dominio, servicio, destinos explícitos y datos JSON de una acción | Ajustes | Acciones lógicas → Aplicar acción | E02, E09 | A decidir: editor avanzado y relación con diseñador; D-E00-04 | código |
| F-080 | Definir paneles nativos | Crear o editar panel, tipo y controles con ID, etiqueta y acción; agregar o quitar filas | Ajustes | Paneles nativos → Aplicar panel | E02, E09 | A decidir: conservar compatibilidad y destino avanzado; D-E00-04 | código |
| F-081 | Referencias pendientes | Ver entidades, acciones o paneles no resueltos sin ejecutarlos | Ajustes | Referencias pendientes | E02, E05 | Se conserva; guardar debe validar lo requerido | código |
| F-082 | Exportar respaldo | Descargar configuración duradera sin copiar el estado físico estimado como verdad | Importar y exportar | Exportar JSON | E02, E11 | Se conserva como copia de respaldo | código |
| F-083 | Previsualizar JSON o SVG | Ver altas, bajas, cambios, acciones, paneles, espacios y dibujo antes de aplicar | Importar y exportar | Elegir archivo | E02, E11 | Se conserva; importar no ejecuta comandos | código |
| F-084 | Detectar pérdidas y exigir copia | Advertir si JSON elimina vínculos, avisos, acciones o paneles, o reintroduce espacios; exigir exportación previa | Resumen de importación | Importar un JSON con pérdidas | E02, E11 | Se conserva, también al restaurar una configuración que pase por este flujo | código |
| F-085 | Revisar cambios de coordenadas | Elegir mismo punto del dibujo o misma proporción y exigir copia previa si cambia viewBox | Resumen de importación | Importar dibujo con coordenadas nuevas | E02, E11 | Se conserva; posiciones recortadas se informan | código |
| F-086 | Resolver conflictos espaciales | Elegir movimientos, fusionar huérfanos, agregar zonas o mantener formas propias; informar ambiguos y fuera de zona | Revisar cambios | Aplicar importación espacial | E02, E11 | Cambia de lugar: pantalla de revisión; aplicar es un paso de deshacer | código |
| F-087 | Importar sólo dibujo o cancelar | Conservar agrupación actual o cancelar la revisión | Revisar cambios | Importar sólo el plano / Cancelar | E02, E11 | Se conserva | código |
| F-088 | Revisar plano ya cargado | Ejecutar la misma revisión sin importar otra vez | Plano y espacios | Revisar espacios con el plano | E02, E11 | Se conserva | código |
| F-089 | Historial del dibujo | Cargar versiones anteriores y previsualizar una restauración en el borrador | Importar y exportar, con integración | Planos anteriores → Restaurar | E02, E11 | A decidir: acceso al historial técnico; D-E00-05. Se conserva el almacenamiento | código |
| F-090 | Dibujar y editar rectángulos | Crear zona, agregar o quitar rectángulos, mover, redimensionar, renombrar, fusionar o eliminar | Editor de zonas | Editar zonas; Nueva zona | E02, E11 | Se conserva; respetar límites y alineación | código |
| F-091 | Teclado e historia de zonas | Mover con flechas, redimensionar con Mayús, deshacer, cancelar con confirmación o aplicar | Editor de zonas | Controles o teclado | E02, E11 | Se conserva; aplicar cambia el borrador, no persiste solo | código |
| F-092 | Revisar reasignación por zonas | Elegir qué dispositivos cambian de espacio al aplicar geometría | Revisión de zonas | Aplicar zonas con movimientos | E02, E11 | Se conserva | código |
| F-093 | Primer dibujo sin zonas | Explicar cómo crear espacios y ofrecer dibujar el primero o hacerlo después | Aviso inicial | Entrar a editar un dibujo sin zonas | E02, E11 | Se conserva | código |

## Controles propios y diseñador RF

Fuentes: `src/editor/controls-editor.ts`, `src/card/device-controls.ts`, `src/rf/manager.ts`, `layout.ts` y `remote-view.ts`. Son dos modelos actuales distintos; E09 debe preservar ambos antes de unificarlos.

| Id | Función | Qué permite hacer | Dónde está hoy | Cómo se llega | Etapa que la toca | Qué pasa con ella | Comprobada en |
|---|---|---|---|---|---|---|---|
| F-094 | Crear controles del símbolo | Combinar hasta ocho pulsadores, ciclos, subir/bajar, selectores o deslizadores | Ficha | Controles → Agregar control | E01, E09 | Se conserva | código |
| F-095 | Editar pasos de control | Elegir acción, icono y etiqueta por paso; agregar o quitar pasos cuando corresponde | Ficha | Campos de cada control | E01, E09 | Se conserva, incluidos límites por tipo | código |
| F-096 | Configurar deslizador | Elegir valor de una entidad o pasos y orientación vertical/horizontal | Ficha | Opciones de deslizador | E01, E09 | Se conserva | código |
| F-097 | Toque, tamaño y atajos | Elegir qué control ejecuta el símbolo, tamaño y hasta tres controles fijados | Ficha | Al tocar; Tamaño; alfiler | E01, E05, E06, E09 | Se conserva; tamaño no puede perderse cuando no hay controles | código |
| F-098 | Listar y abrir mandos | Ver los controles guardados y abrir uno | Gestor RF | Controles → elegir mando | E02, E09 | Se conserva | código + captura histórica C08 |
| F-099 | Nuevo mando | Definir nombre, icono y descripción y comenzar aprendiendo su primer botón | Gestor RF | Nuevo control → Aprender botones | E02, E09, E10 | Se conserva; requiere un equipo transmisor disponible | código + captura histórica C08 |
| F-100 | Editar mando y botones | Cambiar metadatos, nombre/icono de botón, probarlo o eliminarlo | Editor RF | Editar → secciones del mando | E02, E08, E09 | Se conserva; los cambios RF se guardan por su flujo propio, distinto del borrador del plano | código + captura histórica C06, C08 |
| F-101 | Configurar envío RF | Consultar tipo y tamaño de señal; elegir transmisor, pulso, repeticiones y espera | Editor RF | Ajustes del control | E09, E10 | Se conserva, en opciones avanzadas y sin inventar parámetros medidos | código + captura histórica C06 |
| F-102 | Roles de ventilador y luz | Agregar o quitar partes y asignar botones a funciones y velocidades; ver vínculos HA | Editor RF | En Home Assistant | E09 | Se conserva; la luz y el ventilador tienen roles separados | código + captura histórica C06 |
| F-103 | Diseño automático | Generar disposición desde partes y botones, o volver al diseño automático | Diseñador RF | Diseño automático | E09 | Se conserva; documentar cuándo reemplaza un diseño propio | código + captura histórica C08 |
| F-104 | Diseñar widgets RF | Agregar botón, interruptor, subir/bajar, pasos o modos; asignar botones, etiqueta, icono, ancho y alto | Diseñador RF | Agregar elemento / editar elemento | E02, E08, E09 | Se conserva, con migración desde los dos vocabularios | código + captura histórica C08 |
| F-105 | Ordenar el lienzo RF | Arrastrar, redimensionar y quitar elementos; resolver ocupación de la cuadrícula | Diseñador RF | Elemento y esquina de tamaño | E09 | Se conserva; no confundir con el diseñador libre futuro | código + captura histórica C08 |
| F-106 | Guardar o cancelar widget | Confirmar elemento válido o cancelar su edición | Ventana del widget | Guardar / Cancelar | E02, E09 | Cambia de lugar: pantalla/ficha del diseñador | código |
| F-107 | Eliminar mando | Quitar un control con confirmación y tratar sus asociaciones | Editor RF | Eliminar control | E09 | Se conserva con advertencia de referencias | código + captura histórica C06 |

## Aprendizaje y equipos RF

Fuentes: `src/rf/learn.ts`, `devices.ts`, `catalog.ts`, `src/integration/rf.ts` y validación de `custom_components/homemanager/rf_model.py`.

| Id | Función | Qué permite hacer | Dónde está hoy | Cómo se llega | Etapa que la toca | Qué pasa con ella | Comprobada en |
|---|---|---|---|---|---|---|---|
| F-108 | Escuchar receptor | Elegir receptor, iniciar o reanudar captura temporal y cerrar aprendizaje | Aprender botones | Agregar botón / Escuchar / Listo | E10 | Se conserva como modo libre, además del guiado futuro | código + captura histórica C07 |
| F-109 | Inspeccionar candidato | Ver señal recibida, calidad, motivos de rechazo y detalles de medición | Aprender botones | Pulsar mando físico con receptor simulado en pruebas | E10 | Se conserva; no representar «3 señales» si el criterio real es otro | código + captura histórica C07 |
| F-110 | Nombre, icono y rol aprendido | Asignar nombre, sugerencia, icono y función al botón | Candidato RF | Campos del candidato | E08, E10 | Se conserva | código + captura histórica C07 |
| F-111 | Probar candidato | Enviar prueba usando ajustes del mando existente o medida inicial de uno nuevo | Candidato RF | Probar | E10 | Se conserva; observar reacción sigue siendo una confirmación humana | código |
| F-112 | Registrar resultado e intentar variantes | Confirmar que reaccionó o ensayar otro transmisor, pulso o repeticiones; mostrar intentos | Candidato RF | Sí, guardar / No reaccionó | E10 | Se conserva; cada intento explica su cambio | código |
| F-113 | Guardar sin probar | Guardar candidato y, si hace falta, crear su mando con el primer botón | Candidato RF | Guardar sin probar | E10 | Se conserva; no implica resultado físico confirmado | código |
| F-114 | Consultar equipos ESPHome | Ver equipos, capacidades de envío/captura y situación de configuración; actualizar lista | Equipos RF | Pestaña Equipos → Actualizar | E02, E10 | Se conserva; Pista B sigue separada | código + captura histórica C09 |
| F-115 | Ayuda YAML y copia | Ver instrucciones para agregar/preparar un equipo y copiar el YAML | Equipos RF | Cómo agregarlo / Ver YAML / Copiar | E02, E10 | Se conserva hasta una sustitución expresamente aprobada de Pista B | código + captura histórica C09 |
| F-116 | Elegir receptor predeterminado y probarlo | Guardar receptor para aprender y comprobar recepción | Equipos RF | Usar para aprender / Probar recepción | E10 | Se conserva; cerrar la prueba libera la captura | código |

## Hogares, persistencia y campos sin pantalla

Fuentes: `src/app/index.ts`, `src/editor/index.ts` (`homeForm`, `migrationForm`), `src/card/types.ts`, `src/ha/types.ts`, `src/integration/store.ts`, `src/editor/storage.ts` y `custom_components/homemanager/store.py`.

| Id | Función | Qué permite hacer | Dónde está hoy | Cómo se llega | Etapa que la toca | Qué pasa con ella | Comprobada en |
|---|---|---|---|---|---|---|---|
| F-117 | Crear y recordar hogar | Elegir ID válido, abrir hogar nuevo y persistirlo con el primer guardado; recordar selección | Aplicación | Nuevo hogar; guardar el plano | E02 | Se conserva; elegir un ID no acredita por sí solo que se haya guardado | código + captura histórica C10 |
| F-118 | Referencia de tarjeta y migración | Elegir hogar/título para una tarjeta; pasar configuración inline a integración | Editor de tarjeta | Formulario de hogar o migración | E02 | A decidir: mantener acceso avanzado; D-E00-06 | código |
| F-119 | Almacenamiento e historia retenida | Ver uso; purgar expresamente historial retenido de hogares eliminados | Almacenamiento | Menú → Almacenamiento | E02 | Se conserva, con confirmación de la operación irreversible | código |
| F-120 | Conflictos y sincronización | Detectar revisiones ajenas, preservar borradores y reconstruir valores vivos al reconectar | Almacenamiento de integración o Lovelace | Carga, guardado y suscripción | E02, E05, E11 | Se conserva; no sustituir guardado compartido por caché local | código |
| F-121 | Datos de símbolos y compatibilidad | Conservar ID, tipo, movilidad, ubicación, presentación, vínculos y controles, incluidos campos anteriores | Contrato | Carga/importación/exportación | E05, E06, E07, E08, E09 | Se conserva; migraciones de lectura y campos nuevos opcionales en tres validadores | código |
| F-122 | Datos de espacios y arquitectura | Conservar orden, nombres, iconos, forma/rectángulos, origen de forma, encuadre y navegación, además del SVG | Contrato | Carga/edición/guardado | E11, E13 | Se conserva; una imagen no autoriza a reemplazar silenciosamente geometría propia | código |
| F-123 | Fuentes, acciones, paneles y TTL | Conservar servicios permitidos, destinos, fuentes de estado y vigencia de comandos | Contrato y runtime | Aplicación de configuración y ejecución | E05, E09 | Se conserva; no persistir lecturas/comandos pendientes como estado físico | código |
| F-124 | Historial y límites del backend | Guardar dibujos por hogar, revisar versiones, conservar historia al eliminar hogar y controlar almacenamiento | Integración, sin pantalla propia para todos los campos | Guardados y mantenimiento | E02, E11 | Se conserva; la eliminación de «Versiones guardadas» de la maqueta no elimina este respaldo | código |

## Plano vinculado y selector de iconos

Fuentes adicionales de `main` integrado: `src/card/linked-plan.ts`, `src/editor/index.ts` (`linkedBox`), `custom_components/homemanager/plan_link.py`, `store.py`, `websocket.py`, `src/ui/icon-picker.ts` y pruebas de `tests/integration/home.browser.spec.mjs`. No se reprodujo el flujo vinculado en un HA real o desechable durante esta etapa.

| Id | Función | Qué permite hacer | Dónde está hoy | Cómo se llega | Etapa que la toca | Qué pasa con ella | Comprobada en |
|---|---|---|---|---|---|---|---|
| F-125 | Consultar archivo vinculado | Ver ruta que corresponde al hogar y estado del archivo: ausente, pendiente, aplicado/ignorado, grande o ilegible | Importar y exportar | Plano vinculado | E02, E11 | Se conserva; visible al administrador con integración y hogar guardado | código |
| F-126 | Actualización automática segura | Adoptar un dibujo nuevo que no introduce conflictos de espacios, dispositivos ni coordenadas | Plano abierto | Archivo actualizado y panel administrador visible, fuera de edición | E11 | Se conserva; se consulta cada minuto, no hay vigilancia de carpeta ni cambios con el panel cerrado | código |
| F-127 | Revisar versión con conflictos | Llevar el archivo al flujo común de importación, con revisión y guardado explícito | Aviso del plano o Ajustes | Revisar | E02, E11 | Se conserva; geometría y dispositivos no se cambian antes de resolver | código |
| F-128 | Ignorar versión y cerrar avisos | Conservar el plano actual, registrar versión ignorada o cerrar un aviso inválido sin repetirlo | Aviso del plano | Ignorar esta versión / Cerrar | E03, E11 | Se conserva; no confundir cerrar con aceptar un dibujo | código |
| F-129 | Deshacer actualización automática | Reponer el dibujo anterior si no hubo guardados posteriores; no reaplicar esa misma versión del archivo | Aviso de actualización | Deshacer | E11 | Se conserva; si cambió la revisión, remite al historial en Importar y exportar | código |
| F-130 | Leer y recordar versión del archivo | Limitar acceso a ruta fija validada por hogar, UTF-8 y 3 MiB; rechazar enlaces simbólicos; conservar huella resuelta | Backend y metadatos del hogar | Consulta autenticada y marca de versión vista | E11 | Se conserva; no admitir direcciones externas ni ampliar permisos | código |
| F-131 | Buscar o escribir iconos actuales | Buscar sugerencias y añadir identificador MDI válido, con iconos de las entidades disponibles | Selector de icono de ficha/espacio/controles | Abrir selector, buscar o escribir icono | E08, E09 | Se conserva; unificar selectores y nombres simples no debe quitar la entrada de iconos fuera de las sugerencias | código |

## Conectar mi casa: actualización de main durante el cierre

La rama principal avanzó a `764a9e0` (PR #50, Conectar mi casa) durante el cierre. Se integró ese commit y se contrastaron su código y pruebas fuente; las funciones siguientes no son implementación de E00. Fuentes: `src/editor/connect-home.ts`, `src/model/connect-home.ts`, métodos `connectApply`/`connectAdd` de `src/editor/index.ts`, `tests/card/connect-home.browser.spec.mjs` y el contrato actualizado de espacios.

| Id | Función | Qué permite hacer | Dónde está hoy | Cómo se llega | Etapa que la toca | Qué pasa con ella | Comprobada en |
|---|---|---|---|---|---|---|---|
| F-132 | Elegir vínculo espacio-área | Conservar vínculo actual, aceptar sugerencia por nombre, elegir área, dejar sin área u ofrecer crearla | Ajustes → Conectar mi casa | Elegir área de cada espacio | E02, E05, E11 | Se conserva; las sugerencias no cambian datos antes de aplicar | código |
| F-133 | Crear áreas explícitamente | Crear sólo las áreas nombradas por el botón y vincular lo creado; advertir que deshacer no borra áreas de HA | Conectar mi casa | Crear un área y vincular / Crear varias y vincular | E02, E05, E11 | Se conserva; es una escritura real en HA, distinta del borrador del plano | código |
| F-134 | Proponer dispositivos por área | Ver dispositivos y entidades sin dispositivo de las áreas vinculadas que aún no están en el plano; empezar sin selecciones | Conectar mi casa | Lista de propuestas por espacio | E02, E05 | Se conserva; no asignar automáticamente dispositivos a otras áreas HA | código |
| F-135 | Agregar seleccionados dentro del espacio | Incorporar sólo lo marcado, con vínculos y lecturas, repartido dentro de su espacio; mover después y guardar explícitamente | Conectar mi casa | Agregar seleccionados | E02, E05, E11 | Se conserva; el agregado queda en el borrador y no ejecuta controles | código |
| F-136 | Resolver falta de áreas, duplicados y fallos parciales | Avisar si no hay registro; impedir dos espacios para la misma área; conservar áreas ya creadas si falla una siguiente | Conectar mi casa | Abrir o aplicar vínculos | E02, E05 | Se conserva; no repetir sin explicar una escritura parcialmente completada | código |
| F-137 | Conservar el vínculo de área en los datos | Leer/validar `rooms[].areaId` opcional y mantenerlo al editar otras propiedades de un espacio | Contrato y editor | Guardar espacio, importar y cargar configuración | E05, E11 | Se conserva; vínculo ausente o área eliminada no rompe planos anteriores | código |

## A decidir para el propietario

### D-E00-01 — Dónde consultar el historial

**Funciones:** F-003 y F-018. El historial actual se abre como diálogo. E02 exige pantallas en lugar de ventanas apiladas, pero falta validar el destino concreto del historial. **Recomendación:** mantener el acceso desde la barra de actividad y mostrarlo como pantalla con vuelta al plano. **Ejemplo:** tocar «Enviado» permite ver los eventos recientes y volver sin perder el encuadre. No se ha diseñado ni implementado esta propuesta.

Son decisiones de destino de funciones existentes. Las cinco decisiones abiertas de ESTADO.md siguen sin resolver; este documento no las modifica. Las dudas de acceso a herramientas no se incluyen en esta lista.

### D-E00-02 — Alertas actuales sin regla visible

**Funciones:** F-004, F-047, F-048. El rediseño no debe quitar las alertas por defecto al sacar categorías. **Recomendación:** reglas base visibles y desactivables, como recomienda ESTADO para E07. **Ejemplo:** una fuga mantiene su aviso al migrar y la persona puede ver qué regla lo origina. Requiere decisión del propietario; no se modifica ahora.

### D-E00-03 — Fuente y confianza del estado

**Función:** F-053. La maqueta modular no define dónde se configura la fuente explícita y su atributo. **Recomendación:** conservar el editor dentro de las opciones avanzadas del vínculo. **Ejemplo:** un sensor de consumo independiente puede aportar evidencia del encendido, mientras el eco RF sólo prueba la salida de la señal. No confirmar un estado por elegir una etiqueta.

### D-E00-04 — Acciones lógicas y paneles anteriores

**Funciones:** F-079 y F-080. Un diseñador común no especifica por sí solo el destino de estas herramientas. **Recomendación:** conservarlas en Ajustes avanzados y permitir que los controles las referencien; unificar la interfaz sin borrar los mapas existentes. **Ejemplo:** un panel anterior que invoca un script con destino explícito sigue abriendo aunque se adopte el diseñador nuevo.

### D-E00-05 — Restaurar dibujos anteriores

**Funciones:** F-089 y F-124. El propietario descartó «Versiones guardadas» de la maqueta; el código actual sí tiene Planos anteriores y Restaurar. **Recomendación:** conservar el respaldo técnico y ubicar la restauración avanzada en Importar y exportar; validar que ese acceso concuerde con lo descartado antes de modificarlo. **Ejemplo:** recuperar el dibujo previo sin reintroducir entidades o reglas de un JSON viejo. No se autoriza quitar nada por interpretar una imagen.

### D-E00-06 — Migración y referencia de tarjeta

**Función:** F-118. No hay destino explícito de esta herramienta en las pantallas modulares. **Recomendación:** mantenerla en el editor avanzado de tarjeta. **Ejemplo:** una tarjeta que trae configuración inline puede pasar al hogar de la integración sin pedir que el usuario copie sus datos a mano.

## Índice estático de comandos y ventanas

Escaneo de `src/` sobre `main` integrado: 67 ocurrencias de atributos `data-command`, con 51 nombres literales distintos y otras expresiones generadas. Las 51 cadenas literales tienen correspondencia en esta tabla. Los selectores y formularios también disparan funciones y están registrados en las tablas por pantalla. **Esto acredita trazabilidad estática, no ejecución.**

| Comandos literales encontrados | Funciones |
|---|---|
| `activity`, `alerts` | F-003, F-004, F-018–F-020 |
| `all`, `room-new` | F-035, F-090, F-093 |
| `edit`, `fixed` | F-006, F-051, F-100 |
| `add`, `from-entity`, `correct-fixed` | F-043, F-051, F-057 |
| `health-action`, `health-fix-safe` | F-026–F-028 |
| `room-open`, `room-add-zone`, `room-add-all`, `review-spaces`, `zones-edit` | F-075, F-077, F-088, F-090 |
| `add-control`, `remove-control` | F-080 |
| `export`, `backup`, `cancel-import`, `apply-import`, `plans`, `restore-plan` | F-082–F-089 |
| `ctl-add`, `ctl-mode`, `ctl-orientation`, `ctl-step-add`, `sheet-size` | F-094–F-097 |
| `new`, `list`, `create`, `learn` | F-098, F-099, F-108 |
| `add-widget`, `add-slot`, `auto-layout`, `widget-cancel`, `widget-save`, `delete-remote` | F-103–F-107 |
| `listen`, `try`, `failed`, `worked`, `save`, `close` | F-108–F-113; `save` y `close` también se reutilizan según la pantalla |
| `refresh` | F-114 |
| `zone-undo`, `zone-apply` | F-091, F-092 |
| `linked-review` | F-127 |
| `connect-apply`, `connect-add` | F-132–F-136 |

Generadores revisados además de las cadenas literales:

| Generador o vía de evento | Comandos y funciones |
|---|---|
| `src/shell/top-bar.ts`: `item` | `edit`, `plan-settings`, `fullscreen`, `info`; comandos de aplicación `plan`, `rf`, `new`, `storage`, `ha-menu`, y cambio de hogar: F-006–F-017 |
| `src/shell/layers.ts`: `renderLayers`, `iconButtonMarkup` | `layer-controls`, `layer-sensors`, `layer-energy`, `layer-infrastructure`: F-021; zoom `in`, `out`, `room-view`: F-032, F-035 |
| `src/card/home-manager-card.ts`: botones y despachador | `add-device`, `settings`, `exit`, `save-info`, `save`, `discard`, `undo`, `redo`, `fixed`, `room-new`: F-051, F-057–F-061, F-090, F-093, F-120 |
| `src/card/room-view.ts`: `navModesMarkup` | `nav-arrows`, `nav-swipe`: F-036, F-037 |
| `src/editor/index.ts`: iconos del pie y eventos | `settings`, `close`, `delete`, `move`, `reset`, `room-up`, `room-down`, `room-remove`, formularios de dispositivo/fuente/acción/panel/hogar/migración/espacios: F-024, F-050–F-059, F-076–F-080, F-118. Los manejadores de orden y quitar también contienen compatibilidad con controles anteriores: no se presupone que todos tengan un botón visible hoy |
| `src/editor/controls-editor.ts`: `iconButton` y campos | `ctl-remove`, `ctl-pin`, `ctl-step-remove`; selector de toque, entidad y pasos: F-094–F-097 |
| `src/card/zone-editor.ts`: `button` | `zone-new`, `zone-add`, `zone-cut`, `zone-delete`, `zone-cancel`; selecciones, nombre, fusión, teclado y arrastre: F-090–F-092 |
| `src/editor/device-picker.ts`: `data-action`, búsqueda y formularios | Volver, cancelar, avanzada, confirmar, seleccionar dispositivo y lecturas: F-062–F-065 |
| `src/editor/room-actions.ts`: `data-action` | Fusionar, quitar, cancelar, aplicar, editar forma o tomar zona SVG: F-077, F-078 |
| `src/editor/plan-review.ts`: `data-review` | Cancelar, sólo plano y aplicar; movimientos, huérfanos, formas propias y zonas nuevas: F-086, F-087 |
| `src/ui/alert-editor.ts`: atributos y campos | Editar, quitar, agregar, activar, contar y resaltar: F-046–F-048 |
| `src/rf/manager.ts`: campos, atributos y eventos del lienzo | Abrir mando/pestaña, iconos, nombre, ajustes, probar/eliminar botón, partes y roles, slots y dimensiones: F-098–F-107 |
| `src/rf/learn.ts`, `devices.ts`: atributos y cambios | Receptor, sugerencias, iconos, roles, YAML/copia, receptor predeterminado y prueba: F-108–F-116 |
| `src/panels/`, `src/ui/control-view.ts` | Controles propios/nativos, selección de valores, scripts, corrección estimada y foco: F-066–F-074 |
| `src/editor/connect-home.ts` y eventos del editor | `connect-apply`, `connect-add`, `data-connect-room` y `data-connect-device`: F-132–F-137 |
| `src/card/linked-plan.ts`: generador de botón y `linkedCommand` | `linked-review`, `linked-ignore`, `linked-close`, `linked-undo`: F-127–F-129; `linkedBox` también genera Revisar en el editor |

### Aperturas `showModal`

Son 12 puntos de apertura, no doce flujos únicos. Uno es la reapertura de una revisión al repintar Ajustes. Un helper puede abrir varias tareas. Las recomendaciones para E02 **todavía no equivalen a su parada de validación**.

| Fuente y línea en la base | Uso actual | Funciones | Tratamiento recomendado para su etapa |
|---|---|---|---|
| `src/app/index.ts:225` | Mantenimiento de almacenamiento | F-119 | Pantalla de trabajo; confirmar por separado cada purga |
| `src/card/editing.ts:384` | Helper de historial, alertas, ayuda, información y confirmación de cambios | F-018–F-020, F-060, F-074 | Clasificar por invocación: trabajo a pantalla; preguntas simples a confirmación |
| `src/card/zone-editor.ts:566` | Revisar cambios de espacio al aplicar zonas | F-092 | Pantalla de revisión |
| `src/card/zone-editor.ts:592` | Ayuda de primer dibujo sin zonas | F-093 | Conservar explicación y acceso al primer dibujo; ubicación a validar |
| `src/editor/device-picker.ts:255` | Selector de dispositivo y lecturas | F-062–F-065 | Ficha o pantalla según validación de E02 |
| `src/editor/index.ts:654` | Ajustes | F-022–F-028, F-075–F-089, F-125 | Pantalla real |
| `src/editor/index.ts:660` | Reabrir revisión después de un repintado de Ajustes | F-086, F-127 | Conservar lo escrito y la revisión pendiente; no crear una tarea duplicada |
| `src/editor/plan-review.ts:245` | Revisión de importación | F-086, F-087 | Pantalla de revisión |
| `src/editor/room-actions.ts:104` | Editar espacio | F-077, F-078 | Pantalla de trabajo |
| `src/panels/native-panel.ts:266` | Ventana de controles | F-070–F-074 | Conservar controles y accesos; validar objetivo en E09 |
| `src/rf/manager.ts:168` | Editor de widget | F-104, F-106 | Dentro del diseñador, sin apilar ventanas |
| `src/ui/confirm-dialog.ts:59` | Confirmaciones de quitar/restablecer/descartar | F-054, F-056, F-091, F-107 | Confirmación pequeña; no más de una activa |

### Contraste de maqueta por lectura del HTML

Se recuperó la fuente completa de la maqueta desde la rama de guías. Contiene seis dibujos: ficha de ventilador, ficha de planta, agregar módulo, ficha móvil, Reglas y alternativas del plano. Se contrastaron sus notas y estructura con las filas de este inventario. **No se afirma haberlos renderizado ni inspeccionado visualmente.**

- Las categorías actuales no se eliminan en E00 ni E01; la estructura base/módulos corresponde a E05.
- Los avisos configurables se trasladan a Reglas en E07; no se reemplazan por botones con umbrales fijos.
- Las alternativas de plano incluyen imagen clara/oscura, fondo y miniatura; esas posibilidades futuras no están implementadas por este inventario.
- El historial, las fuentes de estado y los editores avanzados requieren los destinos expresos D-E00-01 y D-E00-03–D-E00-06, porque una maqueta no autoriza a quitarlos.

## Evidencia y comprobaciones

### Capturas históricas realmente inspeccionadas

Las diez imágenes siguientes se abrieron y se inspeccionaron en esta sesión. Sus carpetas identifican la etapa de origen; no contienen un SHA de ejecución, por lo que no se atribuyen a una beta o commit más preciso. Ninguna prueba el comportamiento de `main 764a9e0`. En las filas, «captura» sólo respalda lo visible; la conducta descrita se contrastó en código.

| Código | Etapa/versión de origen | Archivo | Qué se puede verificar en la imagen |
|---|---|---|---|
| C01 | 0.7 | [Menú](../evidence/0.7/desktop-menu.png) | Barra, estado enviado, reloj, menú y espacio resaltado |
| C02 | 0.7 | [Plano móvil](../evidence/0.7/mobile-plan.png) | Capas, zoom, agrupación de símbolos y riel |
| C03 | 0.8 · selector | [Lecturas](../evidence/0.8-picker/desktop-readings.png) | Principal, adicionales, exclusiones, volver y cancelar |
| C04 | 0.8 · pantalla del dispositivo | [Medidor](../evidence/0.8-device-screen/desktop-meter.png) | Valores, seis canales, actividad/diagnóstico y acceso a HA |
| C05 | 0.9 · CP4 | [Aviso en ficha](../evidence/0.9-cp4/desktop-light-inspector-rule.png) | Límites editables, duración, nivel y pie de ficha flotante |
| C06 | 0.9 · CP6 | [Roles y ajustes RF](../evidence/0.9-cp6/desktop-dark-settings.png) | Roles, transmisor, pulso, repeticiones, espera y quitar control |
| C07 | 0.9 · CP6 | [Candidato móvil](../evidence/0.9-cp6/mobile-light-candidate.png) | Receptor, candidato, detalles, nombres e iconos |
| C08 | 0.9 · CP6 | [Diseñador](../evidence/0.9-cp6/desktop-light-designer.png) | Lienzo, editar/quitar, agarres de tamaño y diseño automático |
| C09 | 0.9 · CP6 | [Equipos y YAML](../evidence/0.9-cp6/desktop-light-yaml.png) | Preparación del equipo, YAML, copia y actualización |
| C10 | 0.9 · CP6 | [Hogar nuevo](../evidence/0.9-cp6/mobile-dark-new-home.png) | Formulario, crear y cancelar |

### Código, traducciones y pruebas leídas

- Implementaciones citadas en cada sección, incluidas las de integración y el plano vinculado y Conectar mi casa de main.
- Contraste con pruebas de shell, vista por espacio, editor, RF y hogares, en `tests/card/shell.browser.spec.mjs`, `tests/card/room-view.browser.spec.mjs`, `tests/editor/editor.browser.spec.mjs`, `tests/rf/rf.browser.spec.mjs` y `tests/integration/home.browser.spec.mjs`; para la actualización final también `tests/card/connect-home.browser.spec.mjs` y `tests/model/connect-home.test.mjs`. Leer una prueba no equivale a ejecutarla.
- Revisión de claves de `src/i18n/en.ts`, `en-controls.ts`, `en-rf.ts` y `en-shell.ts`: guardado, almacenamiento, historial, fuente de estado, controles, candidatos, intentos y archivo vinculado tienen correspondencia con F-053, F-059, F-070–F-074, F-089, F-094–F-116 y F-119–F-130. Las claves antiguas sin emisor vigente no se cuentan como funciones visibles.
- Escaneo literal y revisión de generadores: 51 comandos, 65 ocurrencias y 12 puntos de apertura, documentados arriba. No aparecieron acciones visibles de esos generadores sin una función asignada.

### Intentos de ejecución, en el orden de las guías

1. Servidor sintético levantado con puerto propio 4197 mediante `npm run dev`; el navegador integrado respondió `ERR_CONNECTION_TIMED_OUT` al fixture HTTP. La maqueta no es requisito de E00 y no se insistió en la apertura local rechazada.
2. Playwright por terminal: la ejecución inicial completa se interrumpió sin casos iniciados. Un intento dirigido en 4199 falló con `EADDRINUSE`; se eligió después un puerto asignado libre por el sistema (54929), con escritorio/móvil y límite global de 45 s. Terminó por tiempo de espera en la preparación del plugin antes de iniciar los casos. Resultado: **navegador no aprobado**, sin conteo de casos ejecutados. El Chrome de escritorio tampoco pudo adquirirse por estar minimizado; no se interactuó con la pestaña de HA real.
3. Se inspeccionaron las diez capturas históricas C01–C10.
4. Se completó la revisión por código, traducciones y pruebas fuente. Ninguna fila se marca «app».

### Comprobaciones locales

- `npm ci --ignore-scripts --offline --no-audit --no-fund`: falló con `ENOTCACHED` al faltar TypeScript. Se usó la alternativa de la guía: dependencias copiadas de otra copia local del mismo repositorio. SHA-256 de ambos `package-lock.json`: `b00ad4f81b3ec579edbd189be626e1628ca6b54d2e3488f75f23eb4cd308f934`.
- Tras integrar main y guías: `npm run check` pasó, con **248 pruebas** más tipos y límites públicos; `npm run format:check` pasó. El build incluido en check pasó.
- Python y extremo a extremo: no corridos. E00 no modifica integración, contrato ni flujos del producto; el código de plano vinculado y Conectar mi casa proviene íntegramente de main.
- Sin capturas nuevas ni pantallas modificadas por E00. Los assets de maqueta y los cambios de servidor/comprobador público provienen de la rama de guías, no son implementación de otra etapa.

### Para el auditor

El auditor debe recorrer en vivo las filas cuya evidencia sea sólo código y reconfirmar las históricas con la versión integrada, especialmente guardado/deshacer, revisiones/importaciones, corrección de estado sin envío, aprendizaje RF y plano vinculado. Es una tarea de auditoría declarada, no un bloqueo ni una decisión que se traslade al propietario.

Hallazgos que no se arreglan en E00:

- El botón de la ficha «Restablecer valores sugeridos» repone sugerencias de la entidad; no es un «volver este dispositivo a como estaba al abrir la ficha». El deshacer global existe. E01 debe contrastar esa diferencia antes de afirmar que ya conserva un deshacer local que no se encontró.
- La ficha sigue flotante en el código y en C05; Ajustes usa diálogo, y hay una reapertura de revisión al repintar. La clasificación de ventanas queda preparada para E02, sin programarla.
- La captura C04 muestra tabla de canales con nombres reconocibles; no prueba que cualquier medidor con lecturas llamadas Power 1 se reconozca igual. E04 debe comprobar ese caso con fixtures.

La documentación de E00 está completa para revisión según las alternativas admitidas por la guía actualizada. La validación en vivo pendiente está declarada y no se marca como aprobada. Se requiere validación del propietario sobre los seis destinos «a decidir» antes de E01.
