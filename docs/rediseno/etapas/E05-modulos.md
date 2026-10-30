# E05 · Símbolos por módulos

**Objetivo:** cada símbolo tiene una base y le agregás lo que necesitás. La categoría deja de limitar lo que puede hacer.
**Depende de:** E01.
**Maqueta:** [módulos, dibujos 1 a 4](../maqueta-modulos.html). Decisión: [D24](../../decisions.md).

## El cambio

| | Hoy | Después |
|---|---|---|
| Qué se elige | Una de 8 categorías | Nada obligatorio: base y módulos |
| Qué secciones se ven | `sectionsOf(category)` | Los módulos que tenga |
| Toque por defecto | Según arquetipo y categoría | Según lo sugerido al crearlo, editable |
| Aspecto | Arquetipo | Se deriva de sus datos: valor si tiene indicador, anillo si hay estado activo |
| Avisos | Según categoría (`applicable`) | Sin depender de la categoría |

**Base:** nombre, icono, color (E08), espacio, tamaño, posición.
**Módulos iniciales:** Dispositivo, Indicadores, Gestos (E06), Control, Junto al símbolo, Panel nativo, Reglas (atajo, E07).

## Alcance

1. **Modelo:** funciones puras en `src/model/` que dicen qué módulos tiene un dispositivo y cuáles se pueden agregar, con el motivo si no se puede.
2. **Interfaz:** ficha con base y bloques por módulo, y **+ Agregar**.
3. **Sugerencia al crear:** usar lo que hoy hace `categoryOf` sólo para proponer módulos iniciales. Editable.
4. **Capas:** hoy salen del arquetipo (`presentationOf`). Mantener esa sugerencia y permitir cambiarla en cada símbolo.
5. **Sacar la grilla de categorías** de la ficha.

## Datos

- Recomendación: que un módulo exista cuando existan sus datos, para no duplicar. Agregar `display.modules` sólo si hace falta recordar un módulo agregado pero vacío.
- `display.category` y `display.archetype` siguen siendo válidos. **Nunca se borran al guardar.** Sólo dejan de limitar.
- Quitar un módulo pregunta qué hacer con sus datos y permite deshacer.

## Fuera de alcance

Los gestos nuevos (E06), la pantalla de Reglas (E07) y el selector de iconos (E08). Hasta entonces, sus bloques usan lo que ya existe.

## No se puede perder

Todo lo de la ficha. Un plano con categorías guardadas se ve y se comporta igual después de esta etapa. Un cambio de módulo no borra datos sin avisar.

## Dónde mirar

- `src/model/category.ts`: `categoryOf`, `sectionsOf`, y `src/model/archetype.ts`: `presentationOf`.
- `src/model/alert-rules.ts` (`applicable`) y `src/model/alerts.ts`.
- `src/editor/index.ts`: `sheetCategory`, `proposeCategory`, `applySections`, guardado.
- `src/ha/validation.mjs`, `custom_components/homemanager/validation.py`, `schemas/catalog.schema.json`.
- Roadmap 0.10, etapa 5: propone categorías al asociar áreas. Coordinar.

## Pasos

1. Reclamar la etapa.
2. **Parada de validación:** enviar una propuesta corta: cómo se guardan los módulos, cómo se migra un plano actual (tabla categoría → módulos iniciales), y qué pasa con cada categoría. Esperar el visto bueno.
3. Modelo y pruebas unitarias.
4. Ficha y **+ Agregar**.
5. Migración de lectura y pruebas con planos 0.6, 0.9 y 0.10 inventados.
6. Pruebas, capturas y reporte.

## Aceptación

- [ ] Cualquier símbolo puede agregar cualquier módulo. Si no puede funcionar, aparece desactivado con el motivo.
- [ ] La ficha no muestra categorías.
- [ ] Un plano con cada una de las 8 categorías carga y se comporta igual.
- [ ] Guardar sin cambios no altera `display.category` ni `display.archetype`.
- [ ] Sumar un módulo se ve en el plano en el momento.
- [ ] Quitar un módulo se puede deshacer.
- [ ] Validación igual en JavaScript, Python y esquema.

## Registro
