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

**Antes de pedir revisión**
- Pasar `npm run check`, `npm run format:check`, las pruebas de navegador (escritorio y móvil), `pytest` en las dos versiones de HA de la CI y el E2E local.
- Adjuntar capturas a 1440×900 y 390×844 de cada pantalla que cambió.

## Etapa 0.7 · Base visual, arquetipos y respuesta (pista A)

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

## Etapa 0.8 · Dispositivos de HA completos (pista A)

1. `bindings.deviceId` en el contrato y en el adaptador. La entidad principal debe pertenecer a ese dispositivo; si no pertenece, la validación en vivo lo informa, sin romper.
2. **Selector en dos pasos** (`src/editor/device-picker.ts`): dispositivo y luego entidad principal preseleccionada. Se mantiene *Buscar cualquier entidad*.
3. **Pantalla del dispositivo** (`src/panels/device-screen.ts`, `src/model/device-screen.ts`):
   - las lecturas agrupadas por clase;
   - un medidor de varios canales como tabla;
   - las entidades de diagnóstico plegadas;
   - *Abrir en Home Assistant* para administradores.
4. Toque por arquetipo: sensores, medidores, equipos e infraestructura abren su pantalla.
5. **Columna *Ahora***: clima, activos con apagado rápido, energía y alertas. Se filtra por espacio.

**Aceptación:**
- [ ] Vincular un medidor de energía de 6 canales se hace eligiendo el dispositivo, no una de sus 20 entidades. Su pantalla muestra los 6 canales.
- [ ] Con el campo vacío, el selector sugiere primero los dispositivos que todavía no están en el plano.
- [ ] La columna *Ahora* sólo muestra secciones que tienen datos.

## Etapa 0.9 · Editar es ver (pista A)

1. **Inspector acoplado**:
   - 360 px a la derecha en escritorio; hoja de hasta el 55 % en el móvil;
   - la cámara desplaza el símbolo elegido al área visible.
2. **Vista previa en vivo:**
   - el inspector escribe en el `draft`;
   - el símbolo y una miniatura se redibujan con cada cambio;
   - ✓ (listo), ✕ (revertir ese dispositivo), y deshacer / rehacer por cada edición.
3. **Secciones por arquetipo**, en el orden de [vision.md §7](vision.md#7-editar-es-ver). La sección *Alertas* trae sus reglas editables.
4. **Fusionar en…** en *Ajustes del plano*, y su oferta automática al reemplazar el plano.

**Aceptación:**
- [ ] Mientras se edita, el símbolo editado siempre está visible, en escritorio y en el móvil.
- [ ] Agregar un control fijado o cambiar el tamaño se ve en el plano antes de tocar ✓.
- [ ] ✕ devuelve el dispositivo exactamente a como estaba al abrir el inspector.
- [ ] Un medidor no muestra la sección *Controles*.

## Pista B · ESPHome sin copiar y pegar

Requiere que el propietario **apruebe D19** ([decisions.md](decisions.md)). Puede ir en 0.7 si está lista a tiempo; si no, en 0.8.

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
