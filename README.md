# HomeManager

Frontend Lovelace para visualizar espacios, vincular iconos a entidades de Home Assistant y abrir controles avanzados nativos.

**Estado: candidata 0.3.1 de seguridad, sin release publicada.** Cambia los permisos de lectura y hace opcional la carga global del frontend. Revisar [seguridad y migración](docs/security-hardening.md) antes de instalar. [Instalación](docs/installation.md) · [Pruebas](docs/testing.md) · [Cambios](CHANGELOG.md).

## Arquitectura

- Una tarjeta propia y su editor visual usan la sesión existente de Home Assistant.
- Los espacios (habitaciones) son datos de cada instalación: se detectan en el SVG y se nombran en el editor, sin modificar código.
- El administrador selecciona un icono, una entidad, acciones/scripts y un panel avanzado; guarda desde el editor Lovelace en un dashboard de tipo `storage`.
- La integración compañera (`custom_components/homemanager`) guarda los hogares y sus planos en el almacenamiento de HA, con revisiones atómicas e historial de planos, y añade el panel **HomeManager** a la barra lateral ([integración](docs/integration.md)). El SVG se valida/sanitiza al importar y al renderizar, y sólo viaja por el WebSocket autenticado. Las tarjetas con la configuración inline en Lovelace siguen funcionando y pueden migrarse desde su editor.
- Los estados y comandos pendientes viven en memoria. La configuración persiste por separado.
- Los paneles, incluido el del ventilador RF, son propios. Browser Mod está excluido, sin adaptadores ni compatibilidad transitoria.
- RF permanece en Home Assistant. El navegador solo llama a entidades/scripts permitidos y nunca contiene códigos RF.

## Repositorios

`homemanager` contiene software genérico público. `homemanager-instance` contiene el dibujo privado de una instalación; sus datos viven en su Home Assistant. No existe sincronización automática entre ambos; el código público no consulta GitHub privado ni recibe sus credenciales.

No copiar proyectos previos completos: cada archivo debe pasar revisión de privacidad y licencia. `architecture/` aquí describe arquitectura del software, no un plano de vivienda.

## Estructura estable

| Ruta | Propósito |
| --- | --- |
| `src/` | Tarjeta, editor, paneles nativos, panel lateral y adaptador HA genéricos |
| `custom_components/homemanager/` | Integración compañera: almacenamiento, WebSocket, panel y bundle |
| `architecture/` | Diseño de software y límites entre componentes |
| `assets/` | Recursos genéricos con licencia registrada |
| `schemas/` | Contratos JSON, configuración persistente y estado efímero |
| `tests/` | Verificaciones con datos sintéticos |
| `scripts/` | Validación, controles de publicación y compilación |
| `docs/` | Contrato, decisiones, seguridad, distribución y colaboración |
| `dist/` | Salida generada; nunca una fuente de datos privados |

## Desarrollo

Requiere Node.js 24. Usar `npm ci --ignore-scripts`, `npm run check` y `npm run test:browser` (requiere Chromium o Chrome). `npm run build` genera `dist/homemanager.js` sin datos de instalación ni estado en vivo. Las pruebas usan geometría, dispositivos y servicios sintéticos.

Para registrar la tarjeta, importar la arquitectura y configurar el guardado administrador en Lovelace `storage`, ver [la guía del frontend](docs/frontend.md). El editor permite modificar iconos, entidades, acciones/scripts, fuentes de estado y paneles sin recompilar el recurso. Las lecturas y confirmaciones de comandos permanecen en memoria.

Estado y próximos pasos: [estado y continuación](docs/handoff-agent4.md).

Versionado SemVer mediante tags y releases; los nombres del producto, archivos y ramas de trabajo no incluyen versiones. Ningún commit instala ni despliega automáticamente en Home Assistant.

## Nombre y licencia

HomeManager es el nombre de trabajo elegido por el propietario. Existen otros productos con ese nombre; no se afirma exclusividad, afiliación ni disponibilidad de marca. Ver [registro de nombre](docs/name-review.md). Licencia de software MIT, autorizada por el propietario para esta publicación inicial. Planos y datos privados tienen derechos separados.
