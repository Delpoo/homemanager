# Lo que pidió el propietario

Resumen de sus respuestas del 30 y 31/10/2026 al revisar las maquetas. Si algo no queda claro, preguntar en lugar de interpretar.

## Reglas generales

- **Elegir una opción es elegir cómo se usa, cómo se ve y cómo se organiza.** Todo lo que se corrigió o agregó en el camino se mantiene. Lo que esté en la imagen, falte y sume, se incorpora.
- **Antes de cambiar una pantalla** hay que validar y decir dónde están los conflictos, qué se recomienda dejar y qué no se sabe. No sacar funciones útiles por dejar un panel igual a la imagen.
- **No quiere funciones fijas.** La idea del programa es que sea personalizable. Rechaza un botón como «avisarme si la humedad baja de 20 %».
- **Sus ideas son la base, no el límite.** El trabajo del agente es investigar, ver cómo se relacionan con otras cosas y qué es lo mejor.

## Símbolos y módulos

- Todos los iconos del plano tienen una base, y se les agregan capacidades que luego se configuran. Lista abierta: reglas, alertas, indicadores, atajos, gestos, vínculo con un dispositivo, y las que aparezcan.
- **Las categorías salen** como algo que da beneficios distintos, y también las pantallas por categoría. Hoy ocupan espacio sin aportar.
- Símbolos y demás deben poder tener una base y ser editables en todo sentido.
- **Doble toque:** lo mencionó sólo como ejemplo y no sabe si conviene. Recomendación aceptada: no incluirlo por ahora (haría más lentos todos los toques), y dejar lugar para sumar otros gestos.
- **Cualquier símbolo puede agregar cualquier módulo.** Lo que no puede funcionar aparece desactivado, con el motivo.

## Ficha de edición

- Prefiere un **panel lateral bien ordenado** antes que uno flotante.
- Se queda con el concepto de la imagen, pero conserva lo decidido después: tipos de icono, selector de dispositivos, etc.

## Reglas

- Por ahora **sólo avisan e indican**. Más adelante se verá si se amplían a acciones o a un módulo de automatizaciones.
- Duda de que deban configurarse en cada botón. **Recomendación presentada:** una pantalla propia de Reglas; el símbolo muestra el resultado, y la ficha tiene un atajo. Reflejada en la maqueta de módulos.
- Una acción al tocar un símbolo y una automatización son cosas distintas. La primera ya existe; la segunda no se duplica ahora, porque Home Assistant ya las tiene.

## Respuestas por pantalla

| Pantalla | Respuesta | Qué pidió |
|---|---|---|
| Panel de control | Sin marcar, con comentario | Falta el símbolo de alerta arriba; mejores colores; poder personalizar el color de los símbolos. Lo más importante: **editar el panel lateral** y elegir qué aparece y cómo, como un pequeño dashboard |
| Dibujo del plano | Sin marcar, con comentario | Probar una versión distinta y que el usuario configure la vista, con un selector de fondo y de tipo de dibujo |
| Plano oscuro | Oscurecer | En oscuro, la imagen central tiene fondo blanco. Hace falta una imagen para modo oscuro y otra para claro, con fondo transparente, y que el fondo lo elija el usuario |
| Alternativas del plano | Definido el 31/10 | Las imágenes las prepara el usuario (SVG es mejor; también puede ser JPG u otra). La app debe permitir cargar modo claro y oscuro, y agregar más opciones, como un juego simplificado. Con ajuste de fondo, vista previa en miniatura y editable en el editor |
| Teléfono | Sin marcar, con comentario | La selección de tipo de iconos (entendida como las **capas**) debería ser **sólo símbolos, sin letras**, con un botón para minimizar y quizás una opción en configuración para ocultarla |
| Modo pared | Sí | — |
| Vista por espacio | Sin marcar, con comentario | Sí, pero el nombre no debe ser persistente. La imagen se ve más profesional. En el teléfono está bastante bien; **en la PC falla o no tiene sentido** |
| Vincular un dispositivo | Sí | — |
| Pantalla del dispositivo | Sí | — |
| Ajustes | Sí | Cree que «Versiones guardadas» se había sacado. Sale de la maqueta; el historial de Home Assistant se conserva como respaldo |
| Editor de espacios | Sí | — |
| Ventanas | Sin marcar, con comentario | Quiere una **pantalla en vez de ventana**, para trabajar más cómodo y organizar mejor. Más adelante cambiará distribución y contenido |
| Componentes | Sí | Aplica a la estética: iconos, símbolos, colores. El contenido variará según los módulos |
| Controles RF | Sí | **Falta la sección de aprendizaje** de las primeras imágenes. Comprobar que sea tan linda e intuitiva, con pasos, como la maqueta |
| Forma del control | Ninguna | Ver abajo |
| ESPHome | Sin marcar | «Revisemos luego» |
| Símbolos, pantallas sin dibujar y conceptos anteriores | Sin responder | No suponer una respuesta |

## Controles remotos

- El control que se ve al tocar, o con el gesto configurado, **debe ser exactamente el que se diseñó** al crear el control remoto.
- Por eso el editor debe ser **extremadamente bueno y flexible**, y permitir creatividad.
- No dar cosas fijas: **un diseñador de controles** con piezas sueltas para combinar, como deslizadores, botones cíclicos, botones normales y visualizadores de número. Ejemplo: `−`, indicador de velocidad y `+`. Pensar qué más pueden tener los controles digitales.
- **Símbolos:** nada de lista corta. Una lista enorme, quizás la de Home Assistant, con nombres simples: «lock» y no `mdi:lock`.

## Roles

- Claude no programa: guía, deja instrucciones en el repositorio y audita. ChatGPT u otro agente hace la implementación.
- Se trabaja por pasos para validar cada uno. Quien termine dice qué se hizo y qué falta, y lo deja escrito para que el siguiente lo sepa.

## Hallazgos de la auditoría del 30/10/2026

Vistos con la 0.9.0-beta.5; comprobar si siguen presentes.

- La mayoría de los dispositivos no están vinculados en la instalación auditada y muchos símbolos muestran «Unknown».
- La marca de salud aparece en casi todos los símbolos. Debe ser la excepción.
- El plano claro no cambia en tema oscuro.
- La ficha de edición flota y tapa el plano.
- Ajustes se vio como ventana y se apilaron hasta tres diálogos. La maqueta dice «nunca un diálogo sobre otro». El código ya lo arma como página, pero dentro de un `<dialog>`.
- Hay mezcla de idiomas y textos técnicos, como «Slider», «Toggle» o nombres de lecturas sin traducir.
- En un medidor con lecturas como «Power 1» no aparece la tabla de canales.
- Un sensor de fuga puede aparecer como «Presence» si no está vinculado.
- Los colores medidos en oscuro sí coinciden con el diseño.
