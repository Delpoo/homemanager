# Seguridad y separación de datos

Estado: **controles implementados y probados con datos sintéticos; validación en HA real pendiente** (29 de octubre de 2026). Esta política documenta requisitos para los agentes de frontend y de conexión con Home Assistant. La presencia de documentación, esquemas o un escáner de patrones no certifica la seguridad del producto.

## Fronteras de confianza

| Ubicación | Contenido permitido | Restricción |
| --- | --- | --- |
| Repositorio público `homemanager` | Código y recursos genéricos, esquemas y pruebas sintéticas | Sin plano real, ubicaciones, bindings reales, URLs internas, credenciales ni estados domésticos |
| Repositorio privado `homemanager-instance` | Plano, ubicaciones y personalización exportable | Nunca cambiar a público; sin tokens, credenciales ni copias completas de HA |
| Home Assistant | Configuración activa, entidades/scripts, permisos y lógica RF | Mantener la autenticación y autorización existentes |
| Memoria del navegador | Estados actuales y estado de interacción | No tratarla como almacenamiento compartido persistente |

No se configura despliegue automático desde GitHub hacia HA ni se entregan credenciales HA a CI. Las acciones no deben conceder acceso al repositorio privado desde el público, copiar datos de instancia al bundle ni publicar capturas o logs domésticos.

## Autenticación y persistencia

La tarjeta recibe el contexto `hass` y utiliza la conexión de la sesión existente. No solicita tokens de larga duración, no crea un proxy y no añade un servicio con acceso amplio. La documentación oficial describe el objeto y sus capacidades. [Referencia de `hass`](https://contributors.home-assistant.io/frontend/reference/hass-object/).

La edición persistente V1 ocurre dentro del editor Lovelace y requiere administrador. La comprobación de UI mejora la experiencia, pero la autorización del guardado corresponde al servidor HA. La configuración no debe contener secretos. [Comprobación del servidor](https://github.com/home-assistant/core/blob/2026.10.4/homeassistant/components/lovelace/websocket.py#L138).

La configuración de un dashboard no es una bóveda aislada por usuario. Otras sesiones autenticadas pueden tener acceso a su configuración; ocultar el dashboard o un control no constituye una barrera de autorización. No se promete una ACL privada de HomeManager frente a los demás usuarios autenticados de HA.

El SVG privado se importará como dato inline sanitizado dentro de la configuración. Deben probarse el tamaño admitido, carga, recarga y restauración. No se colocará el plano real bajo `www` ni se presentará una ruta `/local/` como autenticada: HA advierte que esos archivos pueden leerse sin iniciar sesión si se conoce la URL. [HTTP: archivos estáticos](https://www.home-assistant.io/integrations/http/#hosting-files).

No se editarán directamente archivos internos de `.storage`. El repositorio privado conserva fuentes/exportaciones; no es la fuente de estados vivos ni requiere acceso desde el navegador.

## Requisitos de implementación: frontend

El agente de frontend debe implementar y demostrar:

- Validación completa del catálogo antes de renderizar o guardar: versión de esquema, IDs únicos, referencias a habitaciones, posiciones normalizadas, movilidad, bindings y paneles.
- Importación SVG mediante un parser y una política explícita de elementos y atributos admitidos. Bloquear scripts, eventos `on*`, `foreignObject`, referencias externas, protocolos ejecutables, CSS que cargue recursos y construcciones que permitan ejecutar código o extraer información. Aplicar límites de tamaño y complejidad; conservar y validar las zonas `room-${roomId}` de los espacios declarados por la instancia.
- Sanitización antes de insertar en el DOM y después de cualquier transformación que pueda alterar la seguridad. No confiar en que un SVG sea seguro por su extensión ni usar expresiones regulares como único sanitizador. Una biblioteca mantenida es una dependencia a revisar, no una garantía automática. [DOMPurify: efectos de modificar contenido saneado](https://github.com/cure53/DOMPurify#is-there-any-foot-gun-potential).
- Textos y etiquetas tratados como datos, sin HTML arbitrario, `eval`, funciones JavaScript suministradas por el usuario ni plantillas ejecutables.
- Popups avanzados propios, navegación por teclado, cierre accesible y separación entre edición y operación. Seleccionar o cambiar un binding no ejecuta una acción.
- Borrador, validación, Cancelar y guardado explícito. Gestionar fallos sin anunciar éxito prematuro ni descartar cambios silenciosamente. Una sola sesión de edición a la vez en V1; no se garantiza comparación y escritura atómica entre clientes.
- Dispositivos `fixed` bloqueados durante el arrastre normal. Una reubicación, si se implementa, será una operación administrativa explícita.

## Requisitos de implementación: adaptador HA

El agente de conexión debe implementar y demostrar:

- Bindings declarativos con dominios, acciones, destinos y parámetros admitidos. Validar tipos, rangos, entidad existente y compatibilidad antes de ejecutar. No admitir comandos de shell, código, endpoints arbitrarios ni destinos externos.
- Comprobación del resultado y errores HA. La UI nunca amplía los permisos concedidos por HA ni confunde un control oculto con una denegación del servidor.
- Lectura de estado mediante la conexión HA; distinguir valor observado, asumido, desconocido y no disponible. Un comando enviado no demuestra que el dispositivo físico haya cambiado.
- Sin códigos RF, transmisores, protocolo o decisiones RF en el navegador. C01 y la lógica RF siguen centralizados en HA; el frontend llama exclusivamente las entidades/scripts autorizados.
- Sin dependencia, adaptador, autodetección ni compatibilidad transitoria con Browser Mod. No modificar sus popups actuales ni desinstalar componentes existentes en HA.
- Logs mínimos y sin datos sensibles. Sin telemetría de vivienda ni envío de estados a servicios externos.

## Cadena de suministro y licencias

CI utilizará permisos mínimos, dependencias bloqueadas y acciones fijadas a revisiones verificadas. No ejecutar código de PR no confiables con secretos ni utilizar flujos privilegiados para construir contribuciones externas. Revisar también las acciones y sus dependencias. [Uso seguro de GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use).

Las releases deberán identificar su commit, revisar los assets y demostrar la exclusión de datos privados. Revisar licencias y avisos de dependencias, fuentes, iconos y código incorporado antes de distribuir. El propietario autorizó MIT para el código público el 28 de octubre de 2026; no se presupone permiso para relicenciar material de terceros ni las fuentes del plano privado.

El escáner de patrones de esta fundación es una ayuda limitada: no detecta todos los secretos, datos de vivienda, código malicioso o vías de ejecución SVG. No reemplaza revisión de cambios, sanitización, pruebas de seguridad ni inspección del artefacto final.

## Comprobaciones antes de declarar una versión funcional

Probar importaciones SVG hostiles, configuraciones inválidas, usuarios sin administración, fallos de guardado, sesión expirada, concurrencia, entidades ausentes/no disponibles, parámetros fuera de rango y errores de acciones. Comprobar recarga y otro dispositivo autenticado. Revisar el bundle final y todo asset publicado. La fundación no ejecuta ni da por superadas estas pruebas del producto.
