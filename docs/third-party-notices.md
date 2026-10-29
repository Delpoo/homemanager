# Procedencia y licencias

La fundación se redactó desde cero; no se copió código de las implementaciones particulares anteriores. Los esquemas reproducen el contrato estructural pedido por el propietario y no incluyen inventarios ni planos reales.

Las dependencias de desarrollo exactas se registran en `package-lock.json`. Antes de publicar, revisar su archivo LICENSE y conservar los avisos correspondientes en el bundle si se distribuye código suyo. Las Actions de GitHub se usan para CI y deben permanecer fijadas a revisiones completas verificadas.

Revisión de paquetes instalados de la fundación, 28 de octubre de 2026: cada uno incluye su archivo LICENSE. Son herramientas de desarrollo y no se incorpora su código al bundle actual de contratos.

| Paquete | Versión | Licencia | Origen |
| --- | --- | --- | --- |
| ajv | 8.20.0 | MIT | [proyecto](https://github.com/ajv-validator/ajv) |
| ajv-formats | 3.0.1 | MIT | [proyecto](https://github.com/ajv-validator/ajv-formats) |
| fast-deep-equal | 3.1.3 | MIT | [proyecto](https://github.com/epoberezkin/fast-deep-equal) |
| fast-uri | 3.1.9 | BSD-3-Clause | [proyecto](https://github.com/fastify/fast-uri) |
| json-schema-traverse | 1.0.0 | MIT | [proyecto](https://github.com/epoberezkin/json-schema-traverse) |
| require-from-string | 2.0.2 | MIT | [proyecto](https://github.com/floatdrop/require-from-string) |

Los agentes registrarán aquí biblioteca, versión, licencia, URL de origen y archivos incorporados para cada dependencia de runtime, icono, fuente o recurso. No hay recursos de terceros de runtime incorporados en esta fundación. No extraer código o recursos de productos de domótica existentes sin verificar licencia.

Las fixtures visuales 0.7 usan un subconjunto de los trazados de `@mdi/js` 7.4.47
([MaterialDesign-JS](https://github.com/Templarian/MaterialDesign-JS/tree/v7.4.47)),
iconos Apache-2.0 y código MIT, sólo en `tests/browser/fixtures/ha-icon.js`.
El aviso original se conserva en `tests/browser/fixtures/MDI-LICENSE`.
El producto utiliza `ha-icon` de Home Assistant; este recurso de prueba no entra en el bundle.
