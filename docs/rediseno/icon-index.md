# Investigación E08: selector y colores

Consulta 2026-11-02, fuentes primarias.

| Home Assistant | Frontend fijado | Índice MDI |
|---|---|---|
| [2026.2.3](https://github.com/home-assistant/core/blob/2026.2.3/homeassistant/components/frontend/manifest.json) | 20260128.6 | @mdi/js y @mdi/svg 7.4.47 |
| [2026.10.4](https://github.com/home-assistant/core/blob/2026.10.4/homeassistant/components/frontend/manifest.json) | 20260930.5 | @mdi/js y @mdi/svg 7.4.47 |

Comprobados los package.json de [frontend mínimo](https://github.com/home-assistant/frontend/blob/20260128.6/package.json) y [actual](https://github.com/home-assistant/frontend/blob/20260930.5/package.json), y sus componentes [ha-icon-picker mínimo](https://github.com/home-assistant/frontend/blob/20260128.6/src/components/ha-icon-picker.ts) y [actual](https://github.com/home-assistant/frontend/blob/20260930.5/src/components/ha-icon-picker.ts). Ambos importan el índice generado internamente y muestran el identificador con prefijo en cada fila. El componente puede registrarse al cargar otros editores, pero no ofrece una API pública para extraer esa lista ni cumple los nombres simples de este producto. No se accede a miembros privados ni se depende de que otro editor lo haya cargado.

**Elección:** selector propio compartido, índice de nombres de MDI 7.4.47 y ha-icon para dibujar. No se incluyen geometrías ni fuentes. Los 7447 nombres coinciden exactamente con los SVG del [repositorio de @mdi/svg, instantánea 9e04201](https://github.com/Templarian/MaterialDesign-SVG/tree/9e04201d4557e729822fb57f62a316c3dea1d4a8/svg), cuyo [paquete declara 7.4.47](https://github.com/Templarian/MaterialDesign-SVG/blob/9e04201d4557e729822fb57f62a316c3dea1d4a8/package.json). Se contrastó también el árbol MaterialDesign 2424e748: lista idéntica, sin truncar. [Licencias de Pictogrammers](https://github.com/Templarian/MaterialDesign/blob/2424e748e0cc63ab7b9c095a099b9fe239b737c0/LICENSE): datos de la colección de Material Design Icons; autor Austin Andrews y colaboradores. Los iconos se sirven mediante Home Assistant, no se redistribuyen sus SVG.

Índice TypeScript: 120803 bytes; gzip 27322 bytes. Bundle medido durante el cierre: aproximadamente 779 kB / 229 kB gzip. El selector dibuja 96 resultados por tanda, sugeridos primero, búsqueda por nombres en inglés y sinónimos españoles; permite escribir identificadores válidos y conservar los que no estén en la lista. Apertura observada en capturas finales: ver README de evidencia. La prueba mide hasta el siguiente cuadro, no garantiza ese tiempo en cualquier equipo.

**Colores:** se conservan los predeterminados existentes. Paleta verde, cálido, azul, violeta, turquesa y neutro, más color libre. El rojo no está en la paleta sugerida, sigue reservado por defecto a alertas. El valor elegido se guarda sin alterar; el tono dibujado se ajusta para contraste mínimo 4.5:1 en las superficies clara/oscura del producto. Las insignias de alerta y salud son independientes.

La investigación verifica código de las dos versiones; no equivale a probar manualmente un Home Assistant real. La matriz de integración de CI y las pruebas ficticias del navegador se registran aparte.
