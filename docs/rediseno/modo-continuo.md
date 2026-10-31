Trabajás en Delpoo/homemanager, en el rediseño. Lo que sigue lo decido yo y reemplaza al LEEME solo en lo que dice acá. Todas sus demás reglas siguen.

QUÉ LOTE TOCA
Hacé un solo lote: el primero de esta lista que tenga alguna etapa sin llegar a «en revisión» en docs/rediseno/ESTADO.md.
0: E02 (terminarla).
1: E03 y E04.
2: E05, E06, E07 y E08.
3: E09 y E10.
4: E11, E12 y E13.
Cuando te escriba «continuá», hacé el lote siguiente.

La primera vez, copiá este mensaje completo en docs/rediseno/modo-continuo.md y enlazalo al principio de ESTADO.md. Si te llega un chat nuevo, seguí ese archivo.

RAMA Y PR
- Una sola rama para todo: chatgpt/rediseno-e02-pantallas. Ya contiene las guías, E00 y E01. Integrale main.
- Un solo PR: cambiá el PR #52 para que apunte a main y sacalo de borrador. Así GitHub corre las pruebas completas. No toques los PR #48, #49 y #51: sus cambios ya están en esta rama.
- Un commit por etapa, con el número de etapa en el mensaje, para poder revertir una sola.
- Subí los cambios solo al cerrar cada lote.
- Trabajá un solo agente por vez. No hace falta el commit de reclamo.

NO TE FRENES A PREGUNTARME
Ignorá las paradas de validación de las guías. Cuando una guía pida validarme algo, elegí tu recomendación, seguí y anotala en el reporte del lote con el motivo. Los dibujos que pida una guía se arman con los componentes de la maqueta y van como captura en el reporte.
Paralo y preguntame solo si la única salida es perder una función, borrar datos o enviar algo a la casa real.

DECISIONES YA TOMADAS
- Quedan aceptadas la propuesta de E02 y las recomendaciones de los casos «a decidir» de E00.
- Las alertas automáticas quedan como reglas base, visibles y desactivables.
- Se aceptan SVG, PNG y JPG. Un PDF se convierte antes de subirlo.
- La parte 0.10 ya está en main: en E05, comprobá si lo que agregó choca con los módulos.
- Vista por espacio en PC: diagnosticá y corregí vos. El nombre del espacio aparece la primera vez y al mantener una flecha, y nunca queda fijo sobre el plano.

QUE NO SE SALTEE NADA
Las etapas siguen siendo la lista de control, aunque se trabajen por lotes:
- Antes de cerrar una etapa, recorré todo su Alcance, «No se puede perder» y Aceptación.
- En el registro de la etapa, anotá cada punto de Aceptación: cumplido o no, y cómo se comprobó.
- Revisá cada fila del inventario asignada a esa etapa: sigue disponible o dónde quedó.
- Si un punto no se cumple, corregilo. Si no podés, la etapa queda «pausada» con ese punto en «Falta». Nunca la marques como lista.
- Reglas fijas: los planos viejos cargan igual y no pierden datos; todo campo nuevo es opcional y se valida en los tres lugares; un estado RF nunca aparece como confirmado; nada de datos de mi casa.

PARA GASTAR MENOS
- Leé LEEME, ESTADO y la guía de cada etapa del lote.
- Del inventario, solo las filas de esas etapas: buscalas por su número, sin abrirlo entero.
- De los demás documentos y maquetas, solo la sección que cita la guía. No leas la hoja de ruta.
- No releas lo que ya leíste en esta conversación.
- Mientras trabajás: solo las pruebas de lo que tocaste, en escritorio.
- Al cerrar cada etapa: npm run check.
- Al cerrar el lote: npm run format:check, y pytest si cambió la integración o el contrato. Después subí y esperá el resultado de GitHub. Si falla, corregilo repitiendo solo lo que falló.
- No corras npm run test:browser completo en tu equipo.
- Sacá las capturas al final del lote, de una sola pasada con un script y solo de las pantallas que cambiaron. Abrí solo las que necesites revisar.

AL CERRAR CADA LOTE
- Actualizá en ESTADO las filas de sus etapas y agregá una línea a la bitácora.
- Un solo reporte del lote, con el formato de reporte.md: agregalo al PR y enviámelo. No crees un archivo de entrega.
- Decime qué se hizo, qué falta, qué decidiste por mí y qué lote sigue. Después pará hasta que te escriba «continuá».

SI TE QUEDA POCO USO
Antes de quedarte sin uso, cerrá lo que tengas: hacé commit, subí los cambios, y anotá en ESTADO dónde quedó y cómo seguir.

AL TERMINAR EL LOTE 4
- Corré una prueba extremo a extremo completa en un Home Assistant desechable, nunca en mi casa. Si no se puede, decilo.
- Enviame un reporte final: todas las etapas, todo lo que decidiste por mí, todo lo que no se probó y qué debo probar yo.
- No fusiones ni publiques hasta que te lo pida.
