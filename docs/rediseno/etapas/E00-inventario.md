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
