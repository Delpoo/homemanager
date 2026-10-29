# Distribución mediante HACS

Estado: **candidata de seguridad 0.3.1, sin release publicada**. Ver [instalación](installation.md) y [preparación verificada de releases](versioning.md). HomeManager se distribuye como una integración que incluye tarjeta, editor y panel.

## Paquete público

- Categoría HACS: **Integración**. El repositorio público contiene `custom_components/homemanager/` en la raíz, como exige HACS. [Requisitos de integraciones](https://hacs.dev/docs/publish/integration/).
- `hacs.json` usa `zip_release: true` con `filename: homemanager.zip`: cada release adjunta ese asset, que contiene los archivos de la integración **y** el bundle `frontend/homemanager.js`. El bundle no se versiona en Git (`npm run build` lo genera). `hide_default_branch` impide instalar la rama de desarrollo.
- La integración sirve el bundle y el panel lo carga al abrirse. La carga en todas las páginas de HA es opcional; consultar las opciones y la modalidad de recurso manual en [instalación](installation.md).
- `homeassistant: 2026.2.0` en `hacs.json` es la mínima declarada; probadas 2026.2.3 y 2026.10.4. Antes de publicar, probar también la versión de la instalación real y ajustar la mínima si hace falta.
- Quien ya registró `homemanager.js` como recurso Lovelace puede quitarlo: si conviven, el segundo registro de los elementos se ignora sin errores.
- `homemanager-instance` sigue siendo privado y nunca se distribuye.

## Secuencia de publicación

Seguir [versioning.md](versioning.md): CI completa del tag existente en `main`, paquete inspeccionado y reproducible, checksum, atestación y release en borrador. La publicación es una acción manual posterior del propietario. No se publican datos ni artifacts de `homemanager-instance`.
