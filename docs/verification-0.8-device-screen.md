# HomeManager 0.8 · pantalla del dispositivo, Ahora y apariencia

Segunda entrega de 0.8, rama `chatgpt/0.8-device-screen`, creada desde `main` / `9c21ceb` después de la fusión de #21. Durante el trabajo el propietario publicó **0.8.0-beta.1** en #22; la rama se actualizó sobre `main` / `50ef831` y conserva esa versión heredada. Este PR no publica ni cambia la versión o el CHANGELOG.

## Resultado y aceptación

| Criterio de 0.8 | Evidencia |
| --- | --- |
| Un dispositivo de seis canales / 20 entidades es una fila en el selector; nombres legibles | #21 ya fusionado; mismo registro inventado de 15 dispositivos y 91 entidades |
| Sin `_` ni identificadores visibles fuera de Buscar cualquier entidad | La prueba recorre el texto visible del shell y todas sus raíces de sombra; incluye encabezado de actividad, controles, diagnóstico desplegado y nuevas lecturas |
| Diagnóstico/configuración/ocultas/desactivadas fuera del selector | Regresión de #21; la pantalla sólo incorpora diagnóstico en su sección plegada y respeta ocultas/desactivadas |
| Plano de 0.7 sin `deviceId` | Se consulta el registro de la entidad principal sin reescribir el vínculo; sus controles y acciones de paneles anteriores se conservan |
| Seis canales y aire con consigna/modos | Modelo puro y pruebas de navegador en ambos tamaños; las llamadas pasan por el adaptador existente |
| Ahora sin secciones vacías | Alertas, clima por espacio, activos y energía; filtro del riel y apagado rápido; pruebas en ambos tamaños |
| Apariencia solicitada por el propietario | Automático / Claro / Oscuro, persistencia local, teclado, almacenamiento denegado y paneles que conservan la elección |

El modelo `device-screen` devuelve nombres, antigüedad, salud, hasta tres valores destacados, todas las lecturas útiles, grupos por clase, canales, controles, acciones existentes, alertas, actividad y diagnóstico. Las lecturas adicionales restantes siguen accesibles aunque no entren entre los tres valores grandes. La pertenencia al registro se verifica en vivo; una entidad movida a otro dispositivo no aporta controles ni datos principales a la pantalla anterior. Una energía acumulada sin período declarado no se etiqueta como consumo de hoy: queda en sus lecturas, y Hoy muestra «—».

El modelo `now` sólo considera los dispositivos colocados. Agrupa clima por espacio, evita repetir un mismo total de energía y conserva la última lectura mientras espera una nueva después de un comando. **Enviado**, **en el aire**, **confirmado**, **No se pudo enviar** mantienen sus significados D14/D18. La aceptación de una llamada no confirma el efecto físico.

La pantalla ocupa la columna de Ahora a partir de 1100 px; una tarjeta angosta usa una hoja aunque esté dentro de una ventana grande. En teléfono la hoja tiene agarre táctil, cierre y Escape; el símbolo se encuadra sobre ella y se recupera la cámara al cerrarla. El E2E detectó el caso de una tarjeta Lovelace estrecha; una prueba de regresión protege el ancho real de la tarjeta.

Toda pieza visual nueva vive en `src/ui/`, usando los tokens y composiciones de §6/§8. El renderer no contiene estilos ni colores, y una prueba protege esa separación. La ficha, RF y ESPHome mantienen sus implementaciones existentes. El enlace a la página del dispositivo en HA sólo se dibuja para administradores.

**Apariencia:** en ⋮ → Apariencia, Automático sigue HA; sin un tema de HA, los tokens conservan el fallback del sistema. Claro/Oscuro son preferencias del navegador, aplicadas sólo a variables de HomeManager. No alteran el tema de HA ni el contrato de la casa. Si se deniega almacenamiento, la elección funciona para esta página. El selector de dispositivos y los paneles abiertos después usan la misma preferencia.

## Validación

| Comprobación | Resultado |
| --- | --- |
| `npm ci --ignore-scripts` | Aprobado, cero vulnerabilidades informadas al instalar |
| `npm run check` | 174 pruebas JS; tipos, esquemas y límite público |
| `npm run format:check` | Aprobado |
| `npm run test:browser` | 257 aprobadas, 3 omisiones táctiles previstas en escritorio |
| `python -m pytest -q`, HA 2026.2.3 / Python 3.13 | 186 aprobadas |
| `python -m pytest -q`, HA 2026.10.4 / Python 3.14 | 186 aprobadas |
| E2E HA 2026.2.3 desechable | 13 comprobaciones aprobadas, cero errores de HomeManager; cinco errores de páginas de HA separados |
| CI del head final | Se enlaza en el PR borrador |

Las pruebas Python locales usan el arnés Windows ignorado por Git descrito en testing.md; la CI Linux ejecuta los comandos estándar. El E2E sólo usa loopback, almacenamiento temporal y dispositivos inventados. No prueba ni acciona hardware de la vivienda.

## Capturas y diferencias con la maqueta

28 PNG completos de navegador a **1440×900** y **390×844** píxeles CSS: cada archivo se comprueba por sus dimensiones, fuente ficticia y SHA-256 en `public-assets.json`. Las capturas usan movimiento reducido para evitar cámaras y colores a medio cambiar. Se toman en contextos nuevos, sin datos de la instalación. La maqueta se abrió en navegador antes de implementar.

