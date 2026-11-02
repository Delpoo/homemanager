# Lote 1 · E03 y E04

Capturas ficticias, sin conexión a una instalación de Home Assistant. Una pasada del script `scripts/capture-redesign-lote1.mjs` registra 40 imágenes: ocho pantallas y dos referencias, en 1440×900 y 390×844, claro y oscuro. Las imágenes admitidas y sus huellas están en `docs/public-assets.json`. Una primera inspección descubrió el color heredado del contador en cero; las capturas finales se regeneraron después de corregirlo.

## Comparación con la maqueta

| Parte | Resultado y diferencia explicada |
|---|---|
| Barra superior (§1/§4) | Conserva actividad, hogar, reloj y menú. El símbolo y contador de alertas permanecen con cero, discretos; con avisos son rojos. El teléfono también conserva el símbolo de alerta. |
| Capas (§1, comentario del propietario) | Se reemplazan las letras por encendido, ojo, rayo y red. La pila de capas minimiza. Nombres al pasar, enfocar o mantener; objetivos de 44 px. La elección de iconos conserva la maqueta, sin afirmar una prueba de comprensión con usuarios. |
| Ajustes | Se agrega Mostrar capas al menú y a Plano y espacios. La preferencia se guarda sólo en el navegador; el hogar no cambia. |
| Salud (§2) | Los símbolos sanos y sin vínculo deliberado quedan sin punto. Se mantienen las marcas de no disponible, vínculo roto y estado asumido; el mando conserva su distintivo propio, que no es una marca de salud. |
| Encabezado de dispositivo (§8) | Icono, nombre, espacio, salud y antigüedad. Se conserva Cerrar y la devolución del foco. |
| Resumen del medidor (§8) | Ahora, Hoy y Tensión cuando existen esas lecturas. Sus nombres completos quedan como ayuda; no se transforma energía acumulada en consumo de hoy. Las lecturas elegidas que no entren siguen en Otras lecturas. |
| Tabla (§8) | Canal, barra relativa, Ahora y Hoy; seis canales con nombres originales Power 1…6. Orden numérico, datos en vivo y unidades comparables. Duplicados y acumulados siguen disponibles en otras lecturas. |
| Detalles (§8) | Otras lecturas, Actividad y Diagnóstico comienzan plegados. Abrirlos conserva su estado durante una actualización del mismo dispositivo. Cambiar de dispositivo los pliega. |
| Pie (§8) | Abrir en Home Assistant y Editar, visibles para administradores; el pie queda accesible fuera del desplazamiento de lecturas. |
| Equipo en teléfono (§8) | Una hoja con consigna, modos, encendido y lecturas. Se conservan los controles soportados y sus motivos de indisponibilidad, sin afirmar confirmación de RF. |
| Temas | Cambian los componentes. El dibujo de fondo sigue siendo el existente: sus alternativas oscuras pertenecen a E11. |

## Imágenes

Cada nombre de la tabla existe con prefijo `desktop-light-`, `desktop-dark-`, `mobile-light-` y `mobile-dark-`.

| Nombre | Qué muestra |
|---|---|
| `plan.png` | Capas e indicador discreto en cero |
| `alerts.png` | Aviso real y contador rojo |
| `layers.png` | Capas minimizadas |
| `settings.png` | Ajuste para mostrar u ocultar capas |
| `meter.png` | Resumen, seis canales, bloques plegados y pie |
| `readings.png` | Lectura secundaria y diagnóstico disponibles |
| `sensor.png` | Sensor sin tabla de canales vacía |
| `climate.png` | Controles y lecturas del equipo |
| `reference-shell.png` | Maqueta §1/§4 |
| `reference-device.png` | Maqueta §8 |

Inspección representativa: [panel](desktop-light-plan.png), [medidor](desktop-light-meter.png), [equipo en teléfono](mobile-light-climate.png), [medidor oscuro](mobile-dark-meter.png). Los controles de captura comprueban dimensiones y ausencia de desbordamiento horizontal de capas, tabla y pie. Las pruebas funcionales se ejecutaron en escritorio; las capturas móviles son comprobación visual y no sustituyen un teléfono físico.
