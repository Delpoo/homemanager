# Plan 0.13 · Rediseño con maquetas

**Origen:** prueba de `v0.12.0-beta.1` por el propietario, 2026-11-05. Las tareas del plan 0.12 estaban hechas, pero la app se ve amateur: mucho texto, botones con frases, pantallas completas sin vista previa, funciones repetidas en varios lugares.

**Maqueta:** [`maqueta-0.13/index.html`](maqueta-0.13/index.html) (se abre en el navegador; datos inventados). Arriba se elige cada pantalla y «Notas de diseño» dice qué cambia y qué hay que decidir.

**Estado:** maqueta lista para revisión. **No se programa nada de 0.13 hasta que el propietario apruebe la maqueta** (por pantalla o completa).

## Reglas de diseño (obligatorias en cada pantalla)

1. **Símbolos, no palabras.** Toda acción es un icono conocido (papelera, ×, lápiz, ↺, ★, ↑↓, unir). La explicación va en una ayuda al pasar el mouse. Esas ayudas se apagan desde Ayuda.
2. **Cero textos aclaratorios.** Si algo necesita explicación larga, va en Ayuda o en un «?». Formatos: «SVG / PNG / JPG».
3. **Panel al costado, nunca pantalla completa**, con **vista previa en vivo** sobre el plano: tamaño, color, forma, vista inicial y Ahora se ven mientras se cambian.
4. **Una sola puerta por función.** Nada duplicado ni secciones de una sola función.
5. **Jerarquía clara:** Casa (selector arriba) → Editar (todo lo que cambia el plano) → Ajustes (alertas, automatizaciones, controles, mantenimiento, ayuda).
6. **Campos alineados y pocas capas.** Nada escondido tres niveles abajo; interruptores e iconos en vez de listas desplegables raras.
7. **Nada parece deshabilitado si se puede usar** (contraste de etiquetas y textos de campos).
8. **No quitar opciones «por el bien del usuario»** (ejemplo: el rojo no se reserva para alertas).

## Cómo se trabaja

1. **Maqueta primero.** Cada pantalla tiene su maqueta HTML; el propietario la usa y la aprueba o la corrige.
2. **Implementación igual a la maqueta.** Mismos iconos, orden, espacios y textos. Si algo no se puede hacer igual, se avisa antes, no después.
3. **Prueba visual obligatoria.**
   - Un tester abre la app real en Chrome y la maqueta con los mismos datos inventados. Lo hace en PC (1440×900) y teléfono (390×844), en claro y oscuro.
   - Saca capturas, las compara lado a lado y lista cada diferencia.
   - Las capturas y la lista van en el PR.
   - Base: [`maqueta-0.13/capturas.cjs`](maqueta-0.13/capturas.cjs), que ya recorre la maqueta, prueba las interacciones y avisa errores.
4. Pruebas de código y CI como siempre (`npm run check`, Playwright, Home Assistant desechable).
5. Un PR por lote, sin fusionar. El propietario prueba una beta al final de cada grupo de lotes que él elija.

## Nueva organización: antes → después

| Hoy (0.12) | En 0.13 |
|---|---|
| Ajustes › Hogares | Selector de casa arriba a la izquierda: cambiar, crear, duplicar, renombrar, borrar |
| Ajustes › Apariencia (claro/oscuro) | Botón ☀/🌙 en la barra principal |
| Ajustes › Apariencia (capas, vínculo, cuadrícula) | Editar › Tamaño y vista |
| Ajustes › Tamaño y vista inicial | Editar › Tamaño y vista, con curva, zoom de prueba y marco de la vista inicial |
| Ajustes › Plano y espacios + Alternativas del plano | Editar › Plano: imágenes claro/oscuro con ★ principal, espacios y herramientas de dibujo |
| Ajustes › Conectar con Home Assistant | En Editar › Plano: «Traer áreas de Home Assistant» y «Crear esta área en Home Assistant» por espacio |
| «Agregar espacio sin dibujarlo», «Revisar espacios contra el plano» | Se eliminan |
| Ajustes › Panel Ahora | Editar › Ahora: se edita en el mismo panel, con bloques, galería y ↺ |
| Ajustes › Reglas | Ajustes › **Alertas**, con armado en forma de frase y guía paso a paso |
| — | Ajustes › **Automatizaciones** (nuevo) |
| Ajustes › Controles RF | Ajustes › Controles RF (lista con iconos) |
| Ajustes › Estado de la casa + Avanzado › Referencias pendientes | Ajustes › Estado de la casa, con filtros |
| Ajustes › Almacenamiento + Copias | Ajustes › Datos y copias |
| Avanzado › Acciones lógicas | Pasos «Hacer» de Automatizaciones (decisión pendiente) |
| Avanzado › Paneles avanzados | Diseñador de controles (decisión pendiente) |
| ⚙ dentro de la barra de edición | Se quita: Ajustes sólo fuera de la edición |
| Filtros: controles, energía, sensores, infraestructura… | Dos: Dispositivos e Infraestructura |
| Ficha: «Capa: auto», «Origen del estado» | Interruptor «Infraestructura»; el estado sale del dispositivo vinculado |
| Ficha: tamaño Small/Medium/Large | Sólo %, con número y vista en vivo |

