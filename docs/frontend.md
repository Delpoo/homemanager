# HomeManager: tarjeta, editor y paneles nativos

La entrada pública es `dist/homemanager.js`. Registra `homemanager-card` y su editor `homemanager-editor`; la tarjeta se añade a Lovelace con `type: custom:homemanager-card`. La configuración sigue [el contrato V1](contract.md). El plano de una instancia se guarda como SVG inline en su configuración autenticada, separado del overlay de iconos. El bundle público no contiene un domicilio, inventario ni códigos de radio.

## Registro y primera configuración

Registrar el bundle como recurso JavaScript de tipo módulo. Si se instala mediante HACS, la ruta del recurso es `/hacsfiles/homemanager/homemanager.js`. La ubicación concreta depende de la instalación del integrador. El recurso contiene software público; no se debe poner un plano privado o configuración sensible en archivos servidos desde `/local`.

La forma de la tarjeta es:

```yaml
type: custom:homemanager-card
card_id: mapa-principal
dashboard_mode: storage
title: HomeManager
# dashboard_path: nombre-del-dashboard
configuration:
  schemaVersion: 2
  rooms:
    - id: living
      label: Espacio A
  architecture:
    format: svg
    content: >-
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 1000 700"><rect id="room-living" x="20" y="30" width="980" height="680" fill="#e5eadd"/></svg>
  catalog:
    schemaVersion: 2
    devices: []
  actions: {}
  panels: {}
  stateSources: {}
  commandTtlSeconds: 30
```

El rectángulo del ejemplo es geometría sintética. El integrador importa el SVG de su propia instancia mediante el editor; HomeManager no reconstruye la arquitectura. `card_id` debe ser único entre las tarjetas HomeManager del dashboard. `dashboard_path` identifica un dashboard distinto del principal cuando corresponde. No es una URL de HA ni contiene credenciales.

Los espacios y sus nombres se definen en `configuration.rooms` desde la sección **Espacios** del editor: detectar zonas `room-*` del plano, agregarlas con un clic, crear espacios propios, renombrar, reordenar o quitar (los dispositivos quedan sin espacio, nunca se eliminan). `room_labels` de la tarjeta sólo se usa para nombrar los espacios al migrar un documento V1. Las zonas ausentes se comunican; una habitación no adopta silenciosamente la geometría de otra.

`dashboard_path` es opcional: si falta, la tarjeta usa el dashboard de la URL actual cuando es un panel Lovelace y, en su defecto, el principal.

## Uso y edición

En modo normal, el botón principal del icono ejecuta la acción lógica vinculada. El botón de detalle abre un panel nativo local; abrirlo no ejecuta la acción principal. Pan, pinch, zoom, encuadre por habitación, capas y pantalla completa actúan sobre la vista actual. Los controles tienen nombre accesible y se pueden usar con teclado. En móvil, el mismo editor adapta su distribución al ancho disponible.

`Editar plano` abre un borrador. Desde el editor se puede agregar o eliminar iconos, cambiar etiqueta, icono, tipo, habitación y posición, y vincular entidades, acciones, fuentes de estado y paneles. `Aplicar dispositivo`, `Aplicar acción`, `Aplicar fuente` y `Aplicar panel` actualizan ese borrador. No envían llamadas físicas a HA. `Guardar cambios` se destaca al haber diferencias pendientes; `Descartar cambios`, `Deshacer` y `Rehacer` permiten revisar la edición.

Un dispositivo `fixed` requiere pulsar expresamente `Reubicar dispositivo fijo` antes de arrastrarlo. Su ID y asociaciones se conservan. Los dispositivos editables o portátiles se pueden arrastrar en edición. Cambiar `roomId`, etiqueta o coordenadas no cambia áreas HA, destinos de acciones, selección de transmisores, scripts o automatizaciones. El ID estable tampoco cambia. Si se sustituye la entidad asociada, hay que revisar por separado el destino de la acción lógica y su fuente de estado: HomeManager no retargetea silenciosamente esas referencias.

Las posiciones son fracciones entre 0 y 1 del viewBox SVG global, incluyendo su origen. Por ejemplo, con `viewBox="10 20 1000 700"`, `{x: 0.5, y: 0.5}` corresponde a `(510, 370)`. Cambiar el viewBox requiere revisar o migrar posiciones de forma explícita y conservar una copia previa.

## Guardado autenticado

Hay dos vías de edición:

- El editor de tarjeta Lovelace emite `config-changed` con el borrador. La persistencia ocurre cuando el administrador guarda explícitamente el dashboard en HA.
- La edición dentro de la tarjeta utiliza la sesión HA y la API Lovelace para guardar el campo `configuration` de la tarjeta identificada por `card_id`. Requiere un dashboard `storage`, cuenta administradora y una única tarjeta coincidente. Lee el dashboard actual, compara cambios observados, escribe y comprueba la lectura posterior.

Solo se anuncia guardado en HA después de esa comprobación. Un fallo de autorización, sesión, validación, escritura, lectura posterior o conflicto conserva el borrador. No hay sustitución silenciosa por `localStorage`; los dashboards YAML son de solo lectura para este guardado. La sesión HA decide la autorización real.

La API Lovelace escribe el documento completo y no ofrece un token de revisión CAS en este flujo. La doble lectura detecta conflictos observados, pero no vuelve atómica la operación. Usar un solo editor activo por dashboard; ante cambios remotos, conservar o exportar el borrador y reconciliarlo manualmente. HomeManager no sobrescribe ni reintenta automáticamente una escritura en conflicto.

