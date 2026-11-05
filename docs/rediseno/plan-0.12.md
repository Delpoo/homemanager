# Plan de acción hacia v0.12.0-beta.1

Copia del issue [#99](https://github.com/Delpoo/homemanager/issues/99). **Actualizado el 2026-11-05:** por pedido del propietario, lo implementa Claude; las ramas se llaman `claude/plan012-lote-a` … `claude/plan012-lote-f` en lugar de `chatgpt/…`. Lo demás no cambia.

Plan para hacer **todos** los cambios observados hasta el 2026-11-04 y llegar a una sola beta de prueba, sugerida como **v0.12.0-beta.1**. Lo armó Claude como auditor; lo implementa otro agente. Reúne:
- la auditoría técnica (#69);
- la auditoría de experiencia de uso (#79);
- las observaciones anteriores del propietario, comprobadas una por una contra `main` 97d4ad4.

**Este plan manda sobre el orden de #69 y #79.**

## Decisiones del propietario (2026-11-04)
| # | Decisión | Tarea |
|---|---|---|
| 1 | Control completo en la PC: al costado, en el lugar de *Ahora* | #59 |
| 2 | Reglas base agrupadas por tipo, con límites editables y sólo donde aplican | #60 |
| 3 | ~~Modo pared sin pantalla completa~~ (reemplazada por la 6) | — |
| 4 | Editar Ahora arranca copiando lo actual, con un bloque Clima | #62 |
| 5 | Botón ⚙ con una sola pantalla de Configuración agrupada y botón ✎ para editar. Sin menú ⋮ | #70 |
| 6 | Una sola opción, pantalla completa. Se quita el modo pared | #61 |
| 7 | Diagnóstico pasa a ser Estado de la casa | #74 |
| 8 | Almacenamiento en Mantenimiento: desglose, limpieza y aviso al 80 % | #75 |
| 9 | Modo edición en **ámbar** con franja. El rojo queda para alertas | #90 |
| 10 | Copia del borrador **en este navegador**, recuperar al volver y preguntar antes de cerrar | #89 |
| 11 | Símbolos: **dos tamaños** (casa y espacio) que crecen con el zoom entre un mínimo y un máximo. Cada símbolo puede cambiarlo | #94 |
| 12 | **Validación todo junto al final**: el agente hace los lotes de corrido y el propietario prueba una sola beta | este plan |

## Observaciones anteriores del propietario: cómo están hoy
| # | Observación | Hoy | Tarea |
|---|---|---|---|
| 1 | El símbolo debe poder accionarse y configurarse con gestos | **En parte:** existe el módulo Gestos, con pocas acciones | #97 |
| 2 | Botón de edición visible en la pantalla normal y de otro color | Pendiente: está dentro del menú ⋮ | #70, #90 |
| 3 | Marca en cada símbolo de vinculado o no | Pendiente | #95 |
| 4 | No perder la edición al irse a otra página | Pendiente: no hay copia ni aviso | #89 |
| 5 | Lecturas: para qué sirven y por qué hasta 4 | Pendiente: 1 principal + 3 adicionales, sin explicación | #91 |
| 6 | Más opciones de símbolo: iconos, colores, tamaño y transparencia | **En parte:** iconos y color resueltos (E08). Tamaño sigue en 3 y no hay transparencia | #93 |
| 7 | Cancelar la creación de un dispositivo | Pendiente, **comprobado**: sin nombre no deja cancelar, y con nombre lo crea igual | #88 |
| 8 | Formato de los valores en el plano: decimales, letra, colores, rangos, cortes | Pendiente: corta a 9 caracteres y nada se configura | #92 |
| 9 | Puntos de infraestructura feos y visibles con la capa apagada | Pendiente: hay que averiguar la causa en el plano real | #93 |
| 10 | Principal o secundaria no tiene sentido, y faltan lecturas en una de las listas | Pendiente, **comprobado** en el código | #91 |
| 11 | Tamaño según el zoom y la vista, y una vista inicial | Pendiente | #94 |
| 12 | El modo edición no se distingue | Pendiente | #90 |
| 13 | Atajos a los programas de limpieza del robot | Pendiente: los programas salen como «lecturas» | #96 |
| 14 | Abrir apps desde el teléfono | Pendiente | #97 |
| 15 | El punto chico de infraestructura como opción, no como única forma | Pendiente | #93 |
| 16 | Editar la sección *Ahora* | **En parte:** existe, pero es pobre | #62 |
| 17 | Fusionar los rectángulos de un espacio | **En parte:** las formas de la app se fusionan; las zonas del SVG muestran sus divisiones | #98 |
| 18 | En edición, mover siempre, mantener pulsado en el teléfono, cuadrícula | **En parte:** en la PC se arrastra; en el teléfono se mueve al primer toque y no hay cuadrícula | #90 |
| 19 | Sacar el límite de lecturas | Pendiente | #91 |
| 20 | Varias apps o integraciones en un mismo gesto (TV) | Pendiente | #97 |

## Cómo se trabaja
Para este plan, reemplaza a `docs/rediseno/modo-continuo.md`. Todas las demás reglas de `docs/rediseno/LEEME.md` siguen.

**Antes de empezar**
- En el primer commit, copiar este plan en `docs/rediseno/plan-0.12.md` y enlazarlo al principio de `docs/rediseno/ESTADO.md`. Si llega un chat nuevo, seguir ese archivo.

**Ramas, commits y PR**
- **Ramas encadenadas.** `chatgpt/plan012-lote-a` sale de `main`. Cada lote siguiente sale de la rama del lote anterior.
- **Un PR por lote.** Su base es la rama del lote anterior; la del lote A es `main`. Así cada PR muestra sólo su lote. **Ninguno se fusiona.**
- **Un commit por tarea**, con el número de su issue en el mensaje, para poder revertir una sola.
- Al terminar cada tarea, comentar en su issue qué se hizo, qué no y cómo se comprobó. No cerrar issues.
- Donde un issue diga «rama nueva desde `main` y PR hacia `main`», manda lo que dice este plan.

**No frenar a preguntar (decisión 12)**
- Cuando una tarea pida una propuesta o una aprobación del propietario (#73, #77, #78), elegir la recomendación, anotarla en el PR del lote y en el issue, y seguir.
- Parar sólo si la única salida es perder una función, borrar datos o enviar algo a la casa real.

**Reglas fijas**
- Los planos viejos cargan igual y no pierden datos.
- Todo campo nuevo es opcional y se valida en los tres lugares.
- Un estado RF nunca aparece como confirmado.
- Sólo datos ficticios.
- No se pierde ninguna fila del inventario sin una decisión del propietario.

**Para gastar menos**
- Mientras se trabaja: sólo las pruebas de lo que se tocó, en escritorio.
- Al cerrar cada tarea: `npm run check`.
- Al cerrar el lote:
  - `npm run format:check`, y `pytest` si cambió la integración;
  - subir los cambios y esperar el resultado de GitHub;
  - sacar las capturas de una sola pasada.

**Al cerrar cada lote**
- Actualizar las filas de `ESTADO.md` y su bitácora.
- Escribir el reporte del lote en su PR, con el formato de `reporte.md`.
- **Seguir con el lote siguiente sin esperar.**

**Permisos**
- La autorización de subida del 2026-11-02 cubre subir commits, abrir los PR y correr CI.
- No autoriza fusionar, publicar ni enviar nada a la casa.
- Los PR automáticos de Dependabot (#80 a #87) no son parte del plan: no se tocan ni se fusionan durante el plan. Algunos son saltos grandes (por ejemplo, TypeScript 5 a 7) y conviene revisarlos después de la beta.

## Lotes, en orden
| Lote | Tema | Tareas, en este orden |
|---|---|---|
| A | Arreglos que molestan hoy | #88 cancelar la creación · #89 no perder la edición · #64 texto del aprendizaje guiado · #63 imágenes que se acumulan |
| B | Navegación y modo edición | #70 Configuración ⚙ · #61 pantalla completa · #90 modo edición visible y cuadrícula · #59 control al costado · #76 alertas e historial al costado |
| C | El símbolo | #71 ficha como las maquetas · #91 lecturas · #92 formato de los valores · #93 tamaño, transparencia y forma · #94 tamaño con el zoom y vista inicial · #95 marca de vinculado |
| D | Acciones y controles | #96 atajos a programas · #97 abrir apps y enlaces · #73 diseñador único |
| E | Configuración | #62 Editar Ahora · #60 reglas base · #72 alternativas del plano · #98 contorno de espacios del SVG · #75 almacenamiento · #74 estado de la casa · #65 flechas de la vista por espacio · #66 monitores anchos |
| F | Ayuda, textos y cierre | #77 ayuda · #78 lenguaje, junto con #67 · #68 limpieza y `ESTADO.md` |

## Cierre, después del lote F
1. **PR de integración** de la rama del lote F hacia `main`, como se hizo en #58, con «Closes #…» para cada tarea terminada.
2. **Prueba extremo a extremo** en un Home Assistant **desechable**, nunca en la casa:
   - instalar v0.11.0-beta.2 con un plano ficticio;
   - actualizar a esta versión y comprobar que todo carga y se guarda;
   - volver atrás a la versión anterior.

   Si no se puede, decirlo.
3. **Reporte final:**
   - cada tarea, hecha o no;
   - todo lo que se decidió en nombre del propietario;
   - lo que no se probó;
   - la lista de abajo, completada.
4. **Parar.** Fusionar a `main` y publicar v0.12.0-beta.1 sólo cuando el propietario lo pida.

## Lo que el propietario prueba con la beta
- [ ] ⚙ Configuración: encontrar cada cosa sin el menú ⋮, y volver desde RF.
- [ ] Modo edición: se nota en ámbar. Mover un símbolo con la cuadrícula, en la PC y en el teléfono manteniendo pulsado.
- [ ] Crear un dispositivo y cancelarlo, con y sin nombre: no queda nada.
- [ ] Editar, irse a otra página de Home Assistant, volver y recuperar los cambios.
- [ ] Robot aspirador: vincularlo, ver sus lecturas, poner dos programas como atajos y lanzarlos.
- [ ] Valores en el plano: decimales, etiquetas, colores por rango, sin cortes.
- [ ] Tamaño de los símbolos en la casa entera y en la vista por espacio. Guardar una vista inicial y volver con ⌂.
- [ ] Marca de vinculado en modo edición.
- [ ] Un gesto que abra la app del robot en el teléfono, y la alternativa cuando no se puede.
- [ ] Pantalla completa en la tablet o el teléfono.
- [ ] Estado de la casa y Almacenamiento con datos reales.
- [ ] Alternativas del plano, clara y oscura, con imágenes propias (nunca en el repositorio).
- [ ] Contorno de un espacio formado por varios rectángulos.
- [ ] Leer las ayudas y el glosario: ¿se entiende sin saber de Home Assistant?
- [ ] Lo que quedó de #69: control RF real con aprendizaje guiado, y Reglas.

## Mensaje para iniciar al agente
```text
Trabajás en Delpoo/homemanager. Seguí al pie de la letra el plan del issue #99: empezá por el lote A y hacé todos los lotes de corrido, sin esperar mi validación entre lotes. Antes de cada tarea, leé docs/rediseno/LEEME.md y el issue completo. No fusiones a main, no publiques nada y no toques mi casa. Al terminar el lote F, hacé el cierre del plan, mandame el reporte final y pará.
```


