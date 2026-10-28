# Estado y continuación · versión candidata 0.3.0

Actualizado el 29 de octubre de 2026 por la etapa de integración y maduración (Claude, en el rol de Agente 4). El complemento privado con los datos de la vivienda está en `docs/handoff-agent4-instance.md` de `Delpoo/homemanager-instance`. Antecedentes: [auditoría](audit-2026-10-29.md) y [decisiones](decisions.md).

## 1. Dónde está el código

| Rama | Contenido | Estado |
| --- | --- | --- |
| `integration` | Rama de integración del Agente 4: `frontend` (#6, que incluye #5) + contrato V2 (#7) + integración D11 (#8) + maduración de producto | Candidata a `main` mediante un único PR, **sin fusionar** |
| `claude/product-v1` | La misma historia; rama de trabajo de esta etapa | Trazabilidad |
| #5, #6, #7, #8 | PR anteriores, incluidos íntegramente en `integration` | Cerrar como incluidos cuando se fusione el PR de `integration` |
| #2, #3 | Dependabot (versiones mayores de acciones) | Pendientes de revisar |

Privado: `integration` = #2 + #3 + #4 (preparación V2). Sin fusionar.

## 2. Qué es HomeManager 0.3.0

Un único paquete HACS de categoría **Integración**:

- **Backend** (`custom_components/homemanager`):
  - hogares en `.storage`, con revisión atómica e historial de planos;
  - WebSocket con lectura para usuarios autenticados y escritura sólo para administradores;
  - filtro de contenido activo en planos;
  - panel lateral y bundle servido por la propia integración.
- **Frontend** (`src/`):
  - tarjeta espacial: agrupación sin solapamientos, encuadre animado, gestos y hoja inferior en móvil;
  - editor visual: espacios, selector de entidades, alta en un paso con ubicación tocando el plano, reemplazo y restauración de planos;
  - paneles nativos con controles derivados de las capacidades reales;
  - temas de HA, español e inglés.
- **Garantías que no cambian:**
  - sin Browser Mod;
  - la lógica RF queda en HA y se usa mediante scripts y sus campos;
  - un comando aceptado se muestra como *enviado*, y *confirmado* exige una fuente medida y verificada;
  - ningún dato de la vivienda en el público.

## 3. Verificación realizada

- `npm run check`: 93 pruebas. `npm run test:browser`: 158 pruebas, en escritorio y móvil.
- Integración Python: 35 pruebas con el arnés oficial sobre HA **2026.2.3** y **2026.10.4**. La CI cubre ambas versiones.
- **E2E en Chrome contra Home Assistant real** (instancias locales desechables, 2026.2.3 y 2026.10.4): pasan las 11 comprobaciones en ambas versiones. El procedimiento está en [testing.md](testing.md).
- Plano y catálogo reales de la primera vivienda (sólo en local): render en ~50 ms, sin errores y sin iconos superpuestos en escritorio ni móvil. El servidor acepta el plano sanitizado.

Errores que encontró la prueba contra HA real y ya están corregidos:

- entidades `unknown` (dispositivos asumidos o RF) quedaban sin comandos;
- importar un JSON completo desplazaba las posiciones;
- se perdía el texto del formulario al reconectar.

## 4. Qué falta y en qué orden

### P0 · Antes de la Raspberry

1. **Aprobación del propietario** para fusionar el PR de `integration` en `main`.
2. **Versión de HA de la vivienda.** Si es anterior a 2026.2 o posterior a 2026.10, repetir `pytest` y la E2E con esa versión antes de instalar.
3. **Instalación** siguiendo [installation.md](installation.md): copia de seguridad, paquete manual (o release si el propietario la aprueba), crear el hogar `verdale` e importar `build/homemanager-configuration.json`.
4. **Vinculación de entidades reales** con el propietario presente, siguiendo `docs/bindings.md` del privado. Las acciones físicas sólo con su aprobación.

### P1 · Calidad de uso tras la primera semana

5. Registrar las fricciones reales (densidad, tamaño de iconos, gestos) y ajustar umbrales como `GROUP_DISTANCE` y los tamaños.
6. Mostrar los nombres de los dispositivos al acercar (etiquetas bajo los iconos a partir de cierto zoom).
7. Paneles personalizados más ricos: hoy los paneles configurados son botones de acciones y los controles automáticos cubren el resto. Si hace falta, agrupar controles de varios dispositivos (por ejemplo, ventilador RF + luz del mismo equipo).

### P2 · Producto distribuible

8. Primera release 0.3.0: el propietario crea el tag y la release, y `release.yml` adjunta `homemanager.zip`.
9. Más idiomas: añadir un diccionario como `src/i18n/en.ts`; la prueba exige que esté completo.
10. Revisar Dependabot y fijar las acciones nuevas por SHA.

## 5. Riesgos abiertos

| Riesgo | Mitigación |
| --- | --- |
| Versión de HA de la vivienda no probada | P0.2; la CI cubre 2026.2.3 y 2026.10.4 |
| Plano legible por todos los usuarios de HA | Igual que un dashboard; la API permitiría restringirlo por usuario si se pide |
| Sin pruebas físicas todavía | P0.4 con el propietario presente |
| Diálogo HTTP de HA 2026.10 en instancias nuevas | Sólo afecta a instancias de prueba con puerto no estándar |
