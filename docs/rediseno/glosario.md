# Glosario de HomeManager

Una sola palabra para cada cosa, en español y en inglés ([#78](https://github.com/Delpoo/homemanager/issues/78)). Armado en el plan 0.12 con la propuesta del issue y aplicado en toda la app. Si al probar la beta una palabra no se entiende, se cambia acá y en la app.

| Concepto | ES | EN | Dónde se ve |
|---|---|---|---|
| Lugar de la casa | Espacio | Space | Configuración › Plano y espacios, carril de espacios |
| Lugar en Home Assistant | Área de Home Assistant | Home Assistant area | Configuración › Conectar con Home Assistant |
| Lo que se abre al tocar o mantener | Control | Control | Ficha › Control, panel al costado |
| Mando físico aprendido | Control RF | RF remote | Configuración › Controles |
| Panel armado a mano | Panel avanzado | Advanced panel | Configuración › Avanzado |
| Panel de la derecha | Ahora | Now panel | Al costado del plano |
| Pantalla de opciones | Configuración | Settings | Botón ⚙ |
| Lecturas técnicas de un dispositivo | Datos técnicos | Technical details | Pantalla del dispositivo, Estado de la casa |
| Lo que no funciona | Estado de la casa | Home status | Configuración › Mantenimiento |
| Atajo junto al símbolo | Atajo | Shortcut | Ficha › Junto al símbolo |
| Imagen alternativa del plano | Alternativa del plano | Plan alternative | Configuración › Mi casa |
| Copia del borrador en el navegador | Copia de recuperación | Recovery copy | Al volver a editar |

## Palabras que no se ven fuera de Avanzado

`entity_id`, `mdi:`, «huella», «transparent». Una prueba (`tests/ha/plan012-language.test.mjs`) lo comprueba en cada texto visible; las excepciones listadas son mensajes de lugares avanzados (nombres de iconos, acciones lógicas, datos técnicos del plano).

## Cambios aplicados

- «Panel nativo» pasó a «Panel avanzado» (*Advanced panel*), como proponía el issue.
- Los nombres en inglés siguen el texto de la app en inglés que usa el propietario.
