## Etapa E02 — Pantallas en lugar de ventanas — a medias

**En una frase:** la implementación, sus pruebas y 60 capturas están incorporadas al PR #52 para revisión; faltan 12 capturas y la validación integral.

### Qué se hizo

- Se creó `src/ui/task-screen.ts`, con barra superior, vuelta, retorno del foco, pantallas anteriores conservadas e inertes y caché de formularios durante la sesión.
- Ajustes pasa a página con Volver y Guardar. Vincular usa la ficha de 380 px en escritorio y una página en móvil, conservando búsqueda, lecturas y borrador.
- Se convirtieron edición de espacios, revisión de importación y movimientos, ayuda inicial de zonas, ayuda/actividad/avisos/listas, Almacenamiento, controles nativos, elemento RF y aprendizaje.
- Sólo las confirmaciones de sí/no usan `showModal`, con un guardián que impide dos confirmaciones simultáneas.
- Se corrigieron el botón Deshacer tras aplicar la vista previa, la conservación de codificaciones de controles no editados y el recorte del selector.
- Se adaptaron las pruebas al nuevo flujo, con un servidor opcional dentro de Playwright para entornos sin sockets disponibles, y se añadieron 22 casos E02.
- El propietario autorizó continuar y publicar con «continue i approve» y «continua autorizo todo». La parada de diseño/publicación está resuelta. El PR permanece borrador y apilado sobre E01 (#51).

### Qué falta

- Completar la suite general de navegador y resolver sus fallos; comprobar los recorridos de zonas, descartes y todas las funciones.
- Auditoría en vivo, teléfono físico, lector de pantalla y extremo a extremo con Home Assistant desechable.
- Transferir las 12 capturas enumeradas en [el índice de evidencia](../../evidence/rediseno-e02/README.md). El conjunto tampoco incluye capturas de Almacenamiento ni del lienzo/revisión de zonas.

### Cómo probarlo

1. En el editor, abrir Ajustes, escribir una acción sin aplicarla, cambiar de sección y volver: el texto debe permanecer sin guardar en HA.
2. Abrir Vincular, buscar un equipo, elegir lecturas y volver entre pasos: se conservan las elecciones. Probar escritorio y 390 × 844.
3. Editar un espacio o elemento RF, volver y reabrir; cancelar una edición debe preguntar antes de descartarla.
4. Revisar una importación, aplicar y deshacer una vez: debe recuperarse el borrador anterior completo.
5. Abrir ayuda, actividad, controles nativos, aprendizaje y Almacenamiento: las tareas usan pantallas con vuelta; las confirmaciones siguen siendo únicas.
6. En un entorno con Node 24 y dependencias disponibles: `npm ci --ignore-scripts`, `npm run check`, `npm run format:check`, `npx playwright test --config=playwright.tasks.config.mjs` y la suite general `npm run test:browser`.

### Funciones conservadas

Se mantienen los campos, acciones, lecturas y opciones avanzadas existentes, el borrador compartido y el deshacer de importación en un paso. [E02-conservacion.md](E02-conservacion.md) conserva las 68 filas del inventario marcadas E02 y sus fuentes de revisión; no certifica una ejecución completa por fila. No se añadió una pantalla nueva de «Versiones guardadas» ni se alteró el historial del backend.

### Verificación realizada

- `npm run check`: 250 pruebas de código/modelo, tipos, esquema y límite público aprobados en el entorno local antes de la desconexión.
- Formato aprobado antes de la desconexión. La ampliación final del registro de capturas y su lista de admisión se revisó después mediante GitHub; falta repetir el check completo sobre el SHA publicado.
- Navegador: 105 casos únicos aprobados y uno omitido. El grupo de 94 tuvo dos expectativas de Escape corregidas y verificadas de nuevo; la suite específica E01 añadió 11 aprobados y una omisión móvil explícita.
- Comprobación final del registro mediante el conector: imagen admitida, imagen alterada rechazada, nombre desconocido rechazado, falta de registro rechazada y captura histórica admitida. SHA-256 validado además con los vectores conocidos vacío/abc.
- Se generaron y revisaron 72 capturas originales; 60 están publicadas con SHA-256 calculado desde sus bytes recuperados.
- La suite general se interrumpió tras 64 aprobados y 8 fallos. Esos resultados no certifican la suite completa ni se suman al conteo de 105.
- Se reutilizó `node_modules` con el mismo `package-lock.json`; la instalación limpia sin red de paquetes falló por `ENOTCACHED`.

### Qué no se probó

`pytest`, E2E con HA, RF físico, lector de pantalla y teléfono real no ejecutados. No había HA instalado en el Python disponible. No se accedió a la vivienda. El conjunto específico no sustituye la auditoría de todos los flujos ni permite marcar todas las casillas de aceptación.

### Riesgos o dudas

La navegación y los borradores cambian en varios componentes; los recorridos no cubiertos pueden tener regresiones. Las capturas acreditan la representación visible, no persistencia, permisos o comportamiento físico. El entorno local se desconectó durante la transferencia: la publicación se completó con los objetos recuperados de GitHub, sin inventar los archivos restantes.

### Lo que necesito de vos

No hace falta otra autorización para subir esta entrega. La validación funcional/visual final sigue pendiente después de completar las comprobaciones.

### Siguiente etapa sugerida

Terminar y auditar E02. No iniciar E03 ni fusionar en main con esta entrega.

### Detalle técnico

- Rama: `chatgpt/rediseno-e02-pantallas`. PR: https://github.com/Delpoo/homemanager/pull/52.
- Código y pruebas recuperados hasta `738cce6ed389c1810e45b097fcbcb93e6004da5e`; el SHA definitivo figura en la cabecera del PR.
- Main incorporado hasta `b9cce00438121cedd57eb8807c3bbc8ed6e00359` (#54), incluida la limpieza #53. La última actualización sólo cambia documentación; se preservan los enlaces del rediseño.
- Capturas: `docs/evidence/rediseno-e02/`; pruebas E02: `tests/card/task-screens.browser.spec.mjs`; configuración: `playwright.tasks.config.mjs`.
- Sin cambios en contrato o backend, sin Browser Mod, sin release ni instalación.
