# Pruebas

| Capa | Comando | Qué cubre |
| --- | --- | --- |
| Contrato, límites públicos, tipos y unidades | `npm run check` | Esquemas V2 y migración V1, validador, modelo del editor, adaptador HA, comandos por capacidades, controles, agrupación, i18n completo y versión única (93 pruebas) |
| Navegador | `npm run test:browser` | Tarjeta, editor, paneles, almacenamiento Lovelace, modo integración y panel lateral con sesiones HA sintéticas; escritorio y móvil (incluye regresión de expansión SVG) |
| Integración Python | `python -m pip install -r requirements_test.txt` y `python -m pytest -q` | Backend con el arnés oficial de HA: permisos, revisión atómica concurrente, historial, persistencia, filtro de planos, flujo de configuración (incluye validación completa, permisos, cuotas, fallos de E/S y paquete reproducible). `requirements_test_latest.txt` usa la versión actual de HA |
| Extremo a extremo | Ver abajo | Producto completo en Chrome contra un Home Assistant real y desechable (12 comprobaciones, incluida la pestaña Controles RF). Activa la opción de carga global para probar la tarjeta en un dashboard |

La CI ejecuta las tres primeras capas y la integración en HA 2026.2.3 (mínima declarada) y 2026.10.4 (actual).

## Extremo a extremo contra Home Assistant real

**Nunca contra la instalación de la vivienda**: el script crea hogares y dashboards y acciona luces de prueba. Se rechaza cualquier URL que no sea local.

1. Entorno con Home Assistant (Python 3.13 para 2026.2, 3.14 para 2026.10): `pip install homeassistant==<versión> home-assistant-frontend==<versión del manifest de frontend>` más las dependencias de los componentes base que pida el log.
2. Carpeta de configuración nueva con `custom_components/homemanager` (tras `npm run build`) y un `configuration.yaml` mínimo: `http` en `127.0.0.1` y un puerto libre, `frontend`, `config`, `lovelace: {mode: storage}`, `onboarding`, `api`, y dos luces `template` (sintaxis moderna `template: - light:`) llamadas *E2E lamp* (con `set_level`) y *E2E spot*.
3. Arrancar `hass -c <carpeta>` y preparar la instancia: `python tests/e2e/prepare_local_ha.py <URL local> <carpeta>/TEST_CREDENTIALS.local.json`. Crea una cuenta de prueba con contraseña aleatoria, completa el onboarding, añade la integración por su flujo y pone la luz en el área *Salón*.
4. `HM_E2E_CREDENTIALS=<carpeta>/TEST_CREDENTIALS.local.json node tests/e2e/local-ha.e2e.mjs`. Las capturas quedan en `.work/e2e`.

Detalles útiles: el script renueva el token en cada ejecución. Detener HA de forma ordenada evita perder el almacén de autenticación. En HA 2026.10, con un puerto no predeterminado, aparece un diálogo de confirmación HTTP que el script acepta.

**Windows nativo** (sólo para desarrollo; HA no lo soporta oficialmente). Hace falta, en el entorno virtual y nunca en el repositorio:

- `lru-dict==1.4.1`;
- stubs de `fcntl`, `resource`, `turbojpeg`, `pymicro_vad` y `pyspeex_noise`;
- un plugin de pytest que use el bucle *selector* y relaje `pytest-socket`;
- un lanzador que omita la comprobación de plataforma y los manejadores de señales.

En Linux, WSL o un contenedor no hace falta nada de eso.

## Regresiones de seguridad

`tests/integration/test_security.py` cubre las entradas manipuladas que motivaron la auditoría, cuotas que incluyen hogares borrados y ausencia de cambios visibles al fallar la persistencia. `test_package.py` comprueba el ZIP final, denegación de archivos inesperados/sensibles, symlinks, reproducibilidad y las restricciones del flujo de release. `tests/panels/geometry.browser.spec.mjs` rechaza referencias SVG duplicadoras antes del layout. Ninguna de estas pruebas llama hardware.
