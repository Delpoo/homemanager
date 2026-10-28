# Distribución mediante HACS

Estado: **FUNDACIÓN; todavía no es un producto funcional ni instalable**. No se ha validado el frontend dentro de Home Assistant. Esta documentación define la distribución prevista y los criterios que deben cumplirse antes de publicar.

## Paquete público

HomeManager será una tarjeta personalizada de Lovelace. Su repositorio público contendrá únicamente software y recursos genéricos. `homemanager-instance` contendrá las fuentes privadas del plano y su personalización; no se distribuye por HACS.

La categoría HACS será **Dashboard**, denominada `plugin` en su backend. La entrada compilada estable será `dist/homemanager.js`; las fuentes permanecerán en `src/`. El manifest `hacs.json` estará en la raíz. El paquete preferido es un único módulo JavaScript autocontenido, sin descargar código ejecutable desde servicios externos durante su uso. HACS documenta módulos en `dist`, raíz o assets de release; los recursos adicionales requieren revisar el paquete completo. [Requisitos oficiales de Dashboard](https://hacs.dev/docs/publish/plugin/).

HACS exige un repositorio GitHub público. El repositorio necesita descripción, topics y README; `render_readme: true` permite utilizar ese README. `filename` identifica `homemanager.js` y `hide_default_branch: true` evita ofrecer la rama de desarrollo como versión instalable. No se declarará una versión mínima de HA hasta probarla. Cuando se distribuye mediante releases, publicar un tag por sí solo no constituye una release. [Requisitos generales y manifest](https://hacs.dev/docs/publish/start/).

## Secuencia de publicación

1. Integrar mediante PR la tarjeta y su editor, el adaptador de HA, las validaciones y las pruebas necesarias.
2. Ejecutar CI y compilar desde un commit identificado, con dependencias bloqueadas. Revisar el contenido del bundle y de cualquier asset: no debe incluir plano, bindings reales, direcciones internas, estados de la vivienda ni secretos.
3. Probar en HA las versiones que se declararán compatibles: carga del recurso, edición y guardado, recarga, permisos, errores, acciones, popups propios y actualización sin perder configuración.
4. Preparar un tag SemVer y una release en borrador con `homemanager.js`, notas de compatibilidad y evidencia de validación. Los nombres de archivos y repositorios no incorporan versiones.
5. Publicar únicamente tras la aprobación de publicación correspondiente y las comprobaciones anteriores. No presentar esta fundación como funcional ni adjuntar un JavaScript vacío para que HACS lo acepte.

La búsqueda exacta de archivos depende de la versión del gestor. El código HACS consultado prioriza un asset de release coincidente y admite también raíz o `dist`; por ello la estrategia utiliza un único asset con nombre fijo y comprueba la instalación real. [Implementación oficial de búsqueda](https://github.com/hacs/integration/blob/main/custom_components/hacs/repositories/plugin.py#L90).

El alta inicial puede hacerse como repositorio personalizado de categoría Dashboard. La inclusión en el catálogo predeterminado requiere un trámite aparte y no debe anunciarse como completada. [Repositorios personalizados](https://hacs.dev/docs/faq/custom_repositories/).

## Persistencia sin integración Python

La V1 utilizará un dashboard Lovelace de tipo `storage`. HomeManager ofrecerá su propio editor visual mediante `getConfigElement()`: plano, iconos, selector de entidades y scripts, estados y panel avanzado. El editor emitirá el documento de configuración completo con `config-changed`; el guardado definitivo lo realiza el editor de HA. Emitir ese evento desde una tarjeta normal no garantiza persistencia. [Contrato del editor de tarjetas](https://contributors.home-assistant.io/frontend/custom-ui/card-editor/).

El servidor exige administrador para `lovelace/config/save`. Los dashboards YAML no admiten este guardado. La API sustituye la configuración del dashboard y no ofrece una revisión de concurrencia en la petición consultada. V1 admite un editor a la vez; no promete guardado atómico frente a sesiones concurrentes. [Autorización en Core 2026.10.4](https://github.com/home-assistant/core/blob/2026.10.4/homeassistant/components/lovelace/websocket.py#L138), [almacenamiento nativo](https://github.com/home-assistant/core/blob/2026.10.4/homeassistant/components/lovelace/dashboard.py#L136).

El frontend reutiliza la sesión HA existente. El plano se importa en el editor, se valida y sanitiza, y se conserva como dato inline en la configuración autenticada. No requiere token GitHub ni consultar el repositorio privado durante el uso. Véanse los límites de acceso en [security.md](security.md).

## Si un backend resultara indispensable

No se implementa Python en esta fundación. Un requisito futuro de edición delegada sin administración, guardado con revisión atómica o almacenamiento que no pueda cubrir HA exigirá justificar un backend acotado y aprobar su acceso.

Una instalación HACS de categoría Dashboard no debe prometer que también instala Python. Las integraciones tienen estructura propia bajo `custom_components/<dominio>/`, con todos sus archivos operativos dentro de ese directorio. [Requisitos de integraciones](https://hacs.dev/docs/publish/integration/).

Si se aprueba ese cambio, habrá que diseñar y validar pasos separados: tarjeta por HACS y paquete de integración por un mecanismo independiente, o autorizar otra estrategia de repositorios. No se convertirá el repositorio privado de instancia en público para resolver el empaquetado.

## Referencia temporal

Revisión documental: 28 de octubre de 2026. La referencia de permisos y almacenamiento es Core 2026.10.4; esto no implica que HomeManager haya sido probado ni que esa sea su versión mínima compatible.
