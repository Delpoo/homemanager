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

### 2026-10-31 · ChatGPT · terminada para revisión, lote 1
- **Hecho:** capas sólo con iconos y nombre accesible al pasar, enfocar o mantener; minimizar y ocultar con preferencia local persistente, también en Ajustes → Plano y espacios. Alertas siempre visibles y rojas sólo cuando hay avisos. Los símbolos deliberadamente sin vínculo no llevan marca; un vínculo roto, estado desconocido, estado asumido o dispositivo no disponible conserva su indicación. Nombres de fábrica y estados comunes traducidos; actividad sin identificadores. Se mantiene el vocabulario Enviado / en el aire / confirmado / No se pudo enviar.
- **Decisiones:** conservar los cuatro símbolos de la maqueta (encendido, ojo, rayo y red), reconocibles por su forma y comprobables con nombre al mantener; un quinto símbolo de capas minimiza. Ocultar/minimizar se recuerda en este navegador, sin modificar el hogar ni introducir campos del contrato. Un símbolo sin entidad puede ser un control RF válido: no se trata como equipo averiado.
- **Aceptación:**

| Punto | Resultado | Cómo se comprobó |
|---|---|---|
| Capas sin letras, accesibles, minimizables y ocultables | Cumplido | `redesign-e03.browser.spec.mjs`: cuatro nombres, filtrado, mantener sin actuar, recarga y Ajustes |
| Cero alertas visibles y discretas | Cumplido | Caso cero → alerta → cero; estado visual neutro/rojo y pantalla vacía legible |
| Símbolo sano sin marca | Cumplido | Pruebas de modelo y navegador: luz, ventilador y mando sin vínculo |
| No disponible con marca | Cumplido | Cambio real del fixture a unavailable; vínculo eliminado conserva unknown |
| Recorrido español sin inglés ni identificadores fuera de avanzado | Cumplido para los recorridos ficticios | Clima, lecturas, actividad, controles y capas en ES/EN; pruebas de nombres. Los nombres propios elegidos por el usuario se conservan |
| Plano anterior carga igual | Cumplido | `npm run check`: migración V1, referencias previas, acciones y controles antiguos; sin nuevos campos persistentes |

- **Inventario asignado (13/13 conservadas):**

| Función | Dónde queda / comprobación |
|---|---|
| F-001 Identificar el hogar | Barra superior, sin cambio de nombre; prueba shell |
| F-002 Actividad reciente | Barra con los cuatro estados de envío; prueba shell de vocabulario |
| F-003 Historial | Botón de actividad → pantalla existente; prueba shell |
| F-004 Alertas | Píldora permanente con contador e icono; prueba E03 cero/aviso |
| F-005 Reloj | Barra de escritorio; render y prueba shell, sigue reducido en teléfono |
| F-013 Tema | Menú → Apariencia; componente y persistencia sin cambios |
| F-016 Teclado del menú | Delegación y devolución de foco conservadas; el nuevo ajuste entra en el recorrido |
| F-018 Detalle de actividad | Historial mantiene hora, dispositivo, acción y resultado; lectura de activity-view y prueba shell |
| F-020 Localizar alerta | Activa su capa, encuadra, selecciona y enfoca; prueba con sensores ocultos |
| F-021 Filtrar capas | Cuatro botones con aria-pressed; Infraestructura sigue apagada inicialmente |
| F-035 Elegir espacio/casa | Riel existente, probado en shell y recorrido de clima |
| F-040 Resultados de comandos | Enviado/en el aire/error conservados; eco RF no confirma; pruebas shell y modelo activity |
| F-128 Ignorar/cerrar aviso del plano | Acciones linked-ignore/linked-close del plano vinculado intactas; sin cambios en ese controlador |

- **Comprobaciones:** `npm run check` aprobado (251). Diez casos únicos de escritorio aprobados entre la suite E03 y shell, repitiendo sólo dos fallidos después de corregir una regla de posición heredada. La captura comparativa se realiza junto con E04 al cerrar el lote, en `docs/evidence/rediseno-lote1/`, conforme al modo continuo.
- **Falta:** auditoría independiente y dispositivo/lector físicos; sin pendiente funcional identificado. CI y evidencia final se registran en el reporte único del lote en PR #52.
- **Dónde quedó:** `chatgpt/rediseno-e02-pantallas`, PR #52; commit E03 del lote 1.
- **Para quien siga:** no esperar auditorías de E00–E02. E04 completa este mismo lote; no iniciar E05. No hubo cambios de contrato ni integración.
