# E00 · Inventario de funciones

**Objetivo:** una lista completa de lo que la app hace hoy, para que ninguna etapa quite algo útil sin querer.
**Depende de:** nada.
**Código:** ninguno. Esta etapa sólo crea un documento.

## Alcance

Crear `docs/rediseno/inventario.md` con una tabla por pantalla, a partir del código de `main` y de la app corriendo con datos inventados:

| Id | Función | Qué permite hacer | Dónde está hoy | Cómo se llega | Etapa que la toca | Qué pasa con ella |
|---|---|---|---|---|---|---|
| F-001 | Corregir estado | Marcar apagado sin enviar nada | Ventana del dispositivo | Mantener el símbolo | E09 | Se conserva, plegada |

La última columna admite: **se conserva**, **cambia de lugar** (decir dónde) o **a decidir** (con recomendación). «Se quita» sólo si el propietario lo aprobó.

Recorrer como mínimo:

- **Panel:** barra superior, actividad e historial, alertas, reloj, menú ⋮, espacios, capas, zoom, *Ahora*, tema.
- **Plano:** toque, mantener, atajos junto al símbolo, vista por espacio, flechas y deslizar.
- **Ficha de edición** (`deviceForm` en `src/editor/index.ts`): categoría, nombre, icono, dispositivo y lecturas, espacio, controles, qué muestra, avisos, resaltar, control RF del panel, panel nativo, movilidad, posición, ID, corregir ubicación fija, quitar, mover, deshacer.
- **Barra de edición:** deshacer, rehacer, ajustes, guardar, descartar, agregar dispositivo.
- **Vincular:** búsqueda, grupos, lectura principal y adicionales, buscar cualquier entidad.
- **Pantalla del dispositivo y ventana de controles** (`src/panels/`).
- **Ajustes** (`src/editor/settings-page.ts`): plano y espacios, diagnóstico, acciones lógicas, paneles nativos, referencias pendientes, importar y exportar, fusionar, editor de zonas.
- **Controles RF** (`src/rf/`): controles, equipos, aprender, candidatos, prueba, intentos, diseñador, widgets, roles, YAML.
- **Hogares:** selector, crear hogar, almacenamiento.
- **Datos:** campos del contrato sin pantalla, como el historial de planos en `custom_components/homemanager/store.py`.

Si una función no tiene un lugar claro en el rediseño, anotarla como **a decidir**. Es lo más valioso de este documento.

## Fuera de alcance

Cambiar código o proponer diseños nuevos. Si se encuentra un error, se anota en el registro.

## Pasos

1. Reclamar la etapa ([LEEME](../LEEME.md#antes-de-empezar)).
2. Levantar la app con los datos de prueba (`npm run dev` y los fixtures de `tests/browser/fixtures/`) y recorrer cada pantalla.
3. Contrastar con el código: buscar `data-command`, `showModal` y las claves de `src/i18n/`, para encontrar lo que no se ve a simple vista.
4. Escribir el inventario.
5. Hacer el reporte. **Parada de validación:** el propietario revisa la columna «a decidir» antes de E01.

## Aceptación

- [ ] Cada elemento de la lista de arriba está en el inventario.
- [ ] Cada función tiene etapa y destino.
- [ ] Los casos «a decidir» traen una recomendación y un ejemplo simple.
- [ ] Una búsqueda de `data-command` en `src/` no encuentra una acción fuera del inventario.
- [ ] Sin datos de la vivienda.

## Registro

### 2026-10-31 · ChatGPT · a medias

- **Hecho:** etapa reclamada y PR borrador abierto desde main `9a5d975`. Guías leídas desde `claude/guias-rediseno` (`4e376aa`) por instrucción expresa del propietario. Inventario parcial de 28 funciones de barra, menú, historial, alertas, capas y navegación/diagnóstico de ajustes, verificado sólo contra los archivos leídos. Una decisión de ubicación del historial documentada con recomendación y ejemplo. Sin cambios de código o contrato.
- **Falta:** abrir la maqueta y recorrer todos los flujos con datos inventados; completar las pantallas indicadas arriba, mapear todas las acciones y traducciones, verificar destinos y decisiones pendientes, ejecutar comprobaciones y obtener validación del propietario. Ninguna casilla de aceptación se marca como cumplida.
- **Dónde quedó:** rama `chatgpt/rediseno-e00-inventario`, [PR #49](https://github.com/Delpoo/homemanager/pull/49). Commit remoto anterior a esta entrega: `cb2929999061d1416160a8521a1f0372b9e0e8bc`; el siguiente commit de esa rama, titulado `docs(rediseno): pausar E00 con inventario parcial y reporte`, contiene este cierre. Reporte: [E00-2026-10-31](../entregas/E00-2026-10-31.md).
- **Para quien siga:** el navegador rechazó abrir la maqueta local por el protocolo `file://`; su política sólo admite HTTP/HTTPS y prohíbe eludir ese bloqueo. Se detuvo el trabajo de la etapa conforme a LEEME. No confundir «compila» con un recorrido aprobado. `npm ci --ignore-scripts --offline --no-audit --no-fund` falló con `ENOTCACHED` (TypeScript); se copiaron dependencias ya existentes de la copia de guías y `npm run build` pasó. No se corrieron check, format, navegador, pytest ni E2E. No se levantó el servidor de desarrollo ni se accedió al HA real. El servidor de fixtures actual no sirve la ruta de la maqueta de módulos; no se modificó. `playwright.config.ts` no existe: el archivo vigente es `playwright.config.mjs`.
- **Coordinación:** PR #48 contiene las guías y toca estos mismos dos documentos de seguimiento; integrar primero sus guías y conservar después la fila y las entradas de E00. El PR #47 (plano vinculado) estaba abierto, por lo que no forma parte de lo inventariado. La fila de trabajos de ESTADO y la hoja de ruta aún lo dicen «sin empezar»: se deja anotada la discrepancia sin modificar filas ajenas. E01 no se empezó y no está habilitada.
- **Corrección de preparación:** el primer árbol remoto usó una referencia base incorrecta; se restauró inmediatamente el árbol exacto de main sin force push. La comparación remota posterior confirmó que sólo se agregaban ESTADO y la guía E00. Antes de entregar, volver a comprobar que el diff final contenga sólo documentación de E00.
