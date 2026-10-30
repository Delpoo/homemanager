# E02 — pantallas propuestas para validar

**Estado: propuesta; no es una conversión del producto.** Base revisada: E01 `68366ab`, main `764a9e0` y guías `fa97550`. PR [#52](https://github.com/Delpoo/homemanager/pull/52), apilado sobre [#51](https://github.com/Delpoo/homemanager/pull/51).

## Qué propongo

- **Vincular:** dos pasos dentro de la ficha de 380 px en escritorio; pantalla completa dentro del panel en móvil. Elegir dispositivo, después principal y hasta tres lecturas adicionales. Se mantiene Buscar cualquier entidad. Volver conserva búsqueda, selección y campos; Vincular aplica al borrador sin guardar el plano.
- **Ajustes:** página dentro del panel, con barra superior, Volver y Guardar. Navegación lateral en escritorio y horizontal desplazable en móvil. Una sección por vez; se conserva el contenido actual.
- **Agregar:** reemplaza el contenido de la ficha. En móvil, pantalla de tarea. No queda una ficha flotante visible detrás de un selector.
- **Espacios, revisión e importación:** páginas de trabajo. El editor de zonas usa el plano como lienzo; su revisión de movimientos es otra pantalla, con vuelta al dibujo y sus cambios intactos.
- **RF:** lista, edición, aprendizaje y elemento del diseñador son pantallas hermanas con vuelta. Se conserva el diseñador actual; el nuevo diseñador y aprendizaje guiado corresponden a E09/E10.
- **Controles de uso, actividad, alertas, ayuda y almacenamiento:** pantallas o paneles que sustituyen el contenido anterior; no ventanas apiladas. No se rediseñan sus controles ni su contenido en E02.
- **Confirmaciones:** una sola ventana pequeña, exclusivamente para una pregunta de sí o no. Al cancelar, vuelve el foco a la acción que la abrió.

## Maqueta revisable

[**Abrir o descargar la propuesta HTML**](E02-propuesta.html). Es autónoma, usa los tokens y componentes de la sección 6, incluye 28 vistas, tema claro/oscuro y adaptación al ancho del teléfono. El selector superior recorre las vistas. Los botones permiten volver y recorrer los dos pasos; los campos quedan conservados al volver. Son datos ficticios y no hay conexión a HA, guardado ni transmisión.

Esta versión publicada se revisó por código; **no se afirma que haya pasado una ejecución de navegador**. Un prototipo local anterior de 23 vistas pasó 92 comprobaciones de distribución (dos tamaños × dos temas) y generó ocho capturas; se inspeccionaron visualmente las cuatro de Vincular. Esas pruebas **no certifican esta reconstrucción publicada**. La última ampliación local y sus capturas no se pudieron recuperar tras la interrupción del entorno. Quedan pendientes incorporar las capturas y ejecutar nuevamente esta versión.

La maqueta propone la estructura y navegación. Sus filas representativas no sustituyen el inventario ni autorizan quitar opciones. Los selectores de iconos, aprendizaje, formas y contenidos de las otras etapas mantienen su alcance actual.

| Vistas | Qué permite validar |
|---|---|
| Vincular dispositivo, Qué mostrar, búsqueda avanzada | Dos pasos en 380 px; pantalla completa móvil; volver y conservar campos |
| Ficha y Agregar | Sustitución de contenido y vuelta al plano |
| Ajustes, Conectar mi casa, Diagnóstico, Acciones, Paneles, Pendientes, Importar/exportar | Navegación por secciones, Guardar arriba y Volver |
| Editar espacio, Revisar plano, Zonas, Movimientos | Tareas separadas y conservación del trabajo al volver |
| Lista RF, editar RF, aprender, editar elemento, equipos | Pantallas hermanas; sin reemplazar el diseñador ni el aprendizaje en E02 |
| Control de uso, actividad, alertas, almacenamiento, ayuda, elegir dispositivo | Tareas del helper general que también dejan de ser ventanas |
| Confirmación de muestra | Único caso de ventana; Cancelar conserva la pantalla |

## Cada apertura showModal

Son **12 puntos de apertura**, no 12 tareas: hay un helper con varios usos y una reapertura de la misma revisión.

| Punto en la base E01 | Tarea real | Clase según la regla | Destino propuesto / conservación |
|---|---|---|---|
| `src/app/index.ts:225` | Almacenamiento de historiales retenidos | Trabajo: lista y acciones | Pantalla Almacenamiento; conserva consultar y eliminar historial con confirmación. |
| `src/card/editing.ts:425` | Helper general de ventanas | Mixto; clasificar por invocación | Desglose en la tabla siguiente. No convertir todos sus usos en confirmaciones. |
| `src/card/zone-editor.ts:566` | Elegir dispositivos que cambian de espacio | Trabajo: lista con casillas | Pantalla Movimientos; volver conserva dibujo y elecciones. |
| `src/card/zone-editor.ts:592` | Ayuda del primer espacio | Explicación y entrada a una tarea | Panel de ayuda/estado vacío con Dibujar el primero y Más tarde. No una pregunta destructiva. |
| `src/editor/device-picker.ts:255` | Dispositivo y lecturas, dos pasos | Trabajo | Ficha en escritorio; pantalla completa móvil. Conserva todas las opciones del selector. |
| `src/editor/index.ts:800` | Ajustes del plano | Trabajo: varias secciones | Página con barra, Guardar y Volver. Mantener borrador compartido y permisos. |
| `src/editor/index.ts:806` | Reabrir la revisión al repintar Ajustes | Continuación del trabajo | Conservar la ruta y su estado; no crear una segunda tarea o ventana. |
| `src/editor/plan-review.ts:245` | Revisar/importar plano y resolver espacios | Trabajo: elecciones y revisión | Pantalla Revisión. Mantener importar sólo dibujo, formas, fusiones y movimientos; aplicar en un paso de deshacer. |
| `src/editor/room-actions.ts:104` | Nombre/icono, encuadre, flechas, forma, fusionar/quitar espacio | Trabajo: formulario | Pantalla Editar espacio. Conservar decisiones de destino de dispositivos; una confirmación final si corresponde. |
| `src/panels/native-panel.ts:266` | Usar controles nativos/de símbolo/RF/script | Trabajo: controles y campos | Pantalla o panel de control con Volver. E02 cambia el contenedor, no el diseño ni semántica de E09. |
| `src/rf/manager.ts:168` | Editar elemento del diseñador RF | Trabajo: varios campos | Pantalla de elemento, con Guardar/Cancelar y retorno al mismo diseño. |
| `src/ui/confirm-dialog.ts:59` | Helper de confirmación | Pregunta de sí o no | Conservar ventana pequeña; garantizar una sola abierta y foco de vuelta. |

### Usos del helper general

| Invocación | Clasificación y propuesta |
|---|---|
| Guardar tras cambiar dispositivos de espacio (`editing.ts`) | Pregunta final con información de cambios: conservar confirmación. Si aparece una elección editable, esa parte va a pantalla de revisión antes de confirmar. |
| Ayuda y guardado compartido (`editing.ts`) | Información consultable: pantalla/panel Ayuda; conserva versión, estados de confianza y explicación del guardado. |
| Detalles de un dispositivo sin controles (`commands.ts`) | Pantalla del dispositivo/estado vacío; conserva referencias pendientes y explicación del vínculo. |
| Varios dispositivos en el mismo punto (`plan-view.ts`) | Lista de elección: pantalla/panel Elegir dispositivo; conserva selección y retorno al plano. |
| Historial de actividad (`shell/activity-view.ts`) | Lista consultable: pantalla Actividad; no confundir con historial persistente de planos. |
| Lista de alertas (`shell/activity-view.ts`) | Lista con navegación: pantalla Alertas; conserva enfocar el símbolo, sus capas y espacio. Una sola alerta puede seguir enfocándose directamente. |

### Confirmaciones conservadas

- Descartar borrador del plano; descartar zonas editadas.
- Restablecer sugerencias; quitar símbolo; quitar espacio.
- RF: volver al diseño automático, eliminar mando, quitar elemento del diseño, olvidar botón aprendido y quitar parte/entidad RF.
- `window.confirm` de `src/app/index.ts:240`: eliminar definitivamente historial retenido. Convertir a la confirmación común de sí o no sobre la pantalla Almacenamiento, sin abrir otra ventana de trabajo debajo.

`panelDialog` y `uiPane` crean contenedores; no abren por sí mismos. Se convertirán sus usos de trabajo, manteniendo el componente de confirmación. `src/rf/learn.ts` no tiene showModal: ya se monta en el espacio de trabajo RF; revisar su navegación y conservación de estado, sin inventar una ventana que no existe. Los popovers simples de ayuda/iconos no son pantallas de trabajo de E02; el selector nuevo sigue en E08.

## Volver, guardar y deshacer

1. Entrar a una subtarea conserva la pantalla anterior, su posición de desplazamiento y sus campos.
2. Volver dentro de la tarea mantiene lo escrito. Cancelar un formulario con cambios pregunta si se quiere descartarlo; cancelar la pregunta conserva la tarea y su foco.
3. Aplicar modifica el mismo borrador. Guardar persiste con la validación y control de conflictos actuales. Salir de edición con cambios pregunta antes.
4. Una importación con revisión es un único paso de deshacer. Volver a revisar no importa otra vez ni agrega pasos parciales.
5. Al entrar, foco al título o primer campo apropiado; al volver, foco al disparador. Nombre accesible, Tab en orden y Escape coherente: primero cancelar confirmación; después volver conservando la tarea.
6. No se implementa una nueva pantalla de **Versiones guardadas**. No tocar `custom_components/homemanager/store.py`. Mantener los accesos existentes de recuperación en avanzado mientras se valida su ubicación, sin borrar una función del inventario. La maqueta sólo muestra un acceso representativo; no rediseña el historial.

## Validación pedida

Recomiendo aprobar la clasificación y **Vincular en ficha de escritorio / pantalla completa móvil**. Aprobar esta organización no autoriza a quitar campos, cambiar el diseñador RF, cambiar los avisos ni resolver las decisiones de E00 por cuenta propia.

Después de validar: componente común de pantalla; conversiones una por una con commits separados; pruebas completas del inventario, capturas definitivas y auditoría. Las casillas de aceptación de E02 quedan sin marcar: el producto todavía conserva sus ventanas.
