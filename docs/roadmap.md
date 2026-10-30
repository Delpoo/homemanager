# HomeManager · plan hacia 1.0

Implementa [vision.md](vision.md) en etapas que se pueden probar. Hay dos pistas independientes: **A**, la interfaz, y **B**, ESPHome. Pueden avanzar en paralelo, en ramas y PR distintos. Cada etapa termina en una beta publicada por HACS **sólo con la aprobación del propietario**.

## Reglas para quien implemente

**Ramas y publicación**
- No tocar `main`. Una rama y un PR borrador por etapa, o por pieza grande dentro de una etapa.
- No fusionar ni publicar sin aprobación.

**Separación de datos**
- Ningún dato de la vivienda en este repositorio: ni plano, ni nombres de espacios, ni entidades reales.
- Los ejemplos y las pruebas usan datos inventados.

**Validación**
- Todo campo nuevo del contrato es opcional y se valida igual en `src/ha/validation.mjs`, `custom_components/homemanager/validation.py` y `schemas/catalog.schema.json`.
- Un plano de 0.6 tiene que seguir cargando y funcionando igual.

**Estado y comandos**
- Un comando enviado nunca se muestra como estado confirmado sin una fuente independiente (D14, D18).
- Sin Browser Mod (D02).

**Arquitectura**
- Respetar [vision.md §10](vision.md#10-arquitectura-del-código): la lógica nueva va a `src/model/` con pruebas unitarias.
- Los marcadores y paneles sólo dibujan lo que esas funciones devuelven.

**Diseño**
- [vision-mockup.html](vision-mockup.html) es el objetivo visual de **todas** las pantallas. Si una pantalla no está en la maqueta, se arma sólo con los componentes de su sección 6, y se avisa en el PR para agregarla.
- Ningún texto visible contiene un `entity_id`, un nombre con `_` ni una palabra técnica, salvo en las secciones avanzadas.

**Antes de pedir revisión**
- Pasar `npm run check`, `npm run format:check`, las pruebas de navegador (escritorio y móvil), `pytest` en las dos versiones de HA de la CI y el E2E local.
- Adjuntar capturas a 1440×900 y 390×844 de **cada** pantalla que cambió, al lado de su sección de la maqueta, y explicar cada diferencia.
- Una etapa no está terminada mientras quede una pantalla de su lista con el aspecto anterior.

## Etapa 0.7 · Base visual, arquetipos y respuesta (pista A) · publicada como 0.7.0-beta.1

Objetivo: el día a día se ve profesional, cada símbolo dice qué es, y todo toque tiene respuesta.

1. **Tokens y tema** (`src/ui/theme.ts`):
   - la paleta de [vision.md §9](vision.md#9-lenguaje-visual), clara y oscura;
   - reemplazar los colores fijos que hay en los estilos;
   - el azul de HA deja de aparecer dentro de HomeManager.
2. **Logo** en SVG (`src/ui/logo.ts`). Va en la barra superior y como icono del panel lateral si HA lo permite.
3. **Barra superior** (`src/shell/top-bar.ts`):
   - logo, nombre del hogar, barra de actividad, píldora de alertas, reloj y menú ⋮;
   - el selector de hogar, *Almacenamiento*, *Nuevo hogar* y las pestañas *Plano* / *Controles RF* pasan al menú.
4. **Riel de espacios** (`src/shell/room-rail.ts`):
   - iconos con nombre accesible, una insignia de alertas y un punto de actividad;
   - vertical desde 1100 px, abajo en el móvil;
   - `rooms[].icon` en el contrato, con sugerencia por nombre en *Ajustes del plano*.
5. **Elegir un espacio:**
   - máscara oscura fuera de la zona;
   - contorno real, clonando las formas de `room-*` en la capa de resaltado;
   - atenuar los símbolos de otros espacios.
6. **Arquetipos** (`src/model/archetype.ts`, `src/model/symbol-spec.ts`):
   - la tabla y la gramática de [vision.md §4](vision.md#4-arquetipos-de-símbolo);
   - `markers.ts` dibuja sólo un `SymbolSpec`;
   - `display.archetype` y `display.show` en el contrato.
7. **Alertas v1** (`src/model/alerts.ts`):
   - las reglas activas por defecto de [vision.md §5](vision.md#alertas);
   - insignia en el símbolo y en el espacio, y la píldora.
   - Sin configuración todavía: eso llega en 0.9.
8. **Barra de actividad** (`src/model/activity.ts` y la barra):
   - enviado → en el aire → confirmado / error, en la misma línea;
   - historial de los últimos 50.
9. **Capas** con icono y nombre, abajo a la izquierda; *Infraestructura* apagada por defecto.
10. **Importación del plano con resolución de conflictos y espacios editables**:
    - `src/model/plan-import.ts`: `planImportReport(configuration, zonesAt, newZones)` y `mergeRoom(configuration, from, to)` son funciones puras. Geometría calcula todas las zonas que contienen cada dispositivo; el modelo no usa DOM.
    - Antes de aplicar un SVG con conflictos, **Revisar cambios** muestra movimientos individuales marcados, espacios sin zona, zonas nuevas marcadas, ambiguos y dispositivos fuera de zona. Los espacios huérfanos sugieren fusionar sólo si todos sus dispositivos caen en exactamente la misma zona. Un espacio vacío elige Quitar; con dispositivos nunca se ofrece quitar sin resolverlos. Las opciones predeterminadas se ven elegidas.
    - Botones **Aplicar**, **Importar sólo el plano**, **Cancelar**. Sin conflictos se importa directamente. Todo entra al borrador como un solo paso de deshacer; sólo Guardar persiste. Nunca mover o cambiar posiciones sin mostrarlas antes.
    - **Revisar espacios con el plano** en Ajustes usa el mismo informe y paso sobre el plano ya guardado, sin reimportar.
    - Fijo bloquea sólo la posición: el espacio se puede cambiar desde la ficha sin Corregir ubicación fija; `roomId` continúa siendo explícito y el contrato no cambia.
    - En edición, tocar un espacio del riel permite Renombrar, Icono, Fusionar en… y Quitar. Para quitarlo con dispositivos se elige fusionarlos en otro espacio o dejarlos sin espacio. Ajustes conserva Espacios para ordenar.

    Este punto tiene una fase y un commit propios. El propietario revisa primero `planImportReport`, `mergeRoom` y sus pruebas, antes de construir la interfaz encima.

**Aceptación:**
- [ ] Un sensor de humedad mojado se ve rojo con "1", en el plano, en su espacio y en la barra superior. Tocar la píldora encuadra el sensor.
- [ ] Un sensor de temperatura muestra *23,4°*, no un termómetro.
- [ ] Una luz encendida tiene el anillo cálido y ningún punto de estado. Una entidad no disponible tiene la marca gris tachada.
- [ ] Tocar un actuador escribe *✓ Enviado · …* en la barra. Un error del servicio escribe *✕ …* en rojo.
- [ ] En 390 px, la barra superior y el riel de espacios ocupan como mucho 120 px de alto en total. No queda ningún botón de administración a la vista.
- [ ] Elegir un espacio en forma de L dibuja una L y oscurece el resto.
- [ ] Un plano de 0.6 carga sin cambios en sus datos.
- [ ] Al importar un plano donde desaparecen 3 zonas que tenían espacios declarados, el paso las lista con su sugerencia. Aplicar deja 0 espacios sin zona y reasigna los dispositivos. Un deshacer devuelve todo exactamente como estaba.
- [ ] Un dispositivo ambiguo o fuera de zona nunca cambia de espacio solo.
- [ ] Un plano sin conflictos se importa sin paso extra.
- [ ] Revisar espacios con el plano funciona sobre el plano guardado.
- [ ] El espacio de un dispositivo fijo se cambia desde la ficha. Su posición no se puede cambiar.
- [ ] Renombrar, fusionar y quitar espacios desde el riel funciona en 1440 px y en 390 px.
- [ ] Un plano de 0.6 carga igual con el nuevo flujo de importación.

**Pruebas nuevas:**
- unitarias de `archetype`, `symbolSpec`, `alertsOf` y `activity`;
- de navegador del shell (escritorio y móvil);
- de navegador de la máscara del espacio;
- validación de los campos nuevos en los tres validadores.
- unitarias de `planImportReport` y `mergeRoom`: espacio vacío, dispositivos en una sola zona o repartidos, ambiguo, fuera, zonas nuevas e IDs sin cambios;
- navegador: importación de zonas que se fusionan, revisión del plano guardado, espacios desde el riel y posición fija; capturas de Revisar cambios a 1440×900 y 390×844.

## Etapa 0.8 · Dispositivos primero (pista A) · publicada como 0.8.0-beta.1 y 0.8.0-beta.2

Objetivo: vincular y consultar **dispositivos**, con nombres de persona. Nadie vuelve a buscar en una lista de 80 entidades con guiones bajos. Maqueta: secciones [7](vision-mockup.html#s7) y [8](vision-mockup.html#s8).

Se publica en dos betas, para que el propietario pruebe el selector cuanto antes.

**0.8.0-beta.1 · Selector y nombres**

1. **Nombres de persona** (`src/model/names.ts`, función pura):
   - dispositivo: `name_by_user`; si no, `name` del registro de dispositivos;
   - lectura: el nombre de la entidad **sin el prefijo del nombre del dispositivo**; si queda vacío, su clase traducida (*Potencia*, *Temperatura*);
   - espacio: el área de la entidad si tiene una propia; si no, la del dispositivo;
   - nunca se muestra un `entity_id` ni un nombre con `_` fuera de *Buscar cualquier entidad*.
2. **Selector en dos pasos** (`src/editor/device-picker.ts`), como la maqueta §7:
   - **Paso 1, dispositivo:** agrupado por espacio; pestañas *Todos* / *Sin ubicar*; búsqueda por nombre, espacio, fabricante y modelo; los que ya están en el plano llevan *En el plano*.
   - **Paso 2, qué mostrar:** una **lectura principal** preseleccionada según el arquetipo, y **hasta 3 lecturas adicionales**, cada una con su valor actual. El resto queda plegado.
   - **Se excluyen siempre** las entidades de diagnóstico o configuración (`entity_category`), las ocultas y las desactivadas. Un dispositivo sin ninguna entidad útil no aparece.
   - *Buscar cualquier entidad* queda como acción secundaria, para casos especiales.
3. **Contrato:** `bindings.deviceId` y `bindings.readings` (hasta 3 `entity_id` del mismo dispositivo), opcionales y validados en los tres validadores. La entidad principal sigue en `entityId`. Si una entidad deja de pertenecer al dispositivo, la validación en vivo lo informa, sin romper.
4. **En el plano:** un medidor muestra su lectura principal y, si la hay, la primera adicional (*23,4° · 52 %*).
5. La ficha actual usa el selector nuevo. Su rediseño completo es de 0.9.

**0.8.0-beta.2 · Pantalla del dispositivo y *Ahora***

6. **Pantalla del dispositivo** (`src/panels/device-screen.ts`, `src/model/device-screen.ts`), como la maqueta §8:
   - encabezado con icono, nombre, espacio, antigüedad del dato y estado;
   - hasta 3 valores grandes; un medidor de varios canales, como tabla (canal, ahora, hoy);
   - los controles, si los tiene, y las alertas activas;
   - *Actividad* y *Diagnóstico* plegados; *Abrir en Home Assistant* sólo para administradores;
   - en escritorio ocupa el lugar de *Ahora*, sin tapar el plano; en el móvil es una hoja.
7. Tocar un sensor, un medidor, un equipo o infraestructura abre su pantalla.
8. **Columna *Ahora***: alertas, clima por espacio, activos con apagado rápido y energía. Muestra sólo las secciones con datos y se filtra por el espacio elegido. En el móvil es una hoja deslizable.

**Aceptación:**
- [ ] Con un dispositivo de 6 canales y 20 entidades, el paso 1 muestra **una** fila y el paso 2 muestra nombres como *Canal 1 · Potencia*.
- [ ] Ningún texto visible del selector ni de la pantalla del dispositivo contiene `_` ni un `entity_id`, salvo dentro de *Buscar cualquier entidad*. Lo comprueba una prueba de navegador.
- [ ] Las entidades de diagnóstico, configuración, ocultas o desactivadas no aparecen en el paso 1 ni entre las lecturas sugeridas.
- [ ] Un plano de 0.7 sin `deviceId` funciona igual, y su ficha ofrece vincular el dispositivo de su entidad.
- [ ] La pantalla del medidor muestra los 6 canales; la de un aire, su consigna y sus modos.
- [ ] *Ahora* no muestra secciones vacías.

**Pruebas nuevas:**
- unitarias de `names` (con y sin `has_entity_name`, con prefijos, con nombres del usuario y en varios idiomas) y de `device-screen`;
- de navegador del selector, la pantalla del dispositivo y *Ahora*, en escritorio y móvil, con un registro sintético de al menos 15 dispositivos y 80 entidades.

## Etapa 0.9 · Categorías, espacios propios y el mismo diseño (pista A)

Se hace en **checkpoints**: un PR chico por punto, auditado y probado antes de abrir el siguiente. Cada PR dice qué pedidos del propietario cumple, y la auditoría los comprueba uno por uno, no sólo las pruebas. Diseño: [vision.md §12–§14](vision.md#12-categorías) y maqueta [§12](vision-mockup.html#s12), [§13](vision-mockup.html#s13) y [§14](vision-mockup.html#s14). D21 y D22 están aprobadas.

| CP | Quién | Qué | Beta |
|---|---|---|---|
| 1 | Claude | Diseño: maqueta §12–§14, vision §12–§14, D21 y D22. Sólo documentos | — |
| 3 | Claude | **Categoría elegible** en la ficha (maqueta §12). Secciones por categoría; sin `kind` técnico; `display.category` en los tres validadores | 0.9.0-beta.1 |
| 3b | Claude | **Inspector acoplado** en lugar de la ficha flotante (maqueta §3), con vista previa en vivo | (con beta.2) |
| 4 | ChatGPT | **Reglas de aviso** por categoría (`display.alerts`, `display.highlight`): planta, alerta, presencia y medidor. Modelo puro y secciones del inspector | 0.9.0-beta.2 |
| 5 | Claude | **Espacios propios**: `rooms[].shape`, copia desde las zonas del SVG, migración; los consumidores de zonas pasan a la forma | (con beta.2) |
| 6 | ChatGPT | **Controles RF, Equipos RF y diálogos** con el diseño de la maqueta §10–§11. Sin cambios de comportamiento | (con beta.2) |
| 7 | Claude | **Vista por espacio**: botón, encuadre, flechas-vector, mantener, tirar, deslizar e interruptores (`navTargets`, `swipeTarget`) | 0.9.0-beta.3 |
| 8 | Claude | **Editor de espacios**: forma, encuadre, flechas por destino y *saltear* | 0.9.0-beta.4 |
| 9a | Claude | **SVG sin zonas**: dibujar espacios nuevos (*Nuevo espacio* en la barra y el aviso *Este plano no tiene zonas*). La ventana de cada espacio con los componentes. Al importar un SVG, ofrecer que un espacio dibujado a mano tome la zona nueva | 0.9.0-beta.4 |
| 9b | Claude | **Ajustes del plano como página** (maqueta §9) | 0.9.0-beta.5 |

CP2 (los 7 espacios de la vivienda) es del repositorio privado y no se describe acá.

**Diseño en todas las pantallas** (sigue vigente; cada checkpoint lo cumple en lo que toca):
1. **Componentes** (`src/ui/`), como la maqueta §6. Ninguna pantalla define colores, bordes, radios ni tamaños propios. Una prueba falla si aparece un color literal o un `<style>` con reglas propias fuera de `src/ui/`.
2. **Inspector acoplado** en lugar de la ficha (maqueta §3), en CP3b: 360 px a la derecha en escritorio y, en el móvil, una hoja de hasta el 55 % de la altura. Escribe en el `draft`, y el símbolo se redibuja con cada cambio. Tiene ✓, ✕ (revertir ese dispositivo), deshacer y rehacer.
3. **Ajustes del plano como página** (maqueta §9), en CP9.
4. **Controles RF y Equipos ESPHome** (maqueta §10), en CP6.
5. **Paneles nativos, diálogos** (maqueta §11), *Almacenamiento*, *Nuevo hogar* y *Revisar cambios*, en CP6 y CP9. Nunca un diálogo sobre otro.

**Aceptación de la etapa:**
- [ ] Cada categoría muestra su símbolo, su toque y sólo sus secciones, como en la maqueta §12. Un medidor no tiene editor de botones.
- [ ] Un plano de 0.8 carga igual, y su categoría se deduce de su arquetipo.
- [ ] Un SVG nuevo nunca cambia una forma sin que la persona lo elija. Un SVG sin zonas permite crear todos los espacios.
- [ ] En la vista por espacio, las flechas cumplen las reglas de vision §13, que una prueba unitaria comprueba con un plano inventado. Tocar una flecha no viaja; tirar de ella, sí.
- [ ] *Flechas* y *Deslizar* se activan por separado y se recuerdan.
- [ ] Cada pantalla de la lista tiene en su PR una captura a 1440×900 y otra a 390×844, junto a su sección de la maqueta.
- [ ] La prueba de estilos no encuentra colores literales ni estilos propios fuera de `src/ui/`.
- [ ] Todas las pantallas funcionan con el tema claro y el oscuro.

**Pantallas que se revisan:**
- panel principal, vista por espacio, *Ahora*, pantalla del dispositivo, inspector y selector;
- Ajustes del plano (cada sección), el editor de espacios, *Revisar cambios* y acciones del espacio;
- Controles RF (lista, control, aprendizaje, diseñador) y Equipos ESPHome;
- paneles nativos, confirmar, *Almacenamiento*, *Nuevo hogar* y el estado vacío.

## Etapa 0.10 · Una sola casa: conectar y olvidarse

Problema: el plano y los espacios se corrigieron muchas veces en copias (el SVG, el repositorio privado), pero lo que se ve está guardado en Home Assistant y nada conecta una cosa con la otra. Por eso reaparecen cuartos que no van.

**Decisiones del propietario**
- El SVG es sólo una imagen de fondo. Las zonas son de la app.
- Una zona se arma con **rectángulos que se pueden fusionar**, sin formas libres: una L son dos rectángulos unidos.
- Un usuario trae una sola cosa de afuera: el dibujo de su casa. Todo lo demás vive en Home Assistant y queda en sus copias de seguridad.

| Etapa | Qué | Estado |
|---|---|---|
| 1 | **Diagnóstico** en Ajustes: qué plano y qué datos hay guardados, cada problema con su arreglo. Posiciones en una grilla fina (el error al guardar tras mover un icono). La barra oculta los espacios vacíos sin zona | esta entrega |
| 2 | **Editor de zonas:** el plano de fondo y todas las zonas encima; dibujar rectángulos arrastrando, moverlos, cambiar su tamaño, fusionarlos, renombrar, eliminar. Al importar, las zonas del SVG se convierten en rectángulos editables. Antes de aplicar, avisa qué dispositivos cambian de espacio | |
| 3 | **Una sola fuente:** Home Assistant es la única verdad; el repositorio privado deja de ser fuente de datos. La casa del propietario se ordena con su plano 2.5 | |
| 4 | **Plano vinculado:** el dibujo se actualiza sin volver a subirlo. Sin conflictos se aplica solo y se puede deshacer; con conflictos, pregunta | |
| 5 | **Áreas de Home Assistant:** el asistente *Conectar mi casa* asocia zonas y áreas, y propone los dispositivos por área. Ofrece crear las áreas que faltan | |
| 6 | **Limpieza** de copias y de lo que ya no se use | |

## Pista B · ESPHome sin copiar y pegar

Requiere que el propietario **apruebe D19** ([decisions.md](decisions.md)). Puede avanzar en paralelo con 0.8. Su interfaz usa los componentes de 0.9 (maqueta [§5](vision-mockup.html#s5) y [§10](vision-mockup.html#s10)).

1. **Sonda de sólo lectura** (`homemanager/esphome/inspect`), primero y sola. Para cada equipo ESPHome devuelve:
   - si se encontró ESPHome Builder;
   - el nombre del archivo;
   - si el archivo existe en `esphome/`;
   - los componentes detectados, con sus `id`;
   - el paquete instalado y su versión.

   No escribe nada. El propietario la ejecuta en su instalación antes del paso 2, para confirmar que los supuestos se cumplen allí.
2. **Registro de paquetes** (`custom_components/homemanager/esphome_packages.py`): `rf` con su regla de detección y sus sustituciones.
3. **Propuesta** (`…/prepare`): las líneas exactas que se agregan o cambian, y un token de un solo uso que caduca en 5 minutos.
4. **Aplicación** (`…/apply`):
   - copia en `esphome/.homemanager-backups/`;
   - inserción como texto (sin reformatear, conservando comentarios y `!secret`);
   - compilación y OTA a través de la conexión de HA con ESPHome Builder, con el avance en pantalla;
   - verificación de la acción `homemanager_rf_send`;
   - restauración automática si falla la compilación.
5. **Actualizar paquete** en todos los equipos cuando cambia la versión de HomeManager.
6. **Interfaz:**
   - *Equipos ESPHome* reemplaza a *Equipos RF*, con el estado de cada equipo y un botón por acción;
   - sin ESPHome Builder, el flujo de copiar y pegar actual.

**Aceptación:**
- [ ] Con ESPHome Builder disponible, preparar un equipo no pide escribir ni pegar nada.
- [ ] El navegador nunca recibe el contenido del archivo, sólo las líneas que cambian.
- [ ] Un fallo de compilación deja el archivo exactamente como estaba (lo comprueba una prueba).
- [ ] La inserción es idempotente: aplicar dos veces no duplica líneas. También funciona con o sin un bloque `packages:` existente, y con paquetes en forma de lista o de mapa.
- [ ] Hay pruebas de integración con un ESPHome Builder simulado, para compilación correcta, compilación fallida y subida fallida.

## 1.0

- Modo pared: pantalla completa, tema oscuro y vuelta a la casa entera.
- Revisión de accesibilidad: foco visible, contraste AA y lector de pantalla en cada vista.
- `docs/` al día y guía de instalación con capturas.
- Decidir sobre `activity/subscribe` en la integración y las notificaciones al móvil.
