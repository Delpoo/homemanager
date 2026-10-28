# Trabajo coordinado

El propietario es `Delpoo`. Los agentes trabajan mediante ramas y PRs; no comparten un directorio de trabajo entre sesiones ni presuponen que un chat puede leer archivos de otro.

## Ownership

| Rol | Repositorio y rama estable | Rutas propias |
| --- | --- | --- |
| Agente 0: fundación | público, `foundation` | `.github/`, `scripts/`, `schemas/`, documentación transversal |
| Agente 1: arquitectura visual | privado, `architecture` | `architecture/`, `assets/`, `docs/architecture.md` |
| Agente 2: frontend | público, `frontend` | `src/card/`, `src/editor/`, `src/panels/`, estilos y sus pruebas |
| Agente 3: HA | público, `ha-bindings` | `src/ha/`, `docs/home-assistant.md`, pruebas de adapter |
| Agente 3: configuración real | privado, `ha-configuration` | `instance/`, `home-assistant/`, `docs/bindings.md` |
| Integrador 4 | ambos, `integration` | integración mediante PRs y revisión de límites |

Las rutas `schemas/`, `src/state/`, manifiestos, build y dependencias requieren acuerdo explícito entre roles antes de cambiarlas. Las ramas de agentes son de trabajo; no son permisos de GitHub. No se agregan colaboradores ni se amplía acceso automáticamente.

## Procedimiento

1. Obtener un checkout separado del repositorio correspondiente y partir del `main` actual. No inicializar Git en el directorio padre que contiene ambos repositorios.
2. Usar la rama asignada; actualizarla desde `main` antes de cambios amplios. Abrir PR hacia `main`; incluir contrato usado, rutas tocadas y evidencia de validación.
3. Copiar únicamente archivos revisados. No subir carpetas completas de trabajos anteriores. Los ejemplos y pruebas públicos deben ser sintéticos.
4. Ejecutar `npm ci --ignore-scripts`, `npm run check` y `npm run build` en el público; en el privado ejecutar `npm run check`. Revisar `git diff --cached` y nombres de archivos antes de empujar.
5. No hacer push directo, force push, sobrescribir archivos ajenos, modificar visibilidad ni activar despliegue automático. Los cambios de contrato se revisan entre los tres agentes antes de aprobarlos.

Un PR no puede aprobarse a sí mismo. Con un único usuario GitHub, exigir una aprobación bloquea los PR creados por ese mismo usuario hasta disponer de otro revisor autorizado. Política inicial propuesta: PR obligatorio y CI obligatorio, cero aprobaciones automáticas obligatorias; revisión humana del propietario o del integrador antes de fusionar. Si se habilita otro revisor con permiso, aumentar a una aprobación y CODEOWNERS requerido. El usuario debe autorizar cualquier nuevo acceso.

`CODEOWNERS` identifica responsabilidad por cuenta GitHub, no agentes separados. La documentación no aplica protecciones por sí sola; el estado efectivamente aplicado se registra fuera del código de producto.