## Lotes

Cada lote cierra con la prueba visual contra la maqueta.

| Lote | Qué incluye |
|---|---|
| **0 · Aprobación** | El propietario revisa la maqueta y contesta las decisiones de abajo. |
| **1 · Base** | <ul><li>Colores con buen contraste.</li><li>Botón-icono con ayuda al pasar el mouse, que se puede apagar.</li><li>Panel lateral único: Ajustes deja de ser pantalla completa.</li><li>Barra principal: casa, ☀/🌙, ✎, ⛶, ⚙.</li><li>Barra de edición ámbar sin texto, con borde limpio.</li><li>Dos filtros y la nueva marca de vínculo.</li><li>Se quitan los 41 textos aclaratorios y los 98 botones con palabras pasan a iconos.</li><li>Arreglos de errores: importar reconoce el archivo por su contenido y acepta JSON / SVG / PNG / JPG (hoy da «Unexpected token <»); tocar otro símbolo cambia la ficha; Editar zonas sólo existe dentro de Editar.</li></ul> |
| **2 · Ficha del símbolo** | <ul><li>Icono y nombre editables en el título; espacio debajo.</li><li>Interruptor Infraestructura.</li><li>Tamaño y fondo en %; forma con dibujos.</li><li>Paletas de 10 colores, color libre y Mi paleta.</li><li>Módulos como subtítulos, «Agregar» sin repetir y botones del pie con iconos.</li></ul> |
| **3 · Plano y espacios** | <ul><li>Herramientas abajo, como Roborock: elegir, dibujar, agregar parte, dividir, unir, renombrar, borrar y deshacer.</li><li>Conjuntos de imágenes claro/oscuro con principal.</li><li>Traer y crear áreas de Home Assistant.</li><li>Contorno exterior al elegir un espacio.</li></ul> |
| **4 · Ahora** | <ul><li>Editor de bloques en el mismo panel: arrastrar, ancho, ajustes y quitar.</li><li>Galería de bloques, estilo lista, mosaico o gráfico.</li><li>Selector con buscador; ↺ vuelve al estándar.</li></ul> |
| **5 · Tamaño y vista** | <ul><li>Tamaño para la casa y para un espacio, que crece de forma lineal con el zoom.</li><li>Un % por símbolo encima de eso.</li><li>Curva y zoom de prueba.</li><li>Vista inicial con marco; marca de vínculo y cuadrícula.</li></ul> |
| **6 · Alertas** | <ul><li>Cambia el nombre.</li><li>Armado en frase, cómo se ve y dónde.</li><li>Vista previa con el valor actual.</li><li>Guía de cinco pasos.</li><li>Las alertas incluidas aparte.</li></ul> |
| **7 · Automatizaciones** | <ul><li>Lista con ★ «en la pantalla principal».</li><li>Pasos Cuando → Hacer → Comprobar → Si falla.</li><li>«Comprobar» usa el consumo de energía (coordinar con el módulo que el propietario arma con ChatGPT): reenvía hasta N veces y no reenvía si el medidor no responde.</li><li>«Si falla» dispara una alerta.</li></ul> |
| **8 · Mantenimiento y ayuda** | <ul><li>Estado de la casa con filtros.</li><li>Datos y copias.</li><li>Controles RF.</li><li>Ayuda con buscador, temas y estados.</li></ul> |
| **9 · Avanzado** | <ul><li>Llevar Acciones lógicas y Paneles avanzados a su nuevo lugar y quitar la sección.</li><li>Los datos guardados siguen siendo válidos: sólo cambia dónde se editan.</li></ul> |
| **Cierre** | <ul><li>Prueba de punta a punta en un Home Assistant desechable.</li><li>Capturas comparadas.</li><li>Beta para el propietario.</li></ul> |

## Decisiones pendientes del propietario

1. ¿La marca de «no vinculado» (aro punteado) se ve en la pantalla normal o sólo al editar?
2. ¿Cuántos atajos junto a un símbolo? (hoy 3)
3. Dividir un espacio: ¿con una línea dibujada a mano, como Roborock, o en mitades?
4. ¿Qué otros bloques querés en Ahora? (cámara, clima exterior, escenas…)
5. ¿«Alertas» está bien como nombre para lo que hoy es «Reglas»?
6. ¿Las automatizaciones viven en HomeManager o se crean como automatizaciones de Home Assistant?
7. Avanzado: ¿de acuerdo con llevar Acciones lógicas a Automatizaciones, Paneles avanzados al Diseñador y Referencias a Estado, y quitar la sección?

## Qué no cambia

- Los planos, símbolos, controles RF y reglas guardados siguen funcionando. Ningún cambio borra datos.
- Repositorio público: maquetas y pruebas sólo con datos inventados.
- Pruebas de punta a punta sólo en un Home Assistant desechable.
- Nada se fusiona ni se publica sin pedido del propietario.
