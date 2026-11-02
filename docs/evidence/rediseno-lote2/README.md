# Lote 2 — evidencia ficticia

40 imágenes de una ejecución del script `scripts/capture-redesign-lote2.mjs`: escritorio 1440×900 y teléfono 390×844, claro y oscuro. Ninguna conecta con una vivienda. Revisadas visualmente la ficha, las reglas oscuras, la hoja móvil y el editor de regla móvil; en las demás se comprobaron tamaño y ausencia de desplazamiento horizontal. Revisión de bytes en `docs/public-assets.json`.

| Superficie | Escritorio claro | Teléfono oscuro |
|---|---|---|
| Base y módulos | [ver](desktop-light-modules.png) | [ver](mobile-dark-modules.png) |
| Gestos | [ver](desktop-light-gestures.png) | [ver](mobile-dark-gestures.png) |
| Agregar módulo | [ver](desktop-light-add.png) | [ver](mobile-dark-add.png) |
| Color | [ver](desktop-light-color.png) | [ver](mobile-dark-color.png) |
| Iconos | [ver](desktop-light-icons.png) | [ver](mobile-dark-icons.png) |
| Reglas | [ver](desktop-light-rules.png) | [ver](mobile-dark-rules.png) |
| Nueva regla sin límites prefijados | [ver](desktop-light-rule-new.png) | [ver](mobile-dark-rule-new.png) |
| Mismo selector RF | [ver](desktop-light-rf-icons.png) | [ver](mobile-dark-rf-icons.png) |

Cada superficie tiene también escritorio oscuro y teléfono claro en esta carpeta. Referencias: reference-modules y reference-rules por combinación, tomadas de la maqueta del repositorio. La maqueta de origen es clara, incluso en las capturas etiquetadas dark; no se presenta como una maqueta oscura nueva.

**Diferencias con la maqueta:** ficha de 380 px existente; tamaño visible antes de opciones adicionales en la hoja compacta. Color y lista de módulos se despliegan para no ocupar toda la hoja. Se conserva el diseñador de controles actual hasta E09. Reglas usa Ajustes y su navegación existentes, selecciones explícitas y campos separados para límites inferior/superior: conserva condiciones anteriores con ambos valores. La lista de reglas tiene desplazamiento propio; los efectos se distribuyen en dos columnas en escritorio y una en teléfono. Iconos usa una grilla paginada y nombres simples, no el desplegable corto dibujado.

**Medida del selector:** hasta el siguiente cuadro: escritorio claro 13 ms, escritorio oscuro 13 ms, teléfono emulado claro/oscuro 14 ms. 96 opciones renderizadas por tanda, 7447 nombres; no es una promesa de rendimiento en cualquier equipo. Durante la inspección se corrigieron altura del dock, contraste oscuro y ancho de las filas; las imágenes de esta carpeta son las posteriores a esas correcciones.

Las capturas acreditan sesiones inventadas, no telefonía/lector/RF físicos ni una prueba completa con HA real. El E2E completo sigue previsto para el lote 4.
