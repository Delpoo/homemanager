# Distribución mediante HACS

Estado (29 de octubre de 2026): **empaquetado preparado y probado en una instancia local desechable de HA 2026.2.3; sin releases publicadas.** Tras la decisión [D11](decisions.md#d11--almacenamiento-del-plano-y-la-configuración), HomeManager se distribuye como **una sola integración** que incluye la tarjeta, el editor y el panel.

## Paquete público

- Categoría HACS: **Integración**. El repositorio público contiene `custom_components/homemanager/` en la raíz, como exige HACS. [Requisitos de integraciones](https://hacs.dev/docs/publish/integration/).
- `hacs.json` usa `zip_release: true` con `filename: homemanager.zip`: cada release adjunta ese asset, que contiene los archivos de la integración **y** el bundle `frontend/homemanager.js`. El bundle no se versiona en Git (`npm run build` lo genera). `hide_default_branch` impide instalar la rama de desarrollo.
- La integración sirve el bundle en `/homemanager_files/homemanager.js?v=<hash>` y lo añade a todas las páginas del frontend (`add_extra_js_url`): **no hace falta registrar un recurso Lovelace**. El parámetro de versión invalida la caché al actualizar.
- `homeassistant: 2026.2.0` en `hacs.json` es la mínima declarada; la única versión probada es 2026.2.3. Antes de publicar, probar también la versión de la instalación real y ajustar la mínima si hace falta.
- Quien ya registró `homemanager.js` como recurso Lovelace puede quitarlo: si conviven, el segundo registro de los elementos se ignora sin errores.
- `homemanager-instance` sigue siendo privado y nunca se distribuye.

## Secuencia de publicación

1. Integrar por PR la tarjeta, el editor, el adaptador HA y la integración, con CI (`foundation` e `integration`) en verde.
2. Desde un commit identificado: `npm ci --ignore-scripts`, `npm run check`, `npm run test:browser`, `python -m pytest -q` y `npm run package` (genera `.work/release/homemanager.zip`). Revisar el contenido del zip: código, traducciones y bundle; ningún plano, binding real, URL interna ni secreto.
3. Probar en las versiones de HA que se declararán compatibles: instalación por HACS como repositorio personalizado, alta de la integración, panel, tarjeta en un dashboard, migración de una tarjeta inline, guardado con conflicto, usuario no administrador, reinicio y actualización de versión sin pérdida de hogares. `tests/e2e/local-ha.e2e.mjs` automatiza la mayor parte contra una instancia de prueba.
4. Crear un tag SemVer y una release **en borrador** con `homemanager.zip`, su checksum y notas de compatibilidad.
5. Publicar sólo con la aprobación del propietario. No anunciar el alta en el catálogo predeterminado de HACS hasta completar ese trámite aparte. [Repositorios personalizados](https://hacs.dev/docs/faq/custom_repositories/).
