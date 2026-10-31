# Estado y continuación

Esta página no repite el estado: dice dónde está, para que no envejezca. Quien continúe el proyecto empieza acá.

## Dónde mirar

| Qué | Dónde |
| --- | --- |
| Qué se hizo y qué falta | [roadmap.md](roadmap.md) |
| Cómo tiene que ser el producto | [vision.md](vision.md) y su [maqueta](vision-mockup.html) |
| Por qué se decidió algo | [decisions.md](decisions.md) |
| Rediseño de las pantallas | `docs/rediseno/LEEME.md`, cuando esté en `main`; antes, las ramas `claude/guias-rediseno` y `chatgpt/rediseno-*` |
| El contrato de datos | [contract.md](contract.md) |
| Cómo se prueba | [testing.md](testing.md) |
| Cómo se publica | [versioning.md](versioning.md) y [hacs.md](hacs.md) |
| Instalar | [installation.md](installation.md) |
| Qué está publicado | `CHANGELOG.md`. `main` puede ir por delante de la última versión |

## Reglas que no cambian

- **Sin datos de una vivienda en este repositorio:** ni planos, ni entidades, ni nombres reales, tampoco en pruebas o ejemplos.
- **Home Assistant es la única fuente de un hogar** (D23). De afuera sólo se trae el dibujo.
- **Sin Browser Mod.** Los paneles avanzados son propios.
- **Un comando aceptado se muestra como *enviado*.** *Confirmado* exige una fuente independiente.
- **Con aprobación explícita del propietario:** fusionar en `main`, publicar una versión y cambiar su instalación real.

## Antes de dar algo por terminado

- `npm run check`, `npm run format:check` y `npm run test:browser` en verde. `pytest` corre en CI.
- Un módulo nuevo de la integración también va en la lista de `scripts/package_integration.py`.
- Lo que escribe en Home Assistant se prueba además en una instancia desechable, nunca en la de la vivienda: [testing.md](testing.md).
