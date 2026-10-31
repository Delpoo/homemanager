# Conservación de funciones — E02

Las 68 filas siguientes proceden del inventario E00 y conservan sus identificadores. La implementación local cotejó sus destinos; el PR aporta código, pruebas específicas y 60 capturas. **La auditoría funcional completa por fila sigue pendiente.** Las pruebas aprobadas se detallan en [el reporte](E02-2026-10-31-continuacion.md); no se atribuye un aprobado individual a todas estas funciones.

La fuente indica el área de revisión del código; una captura sólo acredita apariencia y los casos automatizados cubren un subconjunto. Revisar además permisos, guardado, conflictos, foco, descartes y escritura explícita antes de cerrar E02. No se cambió el contrato ni el backend.

| ID | Función conservada | Fuente de revisión | Validación pendiente |
| --- | --- | --- | --- |
| F-003 | Abrir historial | `src/card/index.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-006 | Editar plano | `src/card/index.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-007 | Volver al plano | `src/card/index.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-008 | Abrir Controles RF | `src/card/index.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-009 | Abrir ajustes | `src/card/index.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-010 | Elegir hogar | `src/app/index.ts` | Auditoría del recorrido completo |
| F-011 | Nuevo hogar | `src/app/index.ts` | Auditoría del recorrido completo |
| F-012 | Almacenamiento | `src/app/index.ts` | Auditoría del recorrido completo |
| F-015 | Ayuda | `src/card/index.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-016 | Navegar con teclado | `src/card/index.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-017 | Menú de Home Assistant | `src/card/index.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-018 | Consultar el detalle de actividad | `src/card/index.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-019 | Elegir un aviso | `src/card/index.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-022 | Cambiar sección de ajustes | `src/editor/settings-page.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-023 | Consultar espacios | `src/editor/settings-page.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-024 | Ordenar y abrir un espacio | `src/editor/settings-page.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-025 | Reemplazar el dibujo | `src/editor/settings-page.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-026 | Consultar diagnóstico | `src/editor/settings-page.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-027 | Resolver un problema individual | `src/editor/settings-page.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-028 | Arreglar lo seguro | `src/editor/settings-page.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-043 | Vincular dispositivo y lecturas | `src/editor/device-picker.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-057 | Agregar símbolo | `src/editor/device-picker.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-058 | Deshacer y rehacer | `src/card/index.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-059 | Guardar y descartar | `src/card/index.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-060 | Revisar movimientos de espacio | `src/card/zone-editor.ts` | Auditoría del recorrido completo |
| F-061 | Restricciones de edición | `src/card/index.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-062 | Buscar dispositivos agrupados | `src/editor/device-picker.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-063 | Lectura principal y adicionales | `src/editor/device-picker.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-064 | Búsqueda avanzada | `src/editor/device-picker.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-065 | Volver, cancelar y detectar cambios | `src/editor/device-picker.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-075 | Agregar espacios detectados | `src/editor/settings-page.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-076 | Crear espacio sin forma | `src/editor/settings-page.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-077 | Editar espacio | `src/editor/room-actions.ts` | Auditoría del recorrido completo |
| F-078 | Ajustes de navegación del espacio | `src/editor/room-actions.ts` | Auditoría del recorrido completo |
| F-079 | Acciones lógicas | `src/editor/settings-page.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-080 | Definir paneles nativos | `src/editor/settings-page.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-081 | Referencias pendientes | `src/editor/settings-page.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-082 | Exportar respaldo | `src/editor/settings-page.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-083 | Previsualizar JSON o SVG | `src/editor/plan-review.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-084 | Detectar pérdidas y exigir copia | `src/editor/plan-review.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-085 | Revisar cambios de coordenadas | `src/editor/plan-review.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-086 | Resolver conflictos espaciales | `src/editor/plan-review.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-087 | Importar sólo dibujo o cancelar | `src/editor/plan-review.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-088 | Revisar plano ya cargado | `src/editor/plan-review.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-089 | Historial del dibujo | `src/editor/settings-page.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-090 | Dibujar y editar rectángulos | `src/card/zone-editor.ts` | Auditoría del recorrido completo |
| F-091 | Teclado e historia de zonas | `src/card/zone-editor.ts` | Auditoría del recorrido completo |
| F-092 | Revisar reasignación por zonas | `src/card/zone-editor.ts` | Auditoría del recorrido completo |
| F-093 | Primer dibujo sin zonas | `src/card/zone-editor.ts` | Auditoría del recorrido completo |
| F-098 | Listar y abrir mandos | `src/rf/manager.ts` | Auditoría del recorrido completo |
| F-099 | Nuevo mando | `src/rf/manager.ts` | Auditoría del recorrido completo |
| F-100 | Editar mando y botones | `src/rf/manager.ts` | Auditoría del recorrido completo |
| F-104 | Diseñar widgets RF | `src/rf/manager.ts; src/ui/rf-components.ts` | Auditoría del recorrido completo |
| F-106 | Guardar o cancelar widget | `src/rf/manager.ts; src/ui/rf-components.ts` | Auditoría del recorrido completo |
| F-114 | Consultar equipos ESPHome | `src/rf/manager.ts` | Auditoría del recorrido completo |
| F-115 | Ayuda YAML y copia | `src/rf/manager.ts` | Auditoría del recorrido completo |
| F-117 | Crear y recordar hogar | `src/app/index.ts` | Auditoría del recorrido completo |
| F-118 | Referencia de tarjeta y migración | `src/editor/index.ts` | Auditoría del recorrido completo |
| F-119 | Almacenamiento e historia retenida | `src/app/index.ts` | Auditoría del recorrido completo |
| F-120 | Conflictos y sincronización | `src/card/index.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-124 | Historial y límites del backend | `custom_components/homemanager/store.py (sin cambios)` | Auditoría del recorrido completo |
| F-125 | Consultar archivo vinculado | `src/editor/settings-page.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-127 | Revisar versión con conflictos | `src/editor/plan-review.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-132 | Elegir vínculo espacio-área | `src/editor/settings-page.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-133 | Crear áreas explícitamente | `src/editor/settings-page.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-134 | Proponer dispositivos por área | `src/editor/settings-page.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-135 | Agregar seleccionados dentro del espacio | `src/editor/settings-page.ts; src/editor/index.ts` | Auditoría del recorrido completo |
| F-136 | Resolver falta de áreas, duplicados y fallos parciales | `src/editor/settings-page.ts; src/editor/index.ts` | Auditoría del recorrido completo |
