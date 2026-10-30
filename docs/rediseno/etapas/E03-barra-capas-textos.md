# E03 · Barra de alertas, capas y textos

**Objetivo:** que el día a día se vea limpio y hable como una persona.
**Depende de:** E00.
**Maqueta:** [vision-mockup §1, §2 y §4](../../vision-mockup.html#s1). Comentarios: [decisiones](../decisiones-propietario.md#respuestas-por-pantalla).

## Alcance

**Capas** (Controles, Sensores, Energía, Infraestructura)
- Sólo símbolos, sin letras. El nombre aparece al pasar el cursor o al mantener, y siempre en `aria-label`.
- Un botón para minimizarlas, que recuerda su estado.
- Una opción en Ajustes para ocultarlas.
- Esto reemplaza lo que dice [vision.md §3](../../vision.md): el texto se había agregado porque los símbolos no se entendían. **Comprobar que los símbolos se entiendan** y, si hay duda, proponer mejores.

**Barra superior**
- Alertas siempre visibles: discretas con 0, en rojo con 1 o más. Recomendación del plan, sin objeción del propietario.

**Marca de salud**
- Debe ser la excepción, sólo con un problema real. Revisar por qué aparece en casi todos los símbolos y corregirlo sin ocultar problemas verdaderos.

**Textos**
- Sin mezcla de idiomas. Traducir lo que falte («Slider», «Toggle», «Estado actualizado», lecturas, «Device name», etc.).
- Sin nombres técnicos fuera de **Más opciones**.
- El idioma de los textos sigue el de la instalación. Revisar los archivos de `src/i18n/`.
- Una lectura de un fabricante se muestra con la regla de nombres de [vision-mockup §7](../../vision-mockup.html#s7).

## Fuera de alcance

Colores personalizables (E08), editar el panel lateral (E12) y el plano oscuro (E11).

## No se puede perder

Filtrado por capas, Infraestructura apagada por defecto, nombres accesibles, y la función de encuadrar el sensor al tocar la alerta.

## Dónde mirar

- `src/shell/layers.ts`, `src/shell/top-bar.ts`, `src/card/styles.ts`.
- `src/model/symbol-spec.ts` y `src/model/archetype.ts`: reglas de salud.
- `src/model/names.ts`, `src/i18n/`, `src/panels/controls.ts`, `src/shell/runtime-feed.ts`.

## Pasos

1. Reclamar la etapa.
2. **Parada de validación:** enviar una captura con los símbolos de capas, antes de seguir.
3. Capas, luego alertas, luego marca de salud, luego textos, con commits separados.
4. Recorrer la app en español y en inglés.
5. Pruebas, capturas y reporte.

## Aceptación

- [ ] Las capas se ven sin letras, tienen nombre accesible y se pueden minimizar y ocultar.
- [ ] Con 0 alertas la barra sigue visible y no llama la atención.
- [ ] Un símbolo sin problemas no lleva marca de salud.
- [ ] Un dispositivo no disponible sí lleva marca de salud.
- [ ] Un recorrido en español no muestra palabras en inglés ni `entity_id`, salvo en **Más opciones**.
- [ ] Un plano anterior carga igual.

## Registro
