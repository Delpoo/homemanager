# Código del producto

El agente de frontend incorpora aquí módulos genéricos en `card/`, `editor/`, `panels/` y `state/`. El agente de integración incorpora `ha/` y participa en `state/` mediante PR coordinado.

La entrada `card/index.ts` registra la tarjeta y el editor. `editor/` prepara borradores y verifica el guardado en Lovelace; `panels/` contiene los controles locales y `ha/` gestiona la sesión y el estado efímero. No importar inventarios, planos reales, etiquetas personales ni códigos RF. Los esquemas y `docs/contract.md` son la autoridad del contrato; el editor usa además el mismo validador de acciones que la ejecución.
