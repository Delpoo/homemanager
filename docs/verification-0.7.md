# HomeManager 0.7 · verificación de la pista A

Implementación en el PR borrador #18, rama `chatgpt/0.7-shell`, desde `main` / `211c085`.
La versión sigue siendo `0.6.0-beta.1`: este PR no publica una versión ni modifica una instalación real.

## Revisión y commits

| Fase | Commit | Resultado |
| --- | --- | --- |
| 1 · Auditoría | `9ad3355` | Matriz incorporada directamente en la descripción del PR |
| 2 · Fundamentos | `4fac466` | Tokens, logo, modelo puro y contrato opcional; PR abierto y comunicado antes de cambiar la interfaz |
| 3 · Shell | `f20f418` | Menú, riel y capas; responsabilidades de la tarjeta separadas |
| 4 · Plano | `bae2484` | Dibujo de SymbolSpec y máscara con geometría SVG real |
| 5 · Eventos | `a54944f` | Alertas, actividad y evidencia independiente |
| 7 · Punto 10 añadido | `e9b476e` | Importación y espacios; modelo y pruebas comunicados antes de construir su interfaz |
| 6 · Verificación final | Último commit del PR | Pruebas, compatibilidad, capturas y este informe |

La fase añadida se ejecutó antes de la verificación final. `home-manager-card.ts` queda en 509 líneas, frente a 1687 en la base. El modelo no importa otras capas ni usa DOM; una prueba protege ambos límites.

## Comprobaciones locales

| Comprobación | Resultado |
| --- | --- |
| `npm ci --ignore-scripts` | Dependencias fijadas instaladas; versión y lock sin cambios |
| `npm run check` | 150 pruebas aprobadas, tipos y tres esquemas compilados, límite público aprobado |
| `npm run format:check` | Aprobado |
| `npm run test:browser` | 226 aprobadas y 2 omisiones previstas de gestos táctiles en escritorio; ambos proyectos |
| `python -m pytest -q` · HA 2026.2.3 / Python 3.13 | 163 aprobadas |
| `python -m pytest -q` · HA 2026.10.4 / Python 3.14 | 163 aprobadas |
| E2E con HA 2026.2.3 desechable | 13 comprobaciones aprobadas, sin errores del bundle HomeManager |

Python y el E2E local se ejecutaron con las adaptaciones de Windows descritas en `testing.md`, en entornos de prueba aislados. Pytest usó un plugin local ignorado por Git para el bucle selector y los sockets internos. La CI Linux ejecuta los comandos estándar en ambas versiones de HA. El HA desechable omitió la instalación automática de dependencias; emitió cuatro errores de páginas de HA ajenos a HomeManager, que el E2E registra separadamente. No hubo errores del bundle bajo prueba.

La suite comprueba también rechazos de servicios, TTL, eco RF sin confirmación, feedback medido y verificado posterior al comando, pérdida de conexión, permisos, guardado con revisión, borradores conservados y compatibilidad V1/0.6. El RF físico y la instalación del propietario no se probaron ni se modificaron.

## Punto 10: importación y espacios

`planImportReport` recibe las zonas calculadas por `roomsAt`; no hace hit-testing en el modelo. `mergeRoom` clona la configuración y sólo cambia asignaciones y la lista de espacios, conservando IDs, posiciones y bindings.

Las pruebas cubren tres espacios huérfanos, sugerencias unánimes, espacios vacíos, dispositivos repartidos, ambigüedad, fuera de zona, zonas nuevas, reparación del plano ya guardado, cambio de espacio fijo y operaciones del riel en ambos tamaños. Aplicar emite un solo cambio de borrador; Deshacer restaura el documento completo. Un plano sin conflictos se importa directamente. Un cambio de viewBox mantiene la elección visible de migración y la copia previa existentes, y muestra las posiciones resultantes antes de aplicarlas.

La revisión conserva espacios sin zona sólo por una opción visible. Quitar sólo se propone para un huérfano vacío; desde el riel, quitar un espacio ocupado exige elegir destino o dejar sus dispositivos sin espacio. La posición de un dispositivo fijo sigue bloqueada mientras su espacio se puede editar.

## Comparación visual

Todas las imágenes muestran una casa inventada, adaptada de `vision-mockup.html`, y entidades sintéticas. No contienen datos de la vivienda. Las capturas tienen exactamente **1440×900** y **390×844** píxeles CSS; una prueba comprueba la cabecera PNG. Los hashes revisados están en `public-assets.json`; cualquier imagen diferente requiere nueva revisión.

| Escenario | Escritorio | Móvil | Comparación con la maqueta |
| --- | --- | --- | --- |
| Plano | [1440×900](evidence/0.7/desktop-plan.png) | [390×844](evidence/0.7/mobile-plan.png) | Misma paleta, logo, rail y capas con nombre. El plano ocupa el espacio disponible; Ahora pertenece a 0.8 |
| Espacio elegido | [1440×900](evidence/0.7/desktop-room.png) | [390×844](evidence/0.7/mobile-room.png) | Contorno en L y máscara real, además de atenuación exterior; la maqueta general no contiene un estado seleccionado equivalente |
| Alerta | [1440×900](evidence/0.7/desktop-alert.png) | [390×844](evidence/0.7/mobile-alert.png) | Sensor rojo con 1, insignia del espacio y píldora; sin columna Ahora ni notificaciones móviles |
| Actividad tras un toque | [1440×900](evidence/0.7/desktop-activity.png) | [390×844](evidence/0.7/mobile-activity.png) | Texto Enviado y nota 0.6 junto al símbolo; la prueba funcional añade en el aire sobre la misma fila y comprueba errores |
| Menú | [1440×900](evidence/0.7/desktop-menu.png) | [390×844](evidence/0.7/mobile-menu.png) | Administración oculta en el uso diario. La captura es de tarjeta; Hogares/Almacenamiento/RF se añaden sólo en la aplicación |
| Revisar cambios | [1440×900](evidence/0.7/desktop-review.png) | [390×844](evidence/0.7/mobile-review.png) | Paso nuevo pedido por el propietario, con la misma paleta; lista desplazable y acciones siempre accesibles |
| Maqueta de referencia | [1440×900](evidence/0.7/desktop-reference.png) | [390×844](evidence/0.7/mobile-reference.png) | Referencia original abierta y capturada en navegador |

Diferencias de alcance: no se dibujan la columna/hoja Ahora, el inspector 0.9 ni el instalador ESPHome. En móvil se mantienen las agrupaciones táctiles reales, frente a los símbolos superpuestos de la maqueta; al encuadrar se separan. Se usan iconos MDI finales en lugar de los dibujos lineales provisionales de la referencia. El panel lateral de HA conserva su icono MDI registrado; el logo SVG propio está dentro del shell.

La vista previa ficticia se abre con `npm run dev` y la fixture `tests/browser/fixtures/shell.html`. Para regenerar las capturas públicas, ejecutar el test `tests/card/shell.browser.spec.mjs` con `HM_CAPTURE_VISUALS=1`, revisar las imágenes y actualizar sus hashes. En CI se guardan en el directorio de resultados de Playwright y no sobrescriben las imágenes revisadas.

## Límites conservados

Sin Browser Mod; sin cambios en `esphome/**` o `custom_components/homemanager/rf*.py`; sin versión ni CHANGELOG nuevos; sin merge, release ni instalación real. Un servicio aceptado o un eco RF nunca se convierte en estado físico confirmado.
