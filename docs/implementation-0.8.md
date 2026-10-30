# HomeManager 0.8 · dispositivo primero

Base del primer PR: `main` / `f2da56c`, versión publicada `0.7.0-beta.1`.
Fuentes: reglas y etapas 0.8/0.9 de [roadmap](roadmap.md), [visión §6](vision.md#6-dispositivos-de-home-assistant-completos) y maqueta abierta en navegador, secciones 6, 7 y 8.

## Entrega y límites

Primer PR borrador `chatgpt/0.8-picker`: nombres de persona, catálogo puro, selector de dos pasos, contrato opcional y primera lectura adicional del medidor en el plano. Las piezas visuales nuevas viven en `src/ui/`, como la maqueta §6; la ficha conserva su estructura y controles y sólo cambia su selector. Datos y registros ficticios.

Segundo PR `chatgpt/0.8-device-screen`: se crea desde `main` sólo después de que el propietario fusione el primero. Incluye pantalla del dispositivo y Ahora, según §8 y la aceptación restante. No se adelanta sobre una rama apilada ni se fusiona por el usuario.

`0.8.0-beta.1` y `0.8.0-beta.2` identifican las entregas previstas; esta implementación no cambia la versión ni el CHANGELOG ni publica. Sin instalación real, RF, ESPHome o rediseño de la ficha.

## Pasos

1. Modelo, contrato y pruebas. Nombres sin identificadores, exclusiones incondicionales, sugerencias de lectura y validación en vivo de pertenencia. Comprobar con un registro de al menos 15 dispositivos y 80 entidades. Avisar al propietario antes de construir el selector.
2. Componentes de la maqueta §6 en `src/ui/`, selector §7 y conexión con la ficha existente. Conservar nombres elegidos y vínculos antiguos; el vínculo se guarda en el borrador como hasta ahora.
3. Pruebas de navegador, texto visible sin `_` ni identificadores fuera de Buscar cualquier entidad, regresiones V1/0.6/0.7, claro/oscuro y accesibilidad. Capturas a 1440×900 y 390×844 junto a su referencia y explicación de diferencias.
4. Pruebas completas, dos versiones HA, E2E local y CI. Primer PR queda en borrador. El segundo depende de su fusión por el propietario.

## Continuación

Pasos 1–3 completos en el PR borrador #21. El punto de revisión intermedia se comunicó en `4f65d5d`, antes de construir el selector: 159 pruebas JS y 125 Python de contrato/modelo. El selector usa los componentes de `src/ui/`; el registro ficticio tiene 15 dispositivos y 91 entidades. La verificación local incluye 163 pruebas JS, 238 de navegador (dos omisiones táctiles previstas en escritorio), 186 Python en cada versión HA y 13 comprobaciones E2E. Capturas, comparación y diferencias en [verification-0.8-picker.md](verification-0.8-picker.md).

Paso 4 del primer PR completo: el propietario fusionó #21. El segundo PR parte de `main` / `9c21ceb`, en `chatgpt/0.8-device-screen`, sin apilar ramas. Se releyeron reglas/0.8/0.9 y visión §6, y se abrió otra vez la maqueta §8 en el navegador antes de escribir código.

## Segunda entrega y ampliación autorizada

1. Modelo puro `device-screen` y `now`, pruebas con el mismo registro ficticio de 15 dispositivos / 91 entidades. Capacidad de control compartida con el panel anterior; se conservan sus acciones, IDs y comprobaciones.
2. Componentes §6/§8 en `src/ui/`: encabezado, valores, canales, controles y hoja. Columna Ahora sólo con secciones que tienen datos, filtro de espacio y apagado rápido. Ancho real de la tarjeta para escritorio, tableta o móvil; la tarjeta Lovelace angosta no pierde el plano.
3. Pedido adicional del propietario: menú **Apariencia → Automático / Claro / Oscuro**. Automático sigue HA (con fallback del sistema en vistas sin tema de HA); la preferencia manual se guarda sólo en este navegador y alcanza todas las superficies de HomeManager. Sin campos nuevos de configuración de la casa. Si se deniega almacenamiento, funciona durante esta página.
4. Regresiones completas, texto visible sin identificadores, gestos táctiles, capturas comparadas, dos versiones HA, E2E temporal y CI del head final. El PR permanece en borrador; sin merge, publicación, versión ni CHANGELOG. Detalles y evidencia en [verification-0.8-device-screen.md](verification-0.8-device-screen.md).

La pertenencia a un dispositivo depende del registro vivo de HA: se informa si cambia sin invalidar ni reescribir un plano guardado. El contrato valida formato, listas de hasta tres, unicidad y que las adicionales no repitan la principal; la pertenencia no se adivina en validadores sin registro.


Modelo y compatibilidad revisables en `7c69429`; interfaz y apariencia en `b17f4f3`. La verificación final incluye todas las lecturas útiles (también las de otros dominios como selectores, sin habilitar comandos secundarios no vinculados), las firmas de las 28 capturas y la comparación con la maqueta. Las seis condiciones de aceptación de 0.8 están cubiertas entre #21 y esta segunda entrega; la versión publicada permanece intacta.

La base se actualizó a `main` / `50ef831` al publicarse #22 por el propietario durante este trabajo. Se hereda `0.8.0-beta.1`; este PR no modifica los archivos de versión ni el CHANGELOG.
