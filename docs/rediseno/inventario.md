# Inventario de funciones — E00, avance parcial

**Estado: incompleto. No usar como aprobación para E01.**

Base examinada: `main` en `9a5d975898f51c7f83eb7e95aca735c88a1b995c`. Guías: `claude/guias-rediseno`, commit `4e376aa`. Fecha: 2026-10-31. No incluye el plano vinculado del PR #47, que seguía abierto al consultar.

Estas 28 filas registran únicamente funciones encontradas en los archivos leídos. **No se verificaron en la app corriendo.** La apertura de la maqueta fue rechazada por la política del navegador antes del recorrido. No se ha contrastado todavía la totalidad de `data-command`, `showModal` ni las traducciones. El inventario completo sigue pendiente.

Los destinos son obligaciones de conservación para las futuras etapas, no cambios realizados ni decisiones nuevas del propietario.

## Panel: barra superior y menú

Fuente: `src/shell/top-bar.ts`. Los comandos del contenedor se distinguen de los de la tarjeta; los de administración sólo se ofrecen al administrador. Las entradas de hogares y RF dependen del contexto de aplicación.

| Id | Función | Qué permite hacer | Dónde está hoy | Cómo se llega | Etapa que la toca | Qué pasa con ella |
|---|---|---|---|---|---|---|
| F-001 | Identificar el hogar | Ver su nombre y la marca de la aplicación | Barra superior | Abrir el panel | E03 | Se conserva; hoy el nombre se oculta en móvil |
| F-002 | Actividad reciente | Ver el último envío o resultado y su antigüedad | Barra superior | Abrir el panel | E03 | Se conserva, con el vocabulario de producto |
| F-003 | Abrir historial | Consultar los eventos recientes | Botón de actividad | Tocar la actividad | E02, E03 | Se conserva; destino del historial pendiente de validar, ver D-E00-01 |
| F-004 | Acceder a alertas | Ver el número de avisos cuando existen | Barra superior | Tocar la píldora de alertas | E03, E07 | Se conserva; E03 incorpora el símbolo solicitado |
| F-005 | Reloj | Consultar la hora | Barra superior en escritorio | Abrir el panel | E03 | Se conserva; no se muestra en móvil |
| F-006 | Editar plano | Entrar a la edición como administrador | Menú principal | Menú → Editar plano | E01, E02 | Se conserva |
| F-007 | Volver al plano | Elegir la sección Plano | Menú de la aplicación | Menú → Plano | E02 | Se conserva |
| F-008 | Abrir Controles RF | Acceder al gestor RF como administrador | Menú de la aplicación | Menú → Controles RF | E02, E09, E10 | Se conserva |
| F-009 | Abrir ajustes | Entrar a los ajustes del plano como administrador | Menú principal | Menú → Ajustes del plano | E02 | Cambia de lugar: pantalla de Ajustes, conservando sus secciones |
| F-010 | Elegir hogar | Cambiar el hogar activo cuando hay más de uno | Menú de la aplicación | Menú → Hogar | E02 | Se conserva; falta revisar persistencia y contenedor |
| F-011 | Nuevo hogar | Acceder a la creación como administrador | Menú de la aplicación | Menú → Nuevo hogar | E02 | Se conserva; falta recorrer la creación |
| F-012 | Almacenamiento | Consultar el almacenamiento como administrador | Menú de la aplicación | Menú → Almacenamiento | E02 | Se conserva; falta recorrer su contenido |
| F-013 | Tema | Acceder a la elección de tema | Menú principal | Menú → selector de tema | E03, E11 | Se conserva; falta revisar las opciones y su persistencia |
| F-014 | Pantalla completa | Solicitar pantalla completa | Menú principal | Menú → Pantalla completa | E13 | Se conserva; no equivale a dar por implementado todo el modo pared |
| F-015 | Ayuda | Abrir la ayuda | Menú principal | Menú → Ayuda | E02 | Se conserva; falta revisar su contenido |
| F-016 | Navegar con teclado | Recorrer y cerrar el menú | Menú principal | Flechas, Inicio, Fin y Escape | E02, E03 | Se conserva, incluido el retorno del foco |
| F-017 | Menú de Home Assistant | Acceder al menú del contenedor en una pantalla estrecha | Menú de la aplicación | Menú → Menú de Home Assistant | E02 | Se conserva cuando el contexto lo ofrece |

## Historial y alertas

Fuente: `src/shell/activity-view.ts`. El historial se dibuja en orden inverso y las alertas se leen del estado de ejecución; no se cambió su comportamiento.

| Id | Función | Qué permite hacer | Dónde está hoy | Cómo se llega | Etapa que la toca | Qué pasa con ella |
|---|---|---|---|---|---|---|
| F-018 | Consultar el detalle de actividad | Ver hora, mensaje, dispositivo, acción y resultado disponibles | Diálogo de historial | Tocar actividad | E02, E03 | A decidir: ubicación futura del historial; recomendación D-E00-01 |
| F-019 | Elegir un aviso | Elegir un dispositivo cuando hay varias alertas | Diálogo de alertas | Tocar alertas | E02, E07 | Se conserva; E07 debe mantener acceso al origen del aviso |
| F-020 | Localizar el origen de una alerta | Seleccionar y encuadrar el dispositivo, activar sus capas y llevarle el foco | Plano | Una alerta se localiza directamente; varias permiten elegir | E03, E07 | Se conserva, incluido acceso por teclado |

## Capas

