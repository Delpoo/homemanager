# E01 — evidencia visual

Datos enteramente ficticios de shell.html; Chrome de escritorio y emulación 390×844. Capturas nuevas de esta rama, no capturas históricas. Generación: HM_CAPTURE_E01=1 npm run test:editor-dock (sintaxis de variable según la terminal).

| Captura | Tamaño | Referencia | Comparación |
|---|---|---|---|
| desktop-light-ficha.png | 1440×900 | ../../rediseno/maqueta/1-ficha-ventilador.png | Ficha derecha de 380 px; encabezado, base, bloques plegados y pie. El símbolo queda centrado en el plano restante. |
| desktop-dark-ficha.png | 1440×900 | Mismo dibujo, paleta oscura de componentes §6 | Colores de los componentes compartidos, incluido el selector de iconos. |
| desktop-dark-sidebar.png | 1278×900; panel de 1012 px y barra simulada de 256 px | Dibujo 1 adaptado al ancho disponible | Plano y ficha no se superponen; navegación de espacios cambia a barra inferior por el ancho del panel. Sin scroll de página. |
| mobile-light-ficha.png | 390×844 | ../../rediseno/maqueta/4-telefono.png | Hoja inicial de 55% del espacio de trabajo; nombre, icono, espacio y tamaño se conservan. Plano visible arriba, pie fijo. |
| mobile-dark-ficha.png | 390×844 | Dibujo 4 y paleta oscura de §6 | Misma organización y funciones. |
| mobile-dark-ampliada.png | 390×844 | Dibujo 4 con la hoja ampliada | Hoja ampliable mediante botón o arrastre del tirador; cuerpo desplazable. |

Diferencias deliberadas con los dibujos: todavía aparecen categorías, controles actuales y avisos en lugar del modelo de módulos; corresponden a E05/E07. Color del símbolo y selector nuevo pertenecen a E08. Barra, capas y textos generales no se rediseñan en E01. Se conservan el nombre y el espacio como campos también en el teléfono. No se ocultan funciones para parecerse al dibujo. El plano oscuro mantiene su dibujo sintético claro; las alternativas claras/oscuras son E11.

Comprobación automática: anchura del dock, ausencia de superposición y scroll vertical de página, centro del símbolo, tamaño inicial de hoja, expansión con botón/arrastre, campos básicos sobre el pie y movimiento reducido. No comprueba teclado virtual ni lector de pantalla reales.
