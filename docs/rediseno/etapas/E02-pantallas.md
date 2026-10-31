# E02 · Pantallas en lugar de ventanas

**Objetivo:** trabajar cómodo en pantallas ordenadas. Nunca una ventana sobre otra.
**Depende de:** E00. Si E01 no está fusionada, coordinar: tocan archivos cercanos.
**Maqueta:** [vision-mockup §9, §11 y §14](../../vision-mockup.html#s9).

## Regla

| Tipo de tarea | Cómo se muestra |
|---|---|
| Trabajo: varios campos, listas, pasos o revisión | Pantalla completa dentro del panel, o dentro de la ficha lateral |
| Pregunta de sí o no | Ventana chica de confirmación, encima de lo que estés haciendo |

Nunca más de una ventana a la vez. Toda pantalla tiene una forma clara de volver, y volver no pierde lo escrito.

## Alcance

Según [inventario.md](../inventario.md), como mínimo:

- **Ajustes del plano:** hoy es un `<dialog class="settings-dialog">`. Pasa a ser una página real, con barra superior y **Guardar**.
- **Vincular un dispositivo:** se abre dentro de la ficha lateral, en sus dos pasos. Recomendación por validar: en escritorio cabe bien. Si queda apretado, usar una pantalla y explicarlo.
- **Agregar dispositivo:** deja de flotar en una esquina y de quedar visible detrás de otra ventana.
- **Revisar cambios del plano, editar un espacio, editor de zonas:** pantallas.
- **Controles RF:** sus editores dejan de abrirse como ventana sobre ventana, salvo las confirmaciones.

Quitar «Versiones guardadas» de lo que se tome como objetivo: la maqueta la muestra, pero el propietario la descartó. **No tocar el historial** de `custom_components/homemanager/store.py`.

## Fuera de alcance

El contenido de cada pantalla (el propietario quiere cambiarlo más adelante, y lo dirá) y el modelo de módulos.

## No se puede perder

Borrador sin guardar, deshacer de un paso al importar, foco y lector de pantalla, volver sin perder datos, y cada acción de Ajustes y RF del inventario.

## Dónde mirar

- `src/editor/index.ts`, `src/editor/settings-page.ts`, `src/editor/device-picker.ts`, `src/editor/room-actions.ts`, `src/editor/plan-review.ts`.
- `src/card/zone-editor.ts`, `src/rf/manager.ts`, `src/rf/learn.ts`, `src/ui/confirm-dialog.ts`, `src/ui/panel-components.ts`.
- Para ubicar todos los casos: buscar `showModal` en `src/`.

## Pasos

1. Reclamar la etapa. Listar cada `showModal` con su clasificación según la regla.
2. **Parada de validación:** enviar al propietario la lista, con la propuesta para Vincular. Si una pantalla no tiene maqueta, armarla con los componentes de la sección 6 y mostrarla.
3. Crear una forma común de pantalla con barra superior y volver, y usarla en todas.
4. Convertir de una a la vez, con commits separados.
5. Pruebas, capturas y reporte.

## Aceptación

- [x] Un recorrido por todos los flujos del inventario nunca muestra dos ventanas a la vez.
- [x] Sólo las preguntas de sí o no usan ventana.
- [x] Ajustes es una página, con el historial del navegador o un botón para volver.
- [x] En 390×844 todo se puede usar sin desplazamiento horizontal.
- [x] Salir con cambios sin guardar pregunta primero.
- [x] Todas las funciones siguen disponibles.

## Registro

### 2026-10-31 — ChatGPT — implementación entregada, validación parcial

- **Autorización:** el propietario aprobó continuar y publicar. La parada del paso 2 quedó resuelta; no volver a pedirla.
- **Hecho:** componente común de pantalla; Ajustes, Vincular, espacios, revisiones, ayuda/listas, Almacenamiento, controles nativos, elemento y aprendizaje RF convertidos. Retorno del foco y borradores conservados; confirmaciones únicas. Main b9cce00 integrado.
- **Verificación:** 250 pruebas de código y 105 casos únicos de navegador aprobados, uno omitido; formato aprobado antes de publicar. Suite general incompleta (64 aprobados/8 fallos antes de interrumpir). Repetir checks sobre el SHA final.
- **Evidencia:** 60/72 capturas transferidas; 12 pendientes por desconexión local. No hay capturas de Almacenamiento ni del editor/revisión de zonas. [Índice](../../evidence/rediseno-e02/README.md).
- **Falta:** todos los recorridos del inventario, suite general, auditoría, teléfono real, lector de pantalla y E2E HA. Las otras cuatro casillas siguen pendientes. [Reporte](../entregas/E02-2026-10-31-continuacion.md) y [68 funciones](../entregas/E02-conservacion.md).


### 2026-10-31 — ChatGPT — a medias
- **Hecho:** etapa reclamada en commit 057982b054015be4060995362414724d4be58b29; clasificación de los 12 showModal de E01, usos del helper general y window.confirm de Almacenamiento. Propuesta revisable de pantallas en ../propuestas/E02-pantallas.md y E02-propuesta.html. No se convirtió el producto.
- **Falta:** validación del propietario de la lista y Vincular; incorporar capturas y ejecutar el HTML publicado; después componente común, conversiones separadas y pruebas completas. Las seis casillas de aceptación permanecen sin marcar.
- **Dónde quedó:** chatgpt/rediseno-e02-pantallas, PR #52, commit de entrega «docs(rediseno): presentar E02 y registrar parada de validación». Base E01 68366ab7e21d7eb1df6494afe9cb5a96e62bff6e, árbol de reclamación 2457dad0592520b9a6be66bfd0738e24776a67c3. Reporte en ../entregas/E02-2026-10-31.md; el SHA final está en la cabecera del PR.
- **Para quien siga:** respetar la parada del paso 2. Vincular recomendado en ficha de 380 px escritorio / pantalla completa móvil; guardar y volver conservan el borrador. No reinterpretar la maqueta como permiso para quitar campos, diseñador, avisos o historial. Prototipo local inicial: 23 vistas × dos temas × dos tamaños = 92 distribuciones comprobadas, ocho capturas y cuatro de Vincular inspeccionadas; la ampliación posterior no se confirmó. El HTML publicado es una reconstrucción revisada por código, no la versión que pasó esas pruebas. El entorno de archivos pasó a rechazar rutas Windows por «invalid sandbox permission path URI: file:///workspace»; terminal y vía Node no permitieron recuperar los archivos. Cierre hecho con GitHub, sin pedir al propietario resolver herramientas. El árbol remoto es la fuente para retomar; preservar los archivos locales de propuestas/capturas si reaparecen y no sobrescribir el remoto con la copia local desactualizada.

- **Base al cerrar:** main avanzó a dc7a910e3a901a38a5f23554a30dfd752d5f5940 (#53, limpieza de 0.10) después de crear las ramas. Se revisó su diferencia contra 764a9e0: README, instalación, hoja de ruta, traducciones sin uso y componente/CSS sin uso. E01 no usa panelEmpty y sus cinco traducciones nuevas no están entre las quitadas; no se detectó un cruce funcional por lectura. Esa limpieza no se incorporó a estas ramas ni se ejecutó la combinación: al integrar las bases, conservarla y repetir checks. Entrega de propuesta: 38751fb519ccecc4973c3a36f0237c6afb63d45a.

### 2026-10-31 — ChatGPT — lote 0, cierre E02

- **Hecho:** resuelto el Volver duplicado en Movimientos y el desplazamiento horizontal de herramientas de zonas en teléfono. Pruebas ajustadas al guardado explícito y a la ayuda inicial que cubre la barra. Nuevo caso de confirmaciones simultáneas y conservación de casillas al volver. Instrucción íntegra en modo-continuo.md.
- **Alcance recorrido:** Ajustes/página y Guardar; Vincular en dos pasos/ficha 380 px o página móvil; Agregar sin ventana detrás; espacio/revisión/importación/lienzo y movimientos; gestores y aprendizaje RF como pantallas. Los contenidos y el historial técnico se conservan.
- **No se puede perder:** borrador compartido y formularios (task-screens); deshacer de importación en un paso (task-screens/plan-import); foco, título, regiones y fondo inerte (pruebas de foco, confirmación y panel nativo); todas las acciones de Ajustes/RF (inventario y suites específicas/CI). Lector físico pendiente de auditoría, sin afirmar que se usó.
- **Decisiones:** se mantienen ficha de 380 px en escritorio/página en teléfono, ayuda/actividad/Almacenamiento como páginas y ajustes técnicos avanzados; conservan funciones y usan los componentes comunes. Propuesta E02 y recomendaciones E00 aceptadas por el propietario; no hay otra parada de diseño.
- **Comprobaciones locales:** 44 casos únicos de escritorio aprobados (43 del grupo específico, con tres corregidos/repetidos, y uno nuevo); npm run check aprobado (250 pruebas, tipos y límites); format:check aprobado al cerrar el lote. Suite completa reservada a GitHub. No se corrió pytest local: integración/contrato sin cambios.
- **Capturas:** 72 originales recuperadas completas + 16 del cierre, con origen y SHA-256; índice en ../../evidence/rediseno-e02/README.md. Sólo se revisaron visualmente las necesarias.
- **Falta:** auditoría independiente; el resultado vigente de CI se consulta en el PR #52; teléfono/lector físicos y E2E HA no ejecutados en este lote. La prueba E2E completa corresponde al cierre del lote 4 según modo-continuo.md.
- **Dónde quedó:** chatgpt/rediseno-e02-pantallas, PR #52 con base main y listo para revisión; commit de cierre «E02: cerrar pantallas, conservar zonas y registrar modo continuo». No fusionar ni publicar.
- **Para quien siga:** después de terminar CI, detenerse. El próximo «continuá» toma lote 1 (E03/E04). No modificar PR #48, #49 o #51. Los reportes de entregas anteriores son históricos: el reporte vigente de este lote está sólo en el PR.

#### Aceptación, punto por punto

| Punto | Resultado | Cómo se comprobó |
| --- | --- | --- |
| Un recorrido por todos los flujos del inventario nunca muestra dos ventanas a la vez. | Cumplido | Las 12 aperturas anteriores son pantallas; showModal sólo aparece en confirm-dialog.ts. Prueba nueva de dos descartes simultáneos: una confirmación; cancelar conserva el formulario. Revisión de las 68 filas abajo. |
| Sólo las preguntas de sí o no usan ventana. | Cumplido | Búsqueda de showModal en todo src; único punto con confirmación/Cancelar y guardián global. Las tareas tienen role=region. |
| Ajustes es una página, con el historial del navegador o un botón para volver. | Cumplido | Prueba settings is a page: no dialog, Volver conserva campos; Guardar arriba. Capturas originales de las siete secciones. |
| En 390×844 todo se puede usar sin desplazamiento horizontal. | Cumplido | 72 capturas originales con comprobación de overflow y 16 del cierre. El script verifica pantallas y barras de zonas. Corregido el desbordamiento interno de herramientas, con recaptura sólo de sus dos variantes móviles. |
| Salir con cambios sin guardar pregunta primero. | Cumplido | Pruebas de descarte del plano y espacio, cancelación RF y purga; Volver que conserva el formulario no descarta. Guardar explícitamente antes de salir conserva cambios. |
| Todas las funciones siguen disponibles. | Cumplido | Revisión fila por fila de las 68 asignadas E02: destino y evidencia abajo. Compatibilidad con posiciones antiguas, acciones avanzadas, zonas, importación/deshacer y RF conservada; no cambia el contrato ni el backend. |

#### Inventario E02, fila por fila

«Disponible» acredita conservación por código y los recorridos citados; no equivale a probar todas las variantes en hardware. La auditoría independiente sigue separada.

| ID | Función | Disponibilidad / destino | Método y evidencia |
| --- | --- | --- | --- |
| F-003 | Abrir historial | Disponible: Pantalla Historial de actividad | src/shell/activity-view.ts; pruebas shell y task-screens |
| F-006 | Editar plano | Disponible: Menú/editor del plano; navegación, permisos y borrador explícito conservados | src/card/editing.ts; src/shell/top-bar.ts; pruebas de código, controles y task-screens |
| F-007 | Volver al plano | Disponible: Menú/editor del plano; navegación, permisos y borrador explícito conservados | src/card/editing.ts; src/shell/top-bar.ts; pruebas de código, controles y task-screens |
| F-008 | Abrir Controles RF | Disponible: Menú/editor del plano; navegación, permisos y borrador explícito conservados | src/card/editing.ts; src/shell/top-bar.ts; pruebas de código, controles y task-screens |
| F-009 | Abrir ajustes | Disponible: Menú/editor del plano; navegación, permisos y borrador explícito conservados | src/card/editing.ts; src/shell/top-bar.ts; pruebas de código, controles y task-screens |
| F-010 | Elegir hogar | Disponible: Menú de la aplicación; elegir/crear hogar y guardar explícitamente | src/app/index.ts; código conservado y pruebas home |
| F-011 | Nuevo hogar | Disponible: Menú de la aplicación; elegir/crear hogar y guardar explícitamente | src/app/index.ts; código conservado y pruebas home |
| F-012 | Almacenamiento | Disponible: Pantalla Almacenamiento; purga con confirmación | src/app/index.ts; prueba task-screens y captura storage |
| F-015 | Ayuda | Disponible: Pantalla Ayuda o lista de avisos, con vuelta | src/card/editing.ts; src/card/plan-view.ts; pruebas shell y task-screens |
| F-016 | Navegar con teclado | Disponible: Menú/editor del plano; navegación, permisos y borrador explícito conservados | src/card/editing.ts; src/shell/top-bar.ts; pruebas de código, controles y task-screens |
| F-017 | Menú de Home Assistant | Disponible: Menú/editor del plano; navegación, permisos y borrador explícito conservados | src/card/editing.ts; src/shell/top-bar.ts; pruebas de código, controles y task-screens |
| F-018 | Consultar el detalle de actividad | Disponible: Pantalla Historial de actividad | src/shell/activity-view.ts; pruebas shell y task-screens |
| F-019 | Elegir un aviso | Disponible: Pantalla Ayuda o lista de avisos, con vuelta | src/card/editing.ts; src/card/plan-view.ts; pruebas shell y task-screens |
| F-022 | Cambiar sección de ajustes | Disponible: Ajustes: secciones existentes, incluidas acciones/paneles avanzados y plano vinculado | src/editor/index.ts; src/editor/settings-page.ts; pruebas plan-health, editor y plan-import |
| F-023 | Consultar espacios | Disponible: Ajustes: secciones existentes, incluidas acciones/paneles avanzados y plano vinculado | src/editor/index.ts; src/editor/settings-page.ts; pruebas plan-health, editor y plan-import |
| F-024 | Ordenar y abrir un espacio | Disponible: Ajustes: secciones existentes, incluidas acciones/paneles avanzados y plano vinculado | src/editor/index.ts; src/editor/settings-page.ts; pruebas plan-health, editor y plan-import |
| F-025 | Reemplazar el dibujo | Disponible: Ajustes: secciones existentes, incluidas acciones/paneles avanzados y plano vinculado | src/editor/index.ts; src/editor/settings-page.ts; pruebas plan-health, editor y plan-import |
| F-026 | Consultar diagnóstico | Disponible: Ajustes: secciones existentes, incluidas acciones/paneles avanzados y plano vinculado | src/editor/index.ts; src/editor/settings-page.ts; pruebas plan-health, editor y plan-import |
| F-027 | Resolver un problema individual | Disponible: Ajustes: secciones existentes, incluidas acciones/paneles avanzados y plano vinculado | src/editor/index.ts; src/editor/settings-page.ts; pruebas plan-health, editor y plan-import |
| F-028 | Arreglar lo seguro | Disponible: Ajustes: secciones existentes, incluidas acciones/paneles avanzados y plano vinculado | src/editor/index.ts; src/editor/settings-page.ts; pruebas plan-health, editor y plan-import |
| F-043 | Vincular dispositivo y lecturas | Disponible: Agregar/Vincular en ficha de escritorio o página móvil; búsqueda y lecturas conservadas | src/editor/device-picker.ts; pruebas task-screens y device-picker |
| F-057 | Agregar símbolo | Disponible: Agregar/Vincular en ficha de escritorio o página móvil; búsqueda y lecturas conservadas | src/editor/device-picker.ts; pruebas task-screens y device-picker |
| F-058 | Deshacer y rehacer | Disponible: Menú/editor del plano; navegación, permisos y borrador explícito conservados | src/card/editing.ts; src/shell/top-bar.ts; pruebas de código, controles y task-screens |
| F-059 | Guardar y descartar | Disponible: Menú/editor del plano; navegación, permisos y borrador explícito conservados | src/card/editing.ts; src/shell/top-bar.ts; pruebas de código, controles y task-screens |
| F-060 | Revisar movimientos de espacio | Disponible: Lienzo de zonas o pantalla de movimientos, con vuelta y deshacer | src/card/zone-editor.ts; 13 recorridos zone-editor, spaces y capturas |
| F-061 | Restricciones de edición | Disponible: Menú/editor del plano; navegación, permisos y borrador explícito conservados | src/card/editing.ts; src/shell/top-bar.ts; pruebas de código, controles y task-screens |
| F-062 | Buscar dispositivos agrupados | Disponible: Agregar/Vincular en ficha de escritorio o página móvil; búsqueda y lecturas conservadas | src/editor/device-picker.ts; pruebas task-screens y device-picker |
| F-063 | Lectura principal y adicionales | Disponible: Agregar/Vincular en ficha de escritorio o página móvil; búsqueda y lecturas conservadas | src/editor/device-picker.ts; pruebas task-screens y device-picker |
| F-064 | Búsqueda avanzada | Disponible: Agregar/Vincular en ficha de escritorio o página móvil; búsqueda y lecturas conservadas | src/editor/device-picker.ts; pruebas task-screens y device-picker |
| F-065 | Volver, cancelar y detectar cambios | Disponible: Agregar/Vincular en ficha de escritorio o página móvil; búsqueda y lecturas conservadas | src/editor/device-picker.ts; pruebas task-screens y device-picker |
| F-075 | Agregar espacios detectados | Disponible: Ajustes: secciones existentes, incluidas acciones/paneles avanzados y plano vinculado | src/editor/index.ts; src/editor/settings-page.ts; pruebas plan-health, editor y plan-import |
| F-076 | Crear espacio sin forma | Disponible: Ajustes: secciones existentes, incluidas acciones/paneles avanzados y plano vinculado | src/editor/index.ts; src/editor/settings-page.ts; pruebas plan-health, editor y plan-import |
| F-077 | Editar espacio | Disponible: Pantalla de espacio: nombre/icono, forma, navegación, fusión y retirada | src/editor/room-actions.ts; pruebas room-editor, zone-editor y task-screens |
| F-078 | Ajustes de navegación del espacio | Disponible: Pantalla de espacio: nombre/icono, forma, navegación, fusión y retirada | src/editor/room-actions.ts; pruebas room-editor, zone-editor y task-screens |
| F-079 | Acciones lógicas | Disponible: Ajustes: secciones existentes, incluidas acciones/paneles avanzados y plano vinculado | src/editor/index.ts; src/editor/settings-page.ts; pruebas plan-health, editor y plan-import |
| F-080 | Definir paneles nativos | Disponible: Ajustes: secciones existentes, incluidas acciones/paneles avanzados y plano vinculado | src/editor/index.ts; src/editor/settings-page.ts; pruebas plan-health, editor y plan-import |
| F-081 | Referencias pendientes | Disponible: Ajustes: secciones existentes, incluidas acciones/paneles avanzados y plano vinculado | src/editor/index.ts; src/editor/settings-page.ts; pruebas plan-health, editor y plan-import |
| F-082 | Exportar respaldo | Disponible: Ajustes: secciones existentes, incluidas acciones/paneles avanzados y plano vinculado | src/editor/index.ts; src/editor/settings-page.ts; pruebas plan-health, editor y plan-import |
| F-083 | Previsualizar JSON o SVG | Disponible: Ajustes → Importar/exportar o revisión; copia previa y aplicación en un deshacer | src/editor/index.ts; src/editor/plan-review.ts; pruebas plan-import y task-screens |
| F-084 | Detectar pérdidas y exigir copia | Disponible: Ajustes → Importar/exportar o revisión; copia previa y aplicación en un deshacer | src/editor/index.ts; src/editor/plan-review.ts; pruebas plan-import y task-screens |
| F-085 | Revisar cambios de coordenadas | Disponible: Ajustes → Importar/exportar o revisión; copia previa y aplicación en un deshacer | src/editor/index.ts; src/editor/plan-review.ts; pruebas plan-import y task-screens |
| F-086 | Resolver conflictos espaciales | Disponible: Ajustes → Importar/exportar o revisión; copia previa y aplicación en un deshacer | src/editor/index.ts; src/editor/plan-review.ts; pruebas plan-import y task-screens |
| F-087 | Importar sólo dibujo o cancelar | Disponible: Ajustes → Importar/exportar o revisión; copia previa y aplicación en un deshacer | src/editor/index.ts; src/editor/plan-review.ts; pruebas plan-import y task-screens |
| F-088 | Revisar plano ya cargado | Disponible: Ajustes → Importar/exportar o revisión; copia previa y aplicación en un deshacer | src/editor/index.ts; src/editor/plan-review.ts; pruebas plan-import y task-screens |
| F-089 | Historial del dibujo | Disponible: Acceso técnico existente a dibujos anteriores; sin nueva pantalla de versiones | src/editor/index.ts; historial conservado; integración sin cambios |
| F-090 | Dibujar y editar rectángulos | Disponible: Lienzo de zonas o pantalla de movimientos, con vuelta y deshacer | src/card/zone-editor.ts; 13 recorridos zone-editor, spaces y capturas |
| F-091 | Teclado e historia de zonas | Disponible: Lienzo de zonas o pantalla de movimientos, con vuelta y deshacer | src/card/zone-editor.ts; 13 recorridos zone-editor, spaces y capturas |
| F-092 | Revisar reasignación por zonas | Disponible: Lienzo de zonas o pantalla de movimientos, con vuelta y deshacer | src/card/zone-editor.ts; 13 recorridos zone-editor, spaces y capturas |
| F-093 | Primer dibujo sin zonas | Disponible: Lienzo de zonas o pantalla de movimientos, con vuelta y deshacer | src/card/zone-editor.ts; 13 recorridos zone-editor, spaces y capturas |
| F-098 | Listar y abrir mandos | Disponible: Gestor RF, editor, elemento, aprendizaje y Equipos; sin quitar opciones | src/rf/manager.ts; src/rf/learn.ts; pruebas rf/cp6 y task-screens |
| F-099 | Nuevo mando | Disponible: Gestor RF, editor, elemento, aprendizaje y Equipos; sin quitar opciones | src/rf/manager.ts; src/rf/learn.ts; pruebas rf/cp6 y task-screens |
| F-100 | Editar mando y botones | Disponible: Gestor RF, editor, elemento, aprendizaje y Equipos; sin quitar opciones | src/rf/manager.ts; src/rf/learn.ts; pruebas rf/cp6 y task-screens |
| F-104 | Diseñar widgets RF | Disponible: Gestor RF, editor, elemento, aprendizaje y Equipos; sin quitar opciones | src/rf/manager.ts; src/rf/learn.ts; pruebas rf/cp6 y task-screens |
| F-106 | Guardar o cancelar widget | Disponible: Gestor RF, editor, elemento, aprendizaje y Equipos; sin quitar opciones | src/rf/manager.ts; src/rf/learn.ts; pruebas rf/cp6 y task-screens |
| F-114 | Consultar equipos ESPHome | Disponible: Gestor RF, editor, elemento, aprendizaje y Equipos; sin quitar opciones | src/rf/manager.ts; src/rf/learn.ts; pruebas rf/cp6 y task-screens |
| F-115 | Ayuda YAML y copia | Disponible: Gestor RF, editor, elemento, aprendizaje y Equipos; sin quitar opciones | src/rf/manager.ts; src/rf/learn.ts; pruebas rf/cp6 y task-screens |
| F-117 | Crear y recordar hogar | Disponible: Menú de la aplicación; elegir/crear hogar y guardar explícitamente | src/app/index.ts; código conservado y pruebas home |
| F-118 | Referencia de tarjeta y migración | Disponible: Editor avanzado de tarjeta y migración a integración | src/editor/index.ts; código conservado; prueba home |
| F-119 | Almacenamiento e historia retenida | Disponible: Pantalla Almacenamiento; purga con confirmación | src/app/index.ts; prueba task-screens y captura storage |
| F-120 | Conflictos y sincronización | Disponible: Almacenamiento compartido y borrador del editor | src/integration/store.ts; src/editor/storage.ts; pruebas de código y storage |
| F-124 | Historial y límites del backend | Disponible: Historial retenido del backend, sin cambios | custom_components/homemanager/store.py; sin diff de integración |
| F-125 | Consultar archivo vinculado | Disponible: Ajustes: secciones existentes, incluidas acciones/paneles avanzados y plano vinculado | src/editor/index.ts; src/editor/settings-page.ts; pruebas plan-health, editor y plan-import |
| F-127 | Revisar versión con conflictos | Disponible: Ajustes → Importar/exportar o revisión; copia previa y aplicación en un deshacer | src/editor/index.ts; src/editor/plan-review.ts; pruebas plan-import y task-screens |
| F-132 | Elegir vínculo espacio-área | Disponible: Ajustes → Conectar mi casa; propuestas y escrituras explícitas originales | src/editor/connect-home.ts; pruebas connect-home y código conservado |
| F-133 | Crear áreas explícitamente | Disponible: Ajustes → Conectar mi casa; propuestas y escrituras explícitas originales | src/editor/connect-home.ts; pruebas connect-home y código conservado |
| F-134 | Proponer dispositivos por área | Disponible: Ajustes → Conectar mi casa; propuestas y escrituras explícitas originales | src/editor/connect-home.ts; pruebas connect-home y código conservado |
| F-135 | Agregar seleccionados dentro del espacio | Disponible: Ajustes → Conectar mi casa; propuestas y escrituras explícitas originales | src/editor/connect-home.ts; pruebas connect-home y código conservado |
| F-136 | Resolver falta de áreas, duplicados y fallos parciales | Disponible: Ajustes → Conectar mi casa; propuestas y escrituras explícitas originales | src/editor/connect-home.ts; pruebas connect-home y código conservado |

#### Corrección del primer resultado de GitHub — mismo lote 0

El primer intento de Foundation CI se canceló al superar diez minutos después de encontrar pruebas que todavía esperaban diálogos, secciones desplegadas y confirmación del navegador. Las dos versiones de Home Assistant pasaron 244 pruebas cada una y la auditoría informó cero vulnerabilidades. Se conservaron las aserciones de permisos, datos, descarte y persistencia, adaptando la interacción a las páginas y secciones actuales.

Se corrigieron además tres pérdidas de navegación: búsqueda normal y avanzada ahora conservan textos separados; Escape vuelve aunque una actualización haya quitado el foco; el panel nativo conserva el recorrido circular de Tab/Mayús+Tab, incluyendo la nueva vuelta. Un cuadro de confirmación abierto conserva Escape para cancelar, sin cerrar la página de atrás.

- Repetición local: sólo los 23 casos señalados por CI, en escritorio; 21 pasaron tras la primera corrección y los otros dos pasaron al ajustar la comprobación del borrador RF y restaurar el recorrido de foco. Las dos pruebas de Escape sin foco/confirmación concurrente también pasan. Total del lote: 65 casos únicos de escritorio aprobados, sin suite completa local.
- Aceptación: siguen cumplidos los seis puntos anteriores; la conservación de la búsqueda avanzada y el foco tienen ahora regresión específica. Ninguna función se quita y no cambia contrato/integración.
- Capturas: las 88 imágenes siguen representando el diseño final; esta corrección cambia navegación y comprobaciones, sin alterar su representación inicial.
- Historial: cierre E02 y corrección E02 posterior al primer resultado de CI; ambos en la misma rama y PR, sin reescribir la historia publicada. Resultado vigente de CI en el PR #52.