La referencia §8 tiene un medidor de escritorio y un aire de teléfono: ambos se muestran junto a las variantes funcionales. Los valores, nombres de canales y cantidades son los del registro sintético, no los números dibujados en la maqueta. El ancho de escritorio replica 300 px para Ahora y 420 px para el dispositivo; en móvil la hoja ocupa el ancho disponible y ofrece desplazamiento vertical.

Las diferencias funcionales son explícitas: cierre y agarre accesibles; botón de modo Apagado y encendido/apagado según las capacidades reales del aire; batería y corriente cuando existen en el registro; fecha dinámica del dato; acciones antiguas si están configuradas. No se inventan nombres de circuitos ni un consumo diario. Los campos nuevos de apariencia y los estados vacíos usan §6, que no contiene una pantalla específica de preferencias. El SVG ficticio conserva sus colores al cambiar el tema, como cualquier plano importado. El rediseño completo de la ficha y administración sigue siendo de 0.9.

### Ahora y plano

| Implementación | Maqueta |
| --- | --- |
| ![Plano / hoja cerrada 1440×900](evidence/0.8-device-screen/desktop-plan.png) | ![Referencia 1440×900](evidence/0.8-device-screen/desktop-reference-now.png) |
| ![Plano / hoja cerrada 390×844](evidence/0.8-device-screen/mobile-plan.png) | ![Referencia 390×844](evidence/0.8-device-screen/mobile-reference-now.png) |
| ![Ahora 1440×900](evidence/0.8-device-screen/desktop-now.png) | ![Referencia 1440×900](evidence/0.8-device-screen/desktop-reference-now.png) |
| ![Ahora 390×844](evidence/0.8-device-screen/mobile-now.png) | ![Referencia 390×844](evidence/0.8-device-screen/mobile-reference-now.png) |
| ![Ahora oscuro 1440×900](evidence/0.8-device-screen/desktop-now-dark.png) | ![Referencia 1440×900](evidence/0.8-device-screen/desktop-reference-now.png) |
| ![Ahora oscuro 390×844](evidence/0.8-device-screen/mobile-now-dark.png) | ![Referencia 390×844](evidence/0.8-device-screen/mobile-reference-now.png) |
| ![Espacio sin datos 1440×900](evidence/0.8-device-screen/desktop-empty.png) | ![Referencia 1440×900](evidence/0.8-device-screen/desktop-reference-now.png) |
| ![Espacio sin datos 390×844](evidence/0.8-device-screen/mobile-empty.png) | ![Referencia 390×844](evidence/0.8-device-screen/mobile-reference-now.png) |

### Pantalla del dispositivo

| Implementación | Maqueta |
| --- | --- |
| ![Medidor de seis canales 1440×900](evidence/0.8-device-screen/desktop-meter.png) | ![Referencia 1440×900](evidence/0.8-device-screen/desktop-reference-device.png) |
| ![Medidor de seis canales 390×844](evidence/0.8-device-screen/mobile-meter.png) | ![Referencia 390×844](evidence/0.8-device-screen/mobile-reference-device.png) |
| ![Aire con consigna y modos 1440×900](evidence/0.8-device-screen/desktop-climate.png) | ![Referencia 1440×900](evidence/0.8-device-screen/desktop-reference-device.png) |
| ![Aire con consigna y modos 390×844](evidence/0.8-device-screen/mobile-climate.png) | ![Referencia 390×844](evidence/0.8-device-screen/mobile-reference-device.png) |
| ![Sensor 1440×900](evidence/0.8-device-screen/desktop-sensor.png) | ![Referencia 1440×900](evidence/0.8-device-screen/desktop-reference-device.png) |
| ![Sensor 390×844](evidence/0.8-device-screen/mobile-sensor.png) | ![Referencia 390×844](evidence/0.8-device-screen/mobile-reference-device.png) |
| ![Infraestructura 1440×900](evidence/0.8-device-screen/desktop-infrastructure.png) | ![Referencia 1440×900](evidence/0.8-device-screen/desktop-reference-device.png) |
| ![Infraestructura 390×844](evidence/0.8-device-screen/mobile-infrastructure.png) | ![Referencia 390×844](evidence/0.8-device-screen/mobile-reference-device.png) |
| ![Alerta activa 1440×900](evidence/0.8-device-screen/desktop-alert.png) | ![Referencia 1440×900](evidence/0.8-device-screen/desktop-reference-device.png) |
| ![Alerta activa 390×844](evidence/0.8-device-screen/mobile-alert.png) | ![Referencia 390×844](evidence/0.8-device-screen/mobile-reference-device.png) |
| ![Medidor oscuro 1440×900](evidence/0.8-device-screen/desktop-meter-dark.png) | ![Referencia 1440×900](evidence/0.8-device-screen/desktop-reference-device.png) |
| ![Medidor oscuro 390×844](evidence/0.8-device-screen/mobile-meter-dark.png) | ![Referencia 390×844](evidence/0.8-device-screen/mobile-reference-device.png) |

### Apariencia

| Implementación | Maqueta |
| --- | --- |
| ![Menú de apariencia 1440×900](evidence/0.8-device-screen/desktop-appearance.png) | ![Referencia 1440×900](evidence/0.8-device-screen/desktop-reference-components.png) |
| ![Menú de apariencia 390×844](evidence/0.8-device-screen/mobile-appearance.png) | ![Referencia 390×844](evidence/0.8-device-screen/mobile-reference-components.png) |