## Acciones y paneles

Una acción guarda `domain`, `service`, `target.entity_id` y, opcionalmente, `data`. Los destinos son entidades explícitas; no se admiten `all`, áreas, dispositivos enteros o destinos ocultos en `data`. La selección de una entidad no amplía los permisos de la sesión HA. Antes de ejecutar se comprueban disponibilidad, servicio, capacidades y datos admitidos por la integración.

Los paneles son `device-controls` o `rf-fan`. Cada control referencia una acción lógica mediante `actionId`. Un panel RF solo acepta acciones `script.turn_on` dirigidas a scripts HA explícitos, existentes y con firma verificada. Si HA no proporciona una firma utilizable o la referencia sigue pendiente, el control se mantiene deshabilitado. La emisión y la lógica de radio permanecen en HA. Ningún panel interpreta capturas o códigos RF/IR en el navegador.

Todos los paneles se dibujan y cierran en el navegador actual. No existe dependencia, transporte, evento, fallback ni compatibilidad Browser Mod. Esto no modifica ni elimina configuraciones previas del HA del usuario.

## Estado y configuración son capas distintas

`configuration` contiene solamente catálogo, arquitectura, acciones, paneles, fuentes y TTL. Cada estado del catálogo persistido es exactamente `{"value":"unknown","confidence":"unknown"}`. Lecturas, comandos pendientes, timestamps, suscripciones, pan/zoom y sesión permanecen en memoria y nunca entran en Lovelace, exportaciones de configuración o el build.

Las fuentes se vinculan por ID de dispositivo mediante `stateSources`:

- `optimistic` produce una estimación.
- `transmitter` puede indicar actividad del transmisor; no confirma el equipo receptor.
- `measured` requiere además la verificación independiente de la integración y una lectura válida sin `assumed_state: true`. La etiqueta elegida en el editor no prueba por sí sola que una fuente mida el equipo.

`sent` significa que HA aceptó la solicitud, sin acreditar emisión, recepción o efecto físico. Después de un comando, la confirmación requiere feedback posterior a su emisión y distinto del baseline de lectura. Un acuse expira según `commandTtlSeconds` —30 segundos por defecto, entre 1 y 300— y vuelve a `unknown` si falta feedback válido. Al desconectar o reconectar se reconstruye el runtime desde la sesión actual; un estado anterior exportado no se toma como verdad.

Para una integración que ya haya verificado sus fuentes independientes, la tarjeta expone `setVerifiedFeedbackEntities(iterableDeEntityIds)`. Esa evidencia se conserva en memoria de la sesión y no se serializa ni se deduce del selector `measured`. `getConfiguration()` devuelve una copia del documento guardado; `getDraftConfiguration()` devuelve una copia del borrador. Ninguno incorpora el runtime. Son interfaces para integración y pruebas; no sustituyen la verificación de la instalación real.

## Importación, exportación y validación

La importación presenta un resumen antes de aplicar. Aplicarla modifica un borrador y nunca ejecuta acciones importadas. La exportación contiene la configuración V2, sin runtime ni credenciales. El SVG se sanitiza antes de persistir y antes de renderizar: se rechazan XML inválido, DTD/entidades, IDs duplicados, referencias externas y elementos ejecutables; se usa un perfil permitido de elementos, atributos y estilos vectoriales. El límite es 1 MiB UTF-8 para el SVG y 3 MiB para el documento. Si el viewBox cambia, el editor exige una copia y ofrece conservar cada dispositivo en el mismo punto del dibujo o en la misma proporción; informa además espacios sin zona y zonas nuevas.

Antes de publicar o instalar, ejecutar los controles de contrato, pruebas y build del repositorio. Las pruebas de navegador usan únicamente geometría, entidades y una sesión HA sintéticas; su almacenamiento local simula el servidor de pruebas. No son una conexión con HA real ni una validación física de hardware. La instalación y verificación en HA real corresponden al integrador.

## Evolución 0.7 en revisión

La pista A incorpora shell, arquetipos, alertas, actividad e importación con revisión de conflictos. Ver [roadmap](roadmap.md) y [verificación con capturas](verification-0.7.md). El PR sigue en borrador; la versión publicada no cambia.


### Pantalla del dispositivo, Ahora y apariencia (0.8, en revisión)

Los sensores, medidores, equipos e infraestructura abren una pantalla en el lugar de Ahora. Los actuadores conservan su toque D18 y los mandos su panel anterior. La pantalla reúne lecturas útiles, hasta tres valores destacados, canales de energía, controles disponibles, alertas y actividad/diagnóstico plegados. Los enlaces a la página del dispositivo en HA sólo aparecen para administradores.

Ahora se filtra por el espacio elegido y omite secciones vacías. El apagado rápido pasa por el mismo adaptador; se muestra **Enviado**, y la última lectura permanece hasta que HA aporte otra. Un total acumulado no se presenta como consumo de hoy si su nombre no declara ese período.

En **⋮ → Apariencia**, **Automático** sigue el tema de Home Assistant; **Claro** y **Oscuro** lo reemplazan para HomeManager. La elección se conserva en este navegador, también al abrir el selector y otros paneles, sin guardar nada en el plano ni cambiar el tema general de HA. Si el navegador deniega el almacenamiento, la elección dura esta página.