Fuente: `src/shell/layers.ts`. La lista actual declara Controles, Sensores, Energía e Infraestructura. El estado de cada botón expresa si su capa está activa. Aún falta revisar qué símbolos entran en cada capa y los valores iniciales.

| Id | Función | Qué permite hacer | Dónde está hoy | Cómo se llega | Etapa que la toca | Qué pasa con ella |
|---|---|---|---|---|---|---|
| F-021 | Filtrar capas | Mostrar u ocultar grupos de símbolos | Barra de capas sobre el plano | Tocar cada capa | E03, E05 | Se conserva; E03 usa sólo símbolos, con nombres accesibles |

## Ajustes: navegación, espacios y diagnóstico

Fuente: `src/editor/settings-page.ts`. La página tiene seis secciones y contadores de problemas. Los cuerpos de acciones, paneles, referencias e importación se generan en el editor y **todavía no se inventariaron**. La existencia de una entrada de menú no acredita la revisión de su flujo.

| Id | Función | Qué permite hacer | Dónde está hoy | Cómo se llega | Etapa que la toca | Qué pasa con ella |
|---|---|---|---|---|---|---|
| F-022 | Cambiar sección de ajustes | Entrar a Plano y espacios, Diagnóstico, Acciones lógicas, Paneles nativos, Referencias pendientes o Importar y exportar | Navegación de Ajustes | Abrir ajustes y elegir sección | E02 | Se conserva; faltan las funciones internas de cuatro secciones |
| F-023 | Consultar espacios | Ver nombre, icono, cantidad de dispositivos y situación de su forma | Plano y espacios | Abrir la sección | E02, E11 | Se conserva |
| F-024 | Ordenar y abrir un espacio | Acceder a su edición y al control de orden mediante agarre o teclado | Lista de espacios | Abrir una fila o usar su control de movimiento | E02, E11 | Se conserva; falta contrastar los manejadores del editor |
| F-025 | Reemplazar el dibujo | Acceder a la importación desde la miniatura del plano | Plano y espacios | Reemplazar plano | E02, E11 | Se conserva; falta inventariar revisión y resolución de conflictos |
| F-026 | Consultar diagnóstico | Ver resumen del plano y problemas de zonas, ubicación, entidades o nombres duplicados | Diagnóstico | Elegir Diagnóstico | E02, E11 | Se conserva, con las acciones individuales que correspondan |
| F-027 | Resolver un problema individual | Abrir el elemento, agregar una zona no usada, quitar un espacio vacío o corregir una ubicación, según el caso | Diagnóstico | Botón de cada problema | E02, E11 | Se conserva; falta comprobar cada manejador y su deshacer |
| F-028 | Arreglar lo seguro | Solicitar correcciones de ubicación y retirada de espacios vacíos sin zona, con posibilidad de deshacer | Diagnóstico | Arreglar lo seguro | E02, E11 | Se conserva; falta comprobar aplicación y reversión |

## A decidir: registro parcial para el propietario

### D-E00-01 — Dónde consultar el historial

**Funciones:** F-003 y F-018. El historial actual se abre como diálogo. E02 exige pantallas en lugar de ventanas apiladas, pero falta validar el destino concreto del historial. **Recomendación:** mantener el acceso desde la barra de actividad y mostrarlo como pantalla con vuelta al plano. **Ejemplo:** tocar «Enviado» permite ver los eventos recientes y volver sin perder el encuadre. No se ha diseñado ni implementado esta propuesta.

No constituye una lista exhaustiva de decisiones: faltan los recorridos y el contraste completo. Las cinco decisiones abiertas de ESTADO.md siguen sin resolver; este documento no las modifica.

## Cobertura pendiente

- Recorrido visual de la maqueta y de la app con datos inventados.
- Plano y gestos: toque, mantener, atajos, vista por espacio, flechas, deslizar, zoom y Ahora.
- Ficha completa y barra de edición: vínculo, controles, presentación, avisos, movilidad, posición, quitar, mover, guardar, descartar, deshacer y rehacer.
- Selector de dispositivos y entidades, pantalla del dispositivo y ventana de controles.
- Cuerpos de Ajustes: acciones, paneles, referencias, importaciones, exportaciones, conflictos, fusiones y editor de zonas.
- Gestor RF: controles, equipos, aprendizaje, candidatos, pruebas, intentos, diseñador, widgets, roles y YAML.
- Creación/selección de hogares, almacenamiento, campos sin pantalla e historial de planos de la integración.
- Mapa completo de acciones `data-command` (también las generadas), otros atributos de acción, aperturas `showModal` y claves de traducción contra IDs del inventario.
- Completar destinos y recomendaciones después de comprobar los flujos; revisar las diferencias entre código, contrato, maqueta y documentación.

## Comprobaciones y límites

- `npm ci --ignore-scripts --offline --no-audit --no-fund`: falló con `ENOTCACHED` al faltar TypeScript en la caché. No se completó una instalación limpia.
- Se reutilizaron dependencias de la copia local de las guías, sin cambiar archivos versionados, y `npm run build` terminó correctamente. Esto sólo comprueba la compilación.
- `npm run check`, `npm run format:check`, pruebas de navegador, Python y extremo a extremo: no ejecutados antes de la pausa.
- Sin capturas: no se cambió ninguna pantalla y no se pudo completar el recorrido. No se consultó ni modificó la casa del propietario.
- Rama y PR: `chatgpt/rediseno-e00-inventario`, [#49](https://github.com/Delpoo/homemanager/pull/49). La entrega está pausada, sin aprobación ni auditoría.
