# HomeManager 0.8 · dispositivo primero

Base leída de nuevo: `main` / `f2da56c`, versión publicada `0.7.0-beta.1`.
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

Pasos 1–3 completos en el PR borrador #21. El punto de revisión intermedia se comunicó en `4f65d5d`, antes de construir el selector: 159 pruebas JS y 125 Python de contrato/modelo. El selector usa los componentes de `src/ui/`; el registro ficticio tiene 15 dispositivos y 91 entidades. La verificación local incluye 162 pruebas JS, 238 de navegador (dos omisiones táctiles previstas en escritorio), 186 Python en cada versión HA y 13 comprobaciones E2E. Capturas, comparación y diferencias en [verification-0.8-picker.md](verification-0.8-picker.md).

Paso 4: comprobar la CI del head final y conservar el PR en borrador. El segundo PR espera la fusión del primero en `main` por el propietario; su pantalla del dispositivo y Ahora siguen pendientes. No se cambian versiones ni se publica.

La pertenencia a un dispositivo depende del registro vivo de HA: se informa si cambia sin invalidar ni reescribir un plano guardado. El contrato valida formato, listas de hasta tres, unicidad y que las adicionales no repitan la principal; la pertenencia no se adivina en validadores sin registro.
