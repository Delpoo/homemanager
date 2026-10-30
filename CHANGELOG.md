# Changelog

Versionado [SemVer](https://semver.org/lang/es/). La versión vive en `package.json` y se replica en `custom_components/homemanager/manifest.json`; `tests/versioning.test.mjs` falla si divergen o si esta lista no empieza por la versión actual. Las releases las publica sólo el propietario (ver [docs/versioning.md](docs/versioning.md)).

## 0.9.0-beta.2 — beta

Segunda parte de la etapa 0.9 de [docs/roadmap.md](docs/roadmap.md): **espacios propios y vista por espacio** (D22).

- **Vista por espacio:** un botón junto al zoom encuadra al 100 % el espacio que está en el centro. Fuera de su borde, unas flechas sin fondo apuntan al centro de cada espacio al que se puede ir, con su ángulo real, y son más chicas y tenues cuanto más lejos está. *Casa* vuelve al plano completo.
- **Tocar** una flecha no hace nada; **mantenerla** muestra el nombre; **tirar de ella hacia atrás** viaja, con una transición y sin recargar. Un **deslizamiento** rápido del plano trae el espacio del otro lado, o rebota si no hay ninguno. Enter y las flechas del teclado también viajan.
- *Flechas* y *Deslizar* se activan por separado y quedan recordados en el navegador.
- **Cada espacio puede tener su forma propia** (`rooms[].shape`). Al importar un plano, cada zona del SVG se guarda como forma de su espacio: un plano posterior sin esa zona ya no deja espacios huérfanos. Mientras la zona existe, se sigue usando su contorno exacto.
- Renombrar un espacio ya no borra su forma.

## 0.9.0-beta.1 — beta

Primera parte de la etapa 0.9 de [docs/roadmap.md](docs/roadmap.md): **categorías** (D21).

- **Categoría de cada dispositivo**, elegible arriba de la ficha: Interruptor, Equipo, Control remoto, Medidor, Planta, Alerta, Presencia o Infraestructura. Arranca con la que sugiere la app, y al vincular otro dispositivo propone la suya, salvo que ya hayas elegido una.
- La categoría decide cómo se ve el símbolo y qué hace tocarlo, y **la ficha muestra sólo lo suyo**: un medidor o una planta eligen qué muestra el símbolo (icono, valor o los dos) y no tienen editor de botones; Interruptor, Equipo y Control remoto conservan sus controles y el control RF.
- Lo que una categoría oculta no se borra.
- Desaparece el campo técnico *Tipo de dispositivo*.
- Campo opcional `display.category`. Un plano de 0.8 sigue igual.

## 0.8.0-beta.2 — beta

Segunda parte de la etapa 0.8 de [docs/roadmap.md](docs/roadmap.md): la pantalla de cada dispositivo y la columna *Ahora*.

- **Pantalla del dispositivo:** tocar un sensor, un medidor, un equipo o infraestructura abre su pantalla, con hasta 3 valores destacados, todas sus lecturas útiles agrupadas, sus controles, actividad y diagnóstico plegados. En escritorio ocupa la columna derecha; en el móvil, una hoja que se desliza.
- Un medidor de 6 canales se ve como una tabla: *Ahora* y *Hoy* por canal.
- Un aire muestra la temperatura objetivo, sus modos y el encendido. Si Home Assistant sólo **supone** su estado (aires IR o RF), la pantalla dice *Estado estimado* y no marca ningún modo como actual.
- **Ahora:** alertas, clima por espacio, equipos activos con apagado rápido y energía; sólo aparecen las secciones con datos, y se filtra por el espacio elegido.
- **⋮ → Apariencia:** Automático (sigue a Home Assistant), Claro u Oscuro. La elección queda en este navegador.
- *Abrir en Home Assistant* sólo para administradores.

## 0.8.0-beta.1 — beta

Primera parte de la etapa 0.8 de [docs/roadmap.md](docs/roadmap.md): dispositivos primero, con nombres de persona.

- **Vincular un dispositivo** en dos pasos: primero el dispositivo de Home Assistant, agrupado por espacio, con búsqueda por nombre, espacio, fabricante y modelo, y las pestañas *Todos* y *Sin ubicar*; después la lectura principal, ya sugerida, y hasta 3 lecturas adicionales con su valor actual. Un medidor de 6 canales aparece como una sola fila.
- **Nombres de persona:** el nombre que le diste al dispositivo, y lecturas sin repetirlo (*Canal 1 · Potencia*). Nunca un `entity_id` ni guiones bajos, salvo en *Buscar cualquier entidad*.
- No se ofrecen las entidades de diagnóstico, configuración, ocultas ni desactivadas.
- Un medidor muestra en el plano su lectura principal y la primera adicional (*23,4° · 52 %*).
- Campos opcionales `bindings.deviceId` y `bindings.readings`. Un plano de 0.7 sigue igual, y su ficha ofrece vincular el dispositivo de su entidad.
- El selector de iconos muestra *Cambiar icono* en lugar del nombre técnico.

## 0.7.0-beta.1 — beta

Etapa 0.7 de [docs/roadmap.md](docs/roadmap.md): base visual, tipos de símbolo y respuesta a cada toque (D20).

- **Aspecto propio:** paleta clara y oscura de HomeManager (salvia, marfil y grafito) y logo; el azul de Home Assistant ya no aparece dentro del plano.
- **Barra superior:** logo, nombre del hogar, barra de actividad, alertas, reloj y menú ⋮. La administración (editar, ajustes, hogares, almacenamiento, controles RF) pasa al menú y sólo la ven los administradores.
- **Riel de espacios** con iconos: a la izquierda en pantallas anchas y abajo en el móvil, con un contador rojo de alertas y un punto si algo está encendido. Elegir un espacio oscurece el resto del plano y dibuja su contorno real.
- **Símbolos por tipo** (actuador, equipo, sensor, medidor, mando, infraestructura): los medidores muestran su valor (*23,4°*, *1,79 kW*); un anillo indica lo encendido; la marca de salud aparece sólo si hay un problema. Campos opcionales `rooms[].icon`, `display.archetype` y `display.show`.
- **Alertas:** fuga, humo, gas, CO y problema; batería baja y equipos no disponibles hace más de 10 minutos. Se ven en el símbolo, en su espacio y en la barra; tocar la alerta encuadra el equipo.
- **Actividad:** cada comando ocupa una línea que pasa de *Enviado* a *en el aire* y a *confirmado* sólo con una medición independiente, o a *No se pudo enviar*. Historial de los últimos 50.
- **Capas** con icono y nombre; *Infraestructura* empieza apagada.
- **Importar un plano** muestra *Revisar cambios* antes de aplicar: dispositivos que cambian de espacio, espacios sin zona (fusionar, conservar o quitar), zonas nuevas, ambiguos y fuera de zona. *Revisar espacios con el plano* repara el plano guardado, y Ajustes avisa si hay espacios sin zona. Todo se deshace en un paso y se guarda con *Guardar*.
- **Espacios desde el riel** en modo edición: renombrar, icono, fusionar en otro y quitar. Un dispositivo fijo bloquea su posición, pero su espacio se puede cambiar desde la ficha.

## 0.6.0-beta.1 — beta, sin publicar

Los símbolos del plano se usan por cómo se tocan, no por formularios (D18).

- **Controles del dispositivo** (contrato V2, campos opcionales `controls`, `tap`, `display.size` y `display.pinned`): cada dispositivo tiene controles elegidos por cómo se usan, no por lo que controlan: **pulsador**, **ciclo** (2 a 4 acciones, cada toque envía la siguiente y el símbolo muestra el icono de la última), **deslizador** (el valor de una entidad, o de 2 a 12 pasos), **subir / bajar** y **selector**. Lo que hace cada paso es una acción del plano.
- **Tocar** ejecuta el control elegido (o abre el panel); **mantener pulsado**, el clic secundario o Mayús+Intro abren siempre el panel, con todos los controles. Desaparecen los 4 accesos al mantener pulsado y el círculo **⋯**. Un plano de 0.5 sigue funcionando igual: su acción principal es el toque y sus accesos aparecen como controles del panel.
- **En el plano:** hasta 3 controles fijados junto al símbolo (por ejemplo un pulsador y un deslizador vertical) y tamaño chico, mediano o grande. Cada envío lo dice junto al símbolo: *Enviado: Apagar*.
- **Ficha del dispositivo:** guardar, eliminar, mover y restablecer valores sugeridos con iconos; guardar cierra la ficha. Un dispositivo nuevo empieza con controles sugeridos y visibles (encender / apagar como ciclo) que se pueden cambiar. Selector de iconos con búsqueda y sugerencias; el de entidades muestra sugerencias sin escribir nada y se desplaza. La ayuda **ⓘ** va junto a su campo. *Medido* se explica en su ayuda, sin casilla de verificación.
- **Eco RF** ([docs/rf-manager.md](docs/rf-manager.md)): alrededor de cada envío, los receptores con el paquete (el propio Athom incluido) escuchan un momento; si oyen el mismo código, el símbolo dice *en el aire ✓*. Es evidencia de emisión, no de que el equipo lo recibió. Sin cambios de firmware.
- Arreglos: tras mantener pulsado, el toque siguiente ya no se pierde; el panel abierto al mantener pulsado con ratón ya no se cierra al soltar.
- El diseñador RF nombra sus elementos con el mismo vocabulario (pulsador, subir / bajar, deslizador por pasos, selector).

## 0.5.0-beta.1 — beta, sin publicar

Plan 0.5: el plano y los controles RF se usan como una app, sin formularios técnicos a la vista.

- **Editor del plano centrado en el mapa** (parte A): botón **+** flotante, ficha emergente del dispositivo (nombre, icono, entidad, espacio), *Más opciones* para lo técnico, **Ajustes del plano** aparte, ayuda **?** en los campos no obvios, eliminar con ventana de confirmación y *Nuevo hogar* con **Cancelar**. Al vincular una entidad se crea la acción principal.
- **Controles RF libres** (D17, [docs/rf-manager.md](docs/rf-manager.md)): un control es nombre e icono; los botones se aprenden en cualquier orden, con estado en vivo y aviso de señal no reconocida. Se confirma con 3 tramas iguales en una pulsación o dos pulsaciones a más de 0,3 s. Las pruebas cambian una cosa por vez y dicen qué cambió; el pulso se muestra como medido.
- **Partes y roles:** el ventilador y la luz de Home Assistant se arman con roles por parte; el *Apagar* de la luz ya no cae en el ventilador.
- **Diseñador del control:** botones, interruptores, −/+, selectores por pasos y de modos en una cuadrícula, para mover, redimensionar, editar y quitar.
- **Equipos RF:** todos los dispositivos ESPHome, el YAML exacto con **Copiar**, enlace a ESPHome Builder, receptor por defecto y prueba de recepción.
- **Accesos rápidos y control en el panel** (contrato V2, campos opcionales `quickActions` y `remoteId`): mantener pulsado un icono muestra hasta 4 accesos; el panel del dispositivo dibuja su control RF.
- La biblioteca RF pasa a la versión 2 con migración automática que conserva las entidades de 0.4. Cerrar la página durante una captura ya no produce un error en Home Assistant.

## 0.4.0-beta.1 — beta, sin publicar

Incluye 0.3.1. Primera versión para probar desde HACS el gestor de controles RF en una instalación real.

- **Gestor de controles RF** (D16, [docs/rf-manager.md](docs/rf-manager.md)): paquete ESPHome de envío y captura; decodificación RCSwitch con medición del pulso; biblioteca de controles en `.storage/homemanager.rf`; envío con cola por transmisor.
- **Asistente** en el panel lateral (*Controles RF*, administradores): captura botón por botón, prueba guiada que cambia una cosa por vez y detalle del control.
- **Entidades de HA** por control: `fan`, `light` y `button`, con estado asumido y corrección sin transmitir.
- **Selector por pasos** para ventiladores con 2–12 velocidades; cada parada envía, también la actual.
- **Selector de entidades:** primero lo operable; sin actualizaciones ni diagnósticos.
- Acciones de GitHub actualizadas: `actions/checkout` 7.0.1 y `actions/setup-node` 7.1.0.

## 0.3.1 — sin publicar

- Acceso privado por defecto; lectores elegidos desde las opciones de la integración.
- Carga global del frontend sólo con autorización explícita en las opciones.
- Validación completa V2 y perfil SVG estático en servidor; presupuesto de expansión en ambos lados.
- Suscripciones acotadas y limpieza al cancelar; cuotas globales de almacenamiento e historial con purga explícita.
- Guardados serializados y recuperación de fallos; documentos inválidos conservados en cuarentena.
- Paquete reproducible con lista de archivos permitidos y verificación final. Preparación manual de una release en borrador sólo después de superar toda la CI, con atestación y sin sobrescribir assets.

## 0.3.0 — sin publicar

Primera versión candidata para instalar en una vivienda real.

- **Producto único:** integración `homemanager` (almacenamiento con revisiones atómicas, historial de planos, panel lateral, bundle servido por la integración) + tarjeta + editor + paneles nativos, instalables como una sola integración HACS.
- **Contrato V2:** espacios definidos por cada instalación; migración automática y no destructiva desde V1.
- **Interacción espacial:** agrupación de dispositivos cercanos sin solapamientos, encuadre animado y resaltado de espacios, doble toque, pulsación larga, controles flotantes, hoja inferior en móvil.
- **Paneles nativos con capacidades reales:** brillo, temperatura de color, velocidad, modos, oscilación, dirección, posición, climatización y scripts con sus campos. Los comandos se muestran como enviados, nunca como confirmados sin evidencia.
- **Editor:** selector de entidades por nombre/área, alta en un paso desde una entidad con ubicación tocando el plano, gestión de espacios, reemplazo de plano con migración de posiciones, restauración de planos anteriores.
- **Tema e idioma:** variables de tema de Home Assistant (claro/oscuro/personalizado); español e inglés según el idioma del usuario.
- **Seguridad:** lectura para usuarios autenticados, escritura sólo administradores, validación del sobre en el servidor y rechazo de contenido activo en planos además de la sanitización del cliente.
- **Compatibilidad comprobada:** Home Assistant 2026.2.3 y 2026.10.4 (pruebas de integración y E2E en instancias locales desechables).
