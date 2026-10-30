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

- [ ] Un recorrido por todos los flujos del inventario nunca muestra dos ventanas a la vez.
- [ ] Sólo las preguntas de sí o no usan ventana.
- [ ] Ajustes es una página, con el historial del navegador o un botón para volver.
- [ ] En 390×844 todo se puede usar sin desplazamiento horizontal.
- [ ] Salir con cambios sin guardar pregunta primero.
- [ ] Todas las funciones siguen disponibles.

## Registro

### 2026-10-31 — ChatGPT — a medias
- **Hecho:** etapa reclamada en commit 057982b054015be4060995362414724d4be58b29; clasificación de los 12 showModal de E01, usos del helper general y window.confirm de Almacenamiento. Propuesta revisable de pantallas en ../propuestas/E02-pantallas.md y E02-propuesta.html. No se convirtió el producto.
- **Falta:** validación del propietario de la lista y Vincular; incorporar capturas y ejecutar el HTML publicado; después componente común, conversiones separadas y pruebas completas. Las seis casillas de aceptación permanecen sin marcar.
- **Dónde quedó:** chatgpt/rediseno-e02-pantallas, PR #52, commit de entrega «docs(rediseno): presentar E02 y registrar parada de validación». Base E01 68366ab7e21d7eb1df6494afe9cb5a96e62bff6e, árbol de reclamación 2457dad0592520b9a6be66bfd0738e24776a67c3. Reporte en ../entregas/E02-2026-10-31.md; el SHA final está en la cabecera del PR.
- **Para quien siga:** respetar la parada del paso 2. Vincular recomendado en ficha de 380 px escritorio / pantalla completa móvil; guardar y volver conservan el borrador. No reinterpretar la maqueta como permiso para quitar campos, diseñador, avisos o historial. Prototipo local inicial: 23 vistas × dos temas × dos tamaños = 92 distribuciones comprobadas, ocho capturas y cuatro de Vincular inspeccionadas; la ampliación posterior no se confirmó. El HTML publicado es una reconstrucción revisada por código, no la versión que pasó esas pruebas. El entorno de archivos pasó a rechazar rutas Windows por «invalid sandbox permission path URI: file:///workspace»; terminal y vía Node no permitieron recuperar los archivos. Cierre hecho con GitHub, sin pedir al propietario resolver herramientas. El árbol remoto es la fuente para retomar; preservar los archivos locales de propuestas/capturas si reaparecen y no sobrescribir el remoto con la copia local desactualizada.

- **Base al cerrar:** main avanzó a dc7a910e3a901a38a5f23554a30dfd752d5f5940 (#53, limpieza de 0.10) después de crear las ramas. Se revisó su diferencia contra 764a9e0: README, instalación, hoja de ruta, traducciones sin uso y componente/CSS sin uso. E01 no usa panelEmpty y sus cinco traducciones nuevas no están entre las quitadas; no se detectó un cruce funcional por lectura. Esa limpieza no se incorporó a estas ramas ni se ejecutó la combinación: al integrar las bases, conservarla y repetir checks. Entrega de propuesta: 38751fb519ccecc4973c3a36f0237c6afb63d45a.
