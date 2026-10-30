# Rediseño de HomeManager · empezar acá

Guía para cualquier agente (ChatGPT, Claude u otro) que trabaje en el rediseño. Leerla entera antes de tocar nada.

**Objetivo:** dejar la app como se concibió, sin perder lo que se construyó en el camino, y que cada símbolo del plano se pueda personalizar por módulos en lugar de tener funciones fijas.

## Roles

| Rol | Quién | Qué hace | Qué no hace |
|---|---|---|---|
| **Propietario** | `Delpoo` | Decide, valida cada etapa, fusiona y publica | No necesita leer código: el reporte es para esa persona |
| **Implementador** | ChatGPT u otro agente | Ejecuta **una** etapa, abre su PR y reporta | No fusiona, no publica, no empieza la etapa siguiente por su cuenta |
| **Auditor** | Claude u otro agente distinto del que implementó | Revisa con [auditoria.md](auditoria.md) y da un veredicto | No programa la etapa que audita |

## Orden de lectura

1. Este archivo.
2. [ESTADO.md](ESTADO.md): qué está hecho, en curso y pendiente.
3. [decisiones-propietario.md](decisiones-propietario.md): lo que pidió el propietario, con sus palabras.
4. La guía de **tu** etapa, en [etapas/](etapas/).
5. [maqueta.md](maqueta.md): los dibujos como imágenes. Si tu herramienta puede abrirla, la misma maqueta está en [maqueta-modulos.html](maqueta-modulos.html). E00 no la necesita.
6. Lo que indique la etapa de [../vision.md](../vision.md), [../vision-mockup.html](../vision-mockup.html), [../contract.md](../contract.md) y [../roadmap.md](../roadmap.md).

## Qué manda si dos cosas chocan

1. Lo que el propietario pidió en [decisiones-propietario.md](decisiones-propietario.md).
2. [maqueta-modulos.html](maqueta-modulos.html).
3. [../vision-mockup.html](../vision-mockup.html). Sus secciones 3 (edición) y 12 (categorías) quedan reemplazadas donde choquen con la anterior.
4. [../vision.md](../vision.md) y [../decisions.md](../decisions.md).

**Una imagen nunca autoriza a quitar una función.** Elegir un diseño define cómo se usa, cómo se ve y cómo se organiza. Lo que se construyó después se conserva, y lo útil de la imagen que falte se agrega. Si no se puede conservar algo, parar y preguntar.

## Principios

1. **Nada fijo.** Sin botones del tipo «avisar si baja de 20 %». Cada símbolo tiene una base y se le agregan módulos configurables.
2. **Una idea del propietario es un punto de partida.** Investigar si hay algo mejor y decirlo, con una recomendación. Cambiar la decisión no le corresponde al agente.
3. **Lenguaje de persona.** Ningún `entity_id`, `mdi:` ni palabra técnica a la vista, salvo en secciones avanzadas.
4. **Un envío no es una confirmación.** Un estado RF se muestra como estimado (D14, D18).
5. **Los datos viejos siguen funcionando.** Todo campo nuevo es opcional y un plano anterior carga igual.

## Cómo trabajar una etapa

### Antes de empezar

1. Leer [ESTADO.md](ESTADO.md). Tomar sólo una etapa `pendiente` cuyas dependencias estén `aprobadas`.
2. Mirar los PR abiertos: `gh pr list --repo Delpoo/homemanager --state open`. Si otro agente toca los mismos archivos, avisar al propietario en lugar de empezar.
3. Crear una rama desde el `main` actual: `<agente>/rediseno-eNN-nombre`. Una copia de trabajo por agente.
4. **Reclamar la etapa:** en un primer commit, cambiar su fila de [ESTADO.md](ESTADO.md) a `en curso`, con agente, rama y fecha. Abrir enseguida un PR **borrador** para que los demás lo vean.

### Durante

- Hacer sólo lo que dice la etapa. Lo que aparezca fuera de alcance se anota en el registro de la etapa.
- Si la etapa tiene una **parada de validación**, detenerse ahí, reportar y esperar.
- Si una instrucción no se puede cumplir o algo se contradice, parar y preguntar. No decidir en silencio.
- Comprobar antes de afirmar. Si esta guía nombra un archivo que ya no existe, buscar el actual y dejarlo anotado.

### Al terminar, o al dejar el trabajo a medias

Es obligatorio siempre, aunque la etapa quede incompleta:

1. **Registro de la etapa:** agregar una entrada al final de su archivo en [etapas/](etapas/).
2. **Fila en [ESTADO.md](ESTADO.md):** actualizar estado, PR, fecha y lo que falta. Tocar **sólo tu fila** y agregar tu línea a la bitácora.
3. **PR:** completar la plantilla del repositorio y pegar el reporte.
4. **Mensaje al propietario:** enviar el reporte de [reporte.md](reporte.md).
5. **Parar.** No empezar otra etapa hasta que el propietario lo pida.

