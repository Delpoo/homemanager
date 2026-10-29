# Changelog

Versionado [SemVer](https://semver.org/lang/es/). La versión vive en `package.json` y se replica en `custom_components/homemanager/manifest.json`; `tests/versioning.test.mjs` falla si divergen o si esta lista no empieza por la versión actual. Las releases las publica sólo el propietario (ver [docs/versioning.md](docs/versioning.md)).

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
