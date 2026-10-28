# HomeManager

Frontend Lovelace para visualizar espacios, vincular iconos a entidades de Home Assistant y abrir controles avanzados nativos.

**Estado: frontend implementado, validado con una sesión HA simulada.** El build genera `dist/homemanager.js` con la tarjeta, editor y paneles nativos. No está instalado ni verificado contra una instancia real de Home Assistant o hardware.

## Arquitectura

- Una tarjeta propia y su editor visual usan la sesión existente de Home Assistant.
- Los espacios (habitaciones) son datos de cada instalación: se detectan en el SVG y se nombran en el editor, sin modificar código.
- El administrador selecciona un icono, una entidad, acciones/scripts y un panel avanzado; guarda desde el editor Lovelace en un dashboard de tipo `storage`.
- El SVG se importa como dato, se valida/sanitiza y se guarda dentro de la configuración autenticada del dashboard. El acceso alcanza a las sesiones HA que pueden leer ese dashboard; no es un almacén de secretos ni aislamiento por usuario.
- Los estados y comandos pendientes viven en memoria. La configuración persiste por separado.
- Los paneles, incluido el del ventilador RF, son propios. Browser Mod está excluido, sin adaptadores ni compatibilidad transitoria.
- RF permanece en Home Assistant. El navegador solo llama a entidades/scripts permitidos y nunca contiene códigos RF.

## Repositorios

`homemanager` contiene software genérico público. `homemanager-instance` contiene fuentes y exportaciones privadas de una instalación. No existe sincronización automática entre ambos; el código público no consulta GitHub privado ni recibe sus credenciales.

No copiar proyectos previos completos: cada archivo debe pasar revisión de privacidad y licencia. `architecture/` aquí describe arquitectura del software, no un plano de vivienda.

## Estructura estable

| Ruta | Propósito |
| --- | --- |
| `src/` | Tarjeta, editor, paneles nativos y adaptador HA genéricos |
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

Estado y próximos pasos: [auditoría del 29 de octubre de 2026](docs/audit-2026-10-29.md) y [handoff del integrador](docs/handoff-agent4.md). Comenzar por [contrato V2](docs/contract.md), [colaboración](docs/contributing.md) y [decisiones](docs/decisions.md). La distribución prevista está en [HACS](docs/hacs.md); los controles obligatorios están en [seguridad](docs/security.md).

Versionado SemVer mediante tags y releases; los nombres del producto, archivos y ramas de trabajo no incluyen versiones. Ningún commit instala ni despliega automáticamente en Home Assistant.

## Nombre y licencia

HomeManager es el nombre de trabajo elegido por el propietario. Existen otros productos con ese nombre; no se afirma exclusividad, afiliación ni disponibilidad de marca. Ver [registro de nombre](docs/name-review.md). Licencia de software MIT, autorizada por el propietario para esta publicación inicial. Planos y datos privados tienen derechos separados.
