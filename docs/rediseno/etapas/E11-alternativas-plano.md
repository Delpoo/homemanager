# E11 · Alternativas del plano

**Objetivo:** una misma casa con varias formas de verse. Cada alternativa tiene su imagen clara y oscura, con el fondo que elija el usuario.
**Depende de:** E02.
**Maqueta:** [módulos, dibujo 6](../maqueta-modulos.html). Decisión: [D27](../../decisions.md).

## Lo que pidió el propietario

Las imágenes **las prepara el usuario**: la app no las genera. Debe poder cargar modo claro y oscuro, y agregar otras opciones, como un juego simplificado. Con ajuste de fondo, vista previa en miniatura y editable también en el editor. El fondo del dibujo debe ser transparente, y el color lo elige el usuario.

## Alcance

- **Alternativas:** nombre, imagen clara, imagen oscura. Crear, renombrar, reemplazar, duplicar, quitar y ordenar.
- **Fondo:** color por modo, y transparente si la imagen lo es.
- **Elegir:** botón en el plano y en el editor. Cambia al instante, sin mover los símbolos. Se puede recordar por pantalla.
- **Modo:** sigue el tema. Si falta la imagen de ese modo, usa la otra y lo indica.
- **Ajustes:** sección con miniaturas y vista previa, como en la maqueta.
- **Modo pared** usa la imagen oscura.

## Tres problemas que resolver antes

1. **Alineación.** Los símbolos se ubican según el `viewBox` (`position` de 0 a 1). Una imagen con otro encuadre los correría. Avisar y ofrecer alinearla antes de guardar. Las zonas pertenecen a la app (D22), así que una alternativa no necesita zonas.
2. **Formatos.** Hoy el contrato sólo admite SVG (`architecture: {format, content}`). Sumar PNG y JPG. El PDF es la **decisión pendiente n.º 2**. Recomendación: convertirlo antes de subirlo.
3. **Tamaño y seguridad.** El plano tiene un máximo de 1 MiB (`MAX_PLAN_BYTES`), la configuración 3 MiB y el almacén 64 MiB, con un historial de 10 planos. Varias imágenes no entran dentro de la configuración. **Proponer dónde guardarlas,** cómo se copian en las copias de seguridad, quién las puede leer y cómo se valida. Todo SVG sigue pasando por el saneamiento de JavaScript y de `custom_components/homemanager/svg.py`.

## Datos

- `architecture` sigue siendo válido: un plano actual es una alternativa de una sola imagen.
- Campo nuevo opcional. Exportar e importar deben incluir las imágenes, o avisar que no.

## Fuera de alcance

Generar versiones oscuras en forma automática. **Plano vinculado** (0.10, etapa 4): coordinar antes de empezar, porque toca el mismo dato.

## No se puede perder

Reemplazar plano, revisión de cambios y fusionar, historial, zonas y diagnóstico, importar y exportar, vista previa, y un plano actual sin cambios.

## Dónde mirar

- `src/card/plan-view.ts`, `src/card/geometry.ts`, `src/editor/index.ts`, `src/editor/settings-page.ts`, `src/editor/plan-review.ts`, `src/ui/theme-choice.ts`.
- `custom_components/homemanager/const.py`, `store.py`, `svg.py`, `validation.py`.
- `docs/contract.md`, sección de `architecture`.

## Pasos

1. Reclamar la etapa.
2. **Parada de validación:** propuesta de almacenamiento, formatos, alineación y migración, con los números medidos.
3. Modelo, validación y almacenamiento, con pruebas de límites y saneamiento.
4. Pantalla de Ajustes, selector y tema.
5. Pruebas, capturas y reporte. El propietario prueba con sus imágenes. **No subir sus imágenes al repositorio.**

## Aceptación

- [ ] Un plano actual funciona igual, como una alternativa.
- [ ] Se puede crear una alternativa con imagen clara y oscura, en SVG y en PNG o JPG.
- [ ] Cambiar de alternativa o de tema no mueve los símbolos.
- [ ] Una imagen desalineada se detecta antes de guardar.
- [ ] Un SVG con contenido activo se rechaza o se limpia.
- [ ] Superar un límite da un mensaje claro y no pierde datos.
- [ ] El fondo se elige por modo, y lo transparente funciona.
- [ ] Copia de seguridad y restauración conservan las imágenes (comprobado).

## Registro
