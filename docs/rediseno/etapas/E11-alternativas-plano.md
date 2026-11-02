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

Generar versiones oscuras en forma automática.

## Plano vinculado

La 0.10 ya permite que el dibujo viva en un archivo de Home Assistant, `homemanager/<hogar>.svg`, y se actualice solo (`custom_components/homemanager/plan_link.py`, `src/card/linked-plan.ts`, [integration.md](../../integration.md#plano-vinculado)). Definir en la propuesta cómo convive con las alternativas. Recomendación: que cada imagen de una alternativa pueda estar subida o vinculada a su archivo. Esa carpeta también puede resolver dónde guardar las imágenes, porque ya entra en las copias de seguridad.

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

### 2026-11-02 - Codex - lote 4, E11
- **Propuesta elegida:** el SVG original sigue siendo geometría, zonas e historial. Hasta 12 alternativas con nombre e imágenes clara/oscura; SVG, PNG y JPG, máximo 1 MiB por imagen y 40 millones de píxeles. PDF se convierte antes. Referencias con huella y encuadre en configuración; bytes base64 inmutables en .storage/homemanager.images.<ámbito>, máximo 48 imágenes por colección y cuota global de 64 MiB (incluye colecciones e historiales). Lecturas con los permisos privados existentes; escrituras sólo administradores. No se sirven URLs públicas. La copia con imágenes incluye configuración y bytes; el exportador anterior avisa que sólo exporta referencias.
- **Alineación y seguridad:** se compara el encuadre antes de guardar, con vista previa y símbolos; Alinear al plano requiere acción explícita y ajusta al encuadre base. Si luego cambia el plano original, una referencia desalineada conserva los datos y muestra el original con aviso. SVG saneado en navegador y rechazado si es activo en servidor; PNG con tamaño/chunks/CRC y JPEG con cabecera y dimensiones acotadas. Imágenes siempre en elemento img, sin HTML activo.
- **Compatibilidad:** architecture no cambia; planos sin alternativas siguen idénticos, incluido el vínculo de archivo de 0.10. Ese vínculo continúa actualizando el original con su revisión e historial; las imágenes de alternativas se cargan por separado, no siguen archivos externos automáticamente. Quitar una alternativa conserva sus bytes para evitar pérdidas en copias y otros documentos; actualmente no hay purga de imágenes.
- **Aceptación:** 1 comprobada con planos actuales y prueba de ausencia del campo; 2 SVG recorrido en navegador, PNG/JPG generados con canvas y cubiertos en pruebas del servidor (CI pendiente); 3 cambio de alternativa/tema conserva posiciones y viewBox, recorrido aprobado; 4 encuadre distinto bloquea guardado hasta alineación explícita, aprobado; 5 perfiles SVG existentes y prueba negativa de servidor; 6 límites y fallo de cuota preservan datos, prueba preparada para CI; 7 fondos por modo y transparencia de imagen sin generación automática; 8 prueba de copia/restauración del almacén HA preparada para CI. No se afirma una restauración desde el asistente de copias de HA ni una imagen real del propietario.
- **Inventario, 37 filas conservadas:** F-013 tema; F-023/F-024 espacios; F-025 reemplazo original; F-026-F-028 diagnóstico; F-032 cámara; F-075-F-078 editor/alta/encuadre; F-082 copia anterior más copia con imágenes; F-083-F-089 importación, conflictos e historial anteriores; F-090-F-093 zonas; F-120 revisión concurrente; F-122 referencias opcionales; F-124 cuotas ampliadas a bytes de imágenes; F-125-F-130 vínculo original intacto; F-132/F-133/F-135/F-137 áreas sin cambios. Destinos originales y pruebas existentes conservados, no se atribuye un recorrido nuevo por cada función.
- **Comprobaciones:** dos casos nuevos de escritorio aprobados (editor/alineación/orden y tema/geometría). Validación estructural JS/esquema, Python real y almacenamiento en CI del lote; check combinado al cierre de la etapa. Capturas en una sola pasada al cerrar el lote.
- **Falta:** CI, revisión visual final, auditoría independiente y prueba con imágenes del propietario. Rama chatgpt/rediseno-lote-4, dependiente de #55/#56; sin main, versión ni vivienda real.
