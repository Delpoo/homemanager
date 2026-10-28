# Decisiones de arquitectura

Estado del producto: **FUNDACIÓN; frontend, editor e integración operativa todavía pendientes**. Estas decisiones orientan el trabajo de los agentes y la revisión del futuro integrador. No afirman que los controles descritos estén implementados.

## D01 — Dos repositorios con finalidades permanentes

`homemanager` contiene software genérico y recursos publicables. `homemanager-instance` mantiene fuentes del plano real, ubicaciones y personalización en privado. No se copia la instancia al frontend público, a sus fixtures o a los assets de release. No se cambia a pública la instancia para facilitar HACS. Cada creación, publicación, acceso o permiso nuevo conserva la aprobación que corresponda al usuario.

## D02 — Tarjeta frontend y popups nativos

HomeManager será una tarjeta personalizada Lovelace con controles y paneles avanzados propios. Browser Mod queda totalmente descartado: no es dependencia, opción, adaptador ni mecanismo transitorio. El nuevo software no llama sus servicios. Esta decisión no elimina, modifica ni migra los popups que ya existen en HA.

La tarjeta utiliza el contexto y la conexión autenticada de Home Assistant. Se prioriza no añadir backend Python. La API de tarjeta permite recibir configuración y contexto HA. [API oficial de tarjeta](https://contributors.home-assistant.io/frontend/custom-ui/card/).

## D03 — RF y C01 permanecen en Home Assistant

Toda lógica RF, códigos, transmisión, normalización de comandos y scripts de C01 siguen en HA. El frontend enlaza acciones lógicas con entidades/scripts. No se trasplanta la implementación RF al navegador. El estado físico de un equipo RF no se deduce únicamente del éxito de una llamada.

## D04 — Editor visual obligatorio

El editor propio permitirá elegir un icono y asociarle entidad HA, acciones/scripts, fuente de estado y panel avanzado mediante controles visuales. Los bindings son declarativos y validados; nunca ejecutan JavaScript o plantillas arbitrarias.

En V1 el editor vive en `getConfigElement()` dentro del editor Lovelace, emite `config-changed` y utiliza el guardado explícito del anfitrión. El evento por sí solo no garantiza persistencia fuera de ese contexto. [Contrato oficial de editor](https://contributors.home-assistant.io/frontend/custom-ui/card-editor/).

## D05 — Persistencia nativa autenticada y administración

La V1 requiere dashboard `storage` y administrador para editar y guardar. No utiliza `localStorage` como fuente canónica ni modifica `.storage` directamente. El servidor de HA exige administración para guardar. YAML no soporta este mecanismo de escritura. [Autorización](https://github.com/home-assistant/core/blob/2026.10.4/homeassistant/components/lovelace/websocket.py#L138), [persistencia](https://github.com/home-assistant/core/blob/2026.10.4/homeassistant/components/lovelace/dashboard.py#L136).

Se admite una sesión de edición a la vez. HA guarda el documento de dashboard sin una condición de revisión en la petición consultada: no se promete protección atómica frente a cambios simultáneos. Un futuro requisito de edición delegada o concurrencia estricta obliga a revisar esta decisión antes de introducir un backend.

## D06 — Configuración duradera separada del estado efímero

El documento duradero contiene IDs, habitación, posición, movilidad, presentación, bindings, definición del panel y política de confianza. El estado observado, disponibilidad, timestamps, respuestas de acciones, selección, zoom y popup abierto son datos de ejecución.

Si el contrato serializado incluye un bloque `state`, su estado persistido/exportado será `unknown`, sin valores vivos ni timestamps que aparenten vigencia. La confianza efectiva se calcula en ejecución a partir de la evidencia disponible; guardar configuración no confirma una observación ni valida el comportamiento físico.

## D07 — Contrato espacial V1

Se conserva `schemaVersion: 1` y el catálogo `devices: [...]`, con ID estable, `roomId`, tipo, posición normalizada `x/y`, movilidad, presentación, bindings y tratamiento explícito de confianza de estado. El contrato común y sus esquemas son la fuente normativa; cambios requieren un PR coordinado, sin divergencias silenciosas entre agentes.

El SVG identifica habitaciones mediante `room-${roomId}`. Los identificadores compartidos son `living`, `dining`, `kitchen`, `office`, `master-bedroom`, `bath-2`, `master-bath`, `balcony`, `entry`, `hallway`, `dbst` y `ac-ledge`. Su geometría, posiciones de dispositivos, asociaciones y nombres personalizados pertenecen a la instancia privada.

Los dispositivos de movilidad `fixed` no se desplazan mediante el arrastre normal. Si se añade reubicación, exige un modo administrativo explícito, validación y guardado deliberado; no se confunde con uso cotidiano.

## D08 — Plano autenticado como dato inline

El editor importará y sanitizará el SVG y lo guardará inline como dato de configuración HA. Esta decisión evita depender de `/local/`, cuyos archivos estáticos no requieren autenticación. [Advertencia oficial sobre `www`](https://www.home-assistant.io/integrations/http/#hosting-files).

La configuración no es secreta frente a todas las demás sesiones autenticadas de HA. Se deberán probar tamaño, carga y restauración antes de aceptar el plano real. No se incorporan credenciales GitHub al frontend; la instancia privada es fuente y respaldo, no una API que consulta la tarjeta.

## D09 — Distribución y versiones

Fuentes en `src/`, compilación en `dist/`, entrada estable `homemanager.js`, versiones mediante tags y releases. La distribución prevista es Dashboard en HACS; no implica que un mismo paso instale una integración Python. No se publica una release funcional hasta completar las pruebas y la aprobación de publicación. Véase [hacs.md](hacs.md).

## D10 — Licencia y seguridad pendientes de completar

El propietario autorizó MIT para el código público el 28 de octubre de 2026. Las dependencias y recursos incorporados deben admitir esa distribución y conservar sus avisos. El plano privado tiene derechos independientes.

Los requisitos de sanitización SVG, validación de bindings, permisos, guardado y ejecución segura corresponden a las implementaciones de frontend y conexión. Esta fundación no los sustituye con documentación o un escáner de expresiones regulares. La revisión del integrador debe comprobarlos con evidencia. Véase [security.md](security.md).
