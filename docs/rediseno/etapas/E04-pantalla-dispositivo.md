# E04 · Pantalla del dispositivo

**Objetivo:** tocar un dispositivo muestra lo esencial, sus lecturas en orden y lo técnico plegado, como en la maqueta aprobada.
**Depende de:** E00.
**Maqueta:** [vision-mockup §8](../../vision-mockup.html#s8). Respuesta del propietario: **Sí**.

## Alcance

- Encabezado con icono, nombre, espacio, salud y hora de la última lectura.
- Lecturas principales en tarjetas: Ahora, Hoy, Tensión.
- **Tabla de canales de un medidor** con Canal, barra, Ahora y Hoy. Hoy falla con lecturas tipo «Power 1»: ampliar la detección, con pruebas, sin depender de un fabricante.
- Equipo en el teléfono: control principal, modos y lecturas en una hoja, como en la maqueta.
- Actividad y Diagnóstico plegados.
- Pie con **Abrir en Home Assistant**, sólo para administradores, y **Editar**.
- En escritorio, ocupa el lugar de *Ahora* sin tapar el plano.

## Fuera de alcance

La ventana de controles al mantener pulsado (E09) y los indicadores configurables (E05).

## No se puede perder

Todas las lecturas: lo que no entra en lo principal queda plegado, nunca desaparece. También controles rápidos, estados estimados y selección del dispositivo.

## Dónde mirar

- `src/panels/device-screen.ts`, `src/model/device-screen.ts`.
- `src/model/names.ts` (`readingName`) y `src/model/device-catalog.ts`.
- `tests/browser/fixtures/device-screen.html` y sus pruebas.

## Pasos

1. Reclamar la etapa.
2. Comparar cada parte con la maqueta y listar las diferencias.
3. Ampliar la detección de canales en `src/model/`, con pruebas unitarias. Casos inventados: «Power 1», «Channel 1 Power», «Canal 1 · Potencia», sin canales.
4. Ajustar la pantalla.
5. Pruebas, capturas y reporte.

## Aceptación

- [ ] Un medidor con 6 canales llamados «Power 1» a «Power 6» muestra la tabla.
- [ ] Un sensor sin canales no muestra una tabla vacía.
- [ ] Ninguna lectura deja de estar disponible.
- [ ] El plano sigue visible en escritorio.
- [ ] Un no administrador no ve **Abrir en Home Assistant**.
- [ ] Lo técnico está plegado y traducido.

## Registro

### 2026-10-31 · ChatGPT · terminada para revisión, lote 1
- **Hecho:** encabezado con icono, nombre, espacio, salud y antigüedad; resumen Ahora/Hoy/Tensión cuando hay evidencia; tabla Canal/barra/Ahora/Hoy, sin depender de fabricante. Reconoce Power 1, Channel 1 Power y Canal 1 · Potencia, incluidas sus traducciones. Otras lecturas, Actividad y Diagnóstico plegados. Pie con acceso a HA y Editar para administradores, sin desplazar el plano en escritorio. Editar abre el símbolo correcto; Cerrar devuelve el foco. Controles, modos y lecturas siguen juntos en la hoja móvil.
- **Comparación previa y decisiones:** la pantalla existente ya tenía encabezado, controles y hoja móvil. Faltaban Editar y los nombres breves del resumen; la barra estaba mezclada con Ahora, las lecturas secundarias estaban desplegadas y Power 1 no se reconocía. Se completan esos puntos. Las diferencias por parte y las referencias §8 quedan en `docs/evidence/rediseno-lote1/README.md`. Se eligen tres indicadores útiles del medidor sin borrar la selección anterior: las demás lecturas pasan al bloque plegado. El consumo de hoy exige indicación diaria explícita, nunca se deduce sólo de kWh. Si dos lecturas representan el mismo canal, la adicional se conserva en Otras lecturas.
- **Aceptación:**

| Punto | Resultado | Cómo se comprobó |
|---|---|---|
| Seis canales Power 1…6 muestran tabla | Cumplido | Pruebas de modelo con los tres formatos pedidos y ES/EN; fixture de navegador renombrado a Power 1…6 |
| Sensor sin canales sin tabla vacía | Cumplido | Prueba de modelo sin canales y recorrido de sensor, también sin permisos de administrador |
| Ninguna lectura deja de estar disponible | Cumplido | Igualdad del conjunto de identificadores útiles antes/después entre resumen, tabla y Otras lecturas; duplicados conservados; diagnóstico sigue plegado; ocultas/deshabilitadas/configuración siguen excluidas como antes |
| Plano visible en escritorio | Cumplido | Prueba geométrica existente y captura a 1440×900; panel en el lugar de Ahora |
| No administrador sin Abrir en HA | Cumplido | Cambio de permisos en vivo y caso de observador; Editar también respeta permisos |
| Técnico plegado y traducido | Cumplido | Bloques inicialmente cerrados, conservación durante actualización, modos y actividad ES/EN; motivos de error traducidos antes de mostrarse |

- **Inventario asignado (8/8 conservadas):**

| Función | Dónde queda / comprobación |
|---|---|
| F-039 Actuar desde Ahora | Apertura y apagado rápido; pruebas Ahora y comando explícito sin confirmación inventada |
| F-063 Principal y adicionales | Selector existente intacto; resumen, tabla u Otras lecturas conservan todas las útiles; selección/configuración no se reescribe |
| F-066 Datos del dispositivo | Encabezado y aviso de vínculo incompleto; modelo de vínculo ausente/reasignado y navegador en vivo |
| F-067 Canales | Tabla ampliada, orden numérico, conversión de unidades y detección genérica; tres casos pedidos probados |
| F-068 Avisos/actividad/diagnóstico | Avisos visibles; actividad y diagnóstico plegados, con sus valores y horarios; pruebas de actualización y traducción |
| F-069 Abrir en HA | Pie, sólo con registro y administrador; prueba de enlace exacto y revocación de permisos |
| F-070 Controles por capacidad | Se conserva el modelo de capacidades y los controles personalizados; comandos soportados y motivos de indisponibilidad, pruebas de clima y paneles nativos |
| F-074 Confianza y teclado | Estado estimado sin marcar modo actual como confirmado, Escape y devolución de foco; pruebas de estado asumido y cierres |

- **Comprobaciones:** `npm run check` aprobado (254 pruebas); once casos únicos de dispositivo en escritorio aprobados, uno exclusivo de móvil omitido localmente. Siete casos de paneles nativos y casos específicos E03 completan la comprobación del lote. Evidencia final y CI se registran en el reporte único del PR #52. Contrato e integración sin cambios, por lo que no corresponde pytest local.
- **Dependencias:** `npm ci --ignore-scripts --offline` no pudo completar por caché insuficiente y la red no resolvía el registro. Se recuperó `node_modules` de la copia local E01 después de comprobar SHA-256 idéntico de `package-lock.json`; no se cambió ese archivo ni versiones.
- **Falta:** auditoría independiente, teléfono/lector y equipos físicos. E2E con Home Assistant desechable queda para el lote 4, conforme al modo continuo. Ningún pendiente funcional identificado en esta etapa.
- **Dónde quedó:** `chatgpt/rediseno-e02-pantallas`, PR #52; commit E04 del lote 1.
- **Para quien siga:** detenerse después de informar el resultado de GitHub. Sólo con «continuá» corresponde lote 2: E05, E06, E07 y E08. No fusionar, publicar ni instalar nada.
- **Cierre del lote, pausado:** implementación, comprobaciones y capturas locales completas. La revisión automática rechazó crear el árbol en GitHub por interpretar «no publiques nada» como prohibición de modificar el remoto. No se subieron cambios ni el reporte al PR #52 y no se ejecutó CI nueva; la aprobada en `7b3dd79` corresponde al lote 0. Se mantienen dos commits locales, uno por etapa, y no se empieza lote 2. El siguiente paso requiere autorización explícita de subida a la rama/PR, sin fusión ni release.