## Si tu herramienta no te deja ver o probar algo

Un límite de tu herramienta no es una decisión del propietario: no le trasladés el problema ni pauses la etapa por eso. Si tu herramienta prohíbe algo, no lo eludas: seguí con la siguiente opción.

**Para ver la maqueta**
1. [maqueta.md](maqueta.md), desde GitHub o desde tu copia.
2. Con el servidor de pruebas: la ruta `/docs/rediseno/maqueta-modulos.html`, en `127.0.0.1` y tu puerto.

**Para ver la app**
1. Levantar el servidor con un puerto propio, para no usar el de otra copia: `HM_TEST_PORT=<puerto> npm run dev`.
2. Si tu navegador integrado no llega a ese servidor, usar Playwright desde la terminal: lanza el Chrome del equipo. `HM_TEST_PORT=<puerto> npx playwright test <archivo> --project=desktop`. Si tus herramientas de terminal tampoco llegan a `127.0.0.1`, anotarlo.
3. Mirar las capturas de `docs/evidence/`, que muestran casi todas las pantallas con datos inventados. Pueden estar atrasadas: decir de qué versión son.
4. Leer el código y las pruebas (`tests/**/*.browser.spec.mjs`).

**Si `npm ci` no puede descargar paquetes,** copiar `node_modules` de otra copia local del mismo repositorio, con el mismo `package-lock.json`, y decirlo en el reporte.

**Si nada de esto alcanza,** seguir con lo que no dependa de eso y decir cómo se comprobó cada cosa (código, captura o app). El auditor completa lo que falte. No marcar como cumplido lo que no se pudo comprobar. Sólo entonces pedirle algo al propietario: qué probaste y qué necesitás, en una frase.

## Estados

| Estado | Significa |
|---|---|
| `pendiente` | Nadie la empezó |
| `en curso` | Un agente la tomó (fila con agente y rama) |
| `pausada` | Quedó a medias: el registro dice dónde y por qué |
| `bloqueada` | Espera una decisión o a otra etapa |
| `en revisión` | Terminada y con PR listo, sin auditar |
| `auditada` | El auditor dio su veredicto, falta el propietario |
| `aprobada` | El propietario la validó: se puede fusionar |
| `fusionada` | Está en `main`, todavía sin publicar |
| `publicada` | Salió en una versión (anotar cuál) |

Sólo el propietario pasa una etapa a `aprobada`, o le pide a un agente que lo anote citando su mensaje.

## Reglas del repositorio

- No hacer push directo a `main`, force push ni fusiones. No publicar versiones ni instalar nada en Home Assistant sin aprobación.
- **Este repositorio es público:** ningún dato de la vivienda, credencial, dirección interna ni código RF. Ejemplos y pruebas con datos inventados.
- Toda prueba extremo a extremo se hace en un Home Assistant desechable, **nunca en la casa del propietario** sin su permiso expreso para esa prueba.
- Sin Browser Mod (D02).
- Campo nuevo del contrato: opcional y validado igual en `src/ha/validation.mjs`, `custom_components/homemanager/validation.py` y `schemas/catalog.schema.json`.
- La lógica va a `src/model/` con pruebas unitarias; marcadores y paneles sólo dibujan lo que esas funciones devuelven.
- Texto visible nuevo: pasa por `t()` y se traduce en `src/i18n/`.

## Comprobaciones antes de pedir revisión

- `npm ci --ignore-scripts`, `npm run check` y `npm run format:check`.
- `npm run test:browser`, en escritorio y móvil.
- `python -m pytest -q` si cambia la integración o el contrato (la CI lo corre con las dos versiones de Home Assistant).
- Extremo a extremo según [../testing.md](../testing.md) si la etapa cambia un flujo principal.
- Capturas a 1440×900 y 390×844, claro y oscuro, de cada pantalla que cambió, junto a su maqueta, explicando cada diferencia. Se guardan según las reglas de `docs/evidence/` y `scripts/public-assets.mjs`.

Decir siempre qué no se pudo probar. «No lo probé» es una respuesta válida; decir que pasó sin haberlo corrido no lo es.

## Mensaje para iniciar a un agente

```text
Trabajás en el repositorio Delpoo/homemanager. Leé docs/rediseno/LEEME.md y seguilo al pie de la letra.
Tomá la siguiente etapa disponible de docs/rediseno/ESTADO.md (o la etapa EXX, si te la indico).
Hacé sólo esa etapa. Al terminar o dejarla a medias, actualizá ESTADO.md y el registro de la etapa,
enviame el reporte de docs/rediseno/reporte.md y esperá mi validación antes de seguir.
```
