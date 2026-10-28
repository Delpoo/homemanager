# Handoff para el Agente 4 (integración)

Fecha: 29 de octubre de 2026. Autor: auditoría de arquitectura y calidad (Claude). Destinatario: Codex, Agente 4. Complemento privado con los datos de la instalación: `docs/handoff-agent4-instance.md` en `Delpoo/homemanager-instance`.

Leé primero la [auditoría](audit-2026-10-29.md): explica qué se encontró y por qué se cambió. Este documento dice qué hacer ahora.

## 1. Estado de ramas y PR

### Público `Delpoo/homemanager`

| PR | Rama → base | Contenido | Recomendación |
| --- | --- | --- | --- |
| [#6](https://github.com/Delpoo/homemanager/pull/6) | `frontend` → `main` | Tarjeta, editor, paneles **y** los dos commits HA de #5 (como cherry-picks con otros SHA) | Integrar primero |
| [#5](https://github.com/Delpoo/homemanager/pull/5) | `ha-bindings` → `main` | Adaptador HA | Cerrar como incluido en #6 (integrar ambos duplicaría los mismos cambios con SHA distintos) |
| PR de esta auditoría | `claude/universal-spaces` → `frontend` | Contrato V2, gestión de planos, rendimiento, límites, documentación | Integrar después de #6; GitHub lo redirige a `main` al borrar `frontend` |
| [#2](https://github.com/Delpoo/homemanager/pull/2), [#3](https://github.com/Delpoo/homemanager/pull/3) | Dependabot | Versiones mayores de `actions/checkout` y `actions/setup-node` | Revisar notas de versión, fijar por SHA como el resto y probar la CI |

### Privado `Delpoo/homemanager-instance`

| PR | Rama → base | Recomendación |
| --- | --- | --- |
| #2 | `architecture` → `main` | Integrar |
| #3 | `ha-configuration` → `main` | Integrar |
| PR de esta auditoría | `claude/integration-prep` → `main` | Contiene merges de #2 y #3 más espacios V2 y el generador de configuración; tras integrar #2 y #3 su diff se reduce a lo propio |

Nada se ha fusionado ni publicado. No hay releases.

## 2. Qué cambió en el contrato (V2)

- `configuration.rooms: [{id,label}]`, ordenado. `device.roomId` es un ID declarado o `null`.
- `schemaVersion` y `catalog.schemaVersion` son `2`. Los V1 se aceptan como entrada y se migran en memoria (`src/ha/migration.mjs`); se persisten como V2 sólo con un guardado explícito.
- `kind` amplía con `media`, `lock`, `camera`, `appliance`, `other`.
- Documento ≤ 3 MiB; guardados Lovelace rechazados antes de superar 4 MiB.
- `assertConfiguration` (adaptador) es **la única** validación de forma y referencias; `validateConfiguration` (tarjeta) añade iconos y sanitización SVG.
- `ConfigurationStore` (en `src/editor/storage.ts`) es la interfaz de almacenamiento.

## 3. Cómo verificar en local

```sh
npm ci --ignore-scripts
npm run check           # límites públicos, esquemas, tipos, 80 pruebas unitarias
npm run test:browser    # 130 pruebas Playwright (escritorio y móvil)
```

En el privado, `npm run build:configuration -- --public ../homemanager` genera `build/homemanager-configuration.json` (ignorado por Git) y lo valida con el validador público de ese checkout.

## 4. Objetivos siguientes, en orden

### P0 · Antes de cualquier otra cosa

1. Integrar PR en el orden de la sección 1 (requiere aprobación del propietario).
2. **Formato:** un commit aislado con Prettier sobre `src/` y `tests/` (sin cambios de lógica), con `npm run check` y `test:browser` antes y después. Hacerlo antes de abrir otras ramas evita conflictos permanentes.
3. **Instalación de prueba:** en una instancia HA de prueba (no la de la vivienda sin aprobación explícita), registrar `dist/homemanager.js` como recurso de módulo y verificar: carga, editor en el diálogo Lovelace, guardado con relectura, recarga, usuario no administrador, dashboard YAML, sesión caducada, reconexión, y un dashboard distinto del principal sin `dashboard_path` (detección por URL).
4. Importar la configuración privada generada (sección 3) por el editor. **No ejecutar acciones físicas**: todos los bindings siguen en `null`.

### P1 · Producto

5. **Decisión D11** (almacenamiento): presentar al propietario la integración compañera. Si la aprueba, implementar detrás de `ConfigurationStore`: dominio `homemanager`, `Store` versionado, `homemanager/home/get|save` con revisión esperada y `require_admin`, historial de planos, panel lateral, y migración desde la tarjeta. Si no, mantener Lovelace y documentar los límites.
6. **Densidad de marcadores** con el plano real: modo compacto en escalas bajas, agrupación por espacio y detalle al seleccionar. Es el principal problema visible para el usuario.
7. **Selectores nativos de HA** en el editor (`ha-selector` de entidad e icono) y "pulsar en el plano para colocar".

### P2 · Calidad de producto

8. Controles con valor en paneles (propuesta en la auditoría, §7) como contrato V2.1 compatible.
9. Tema oscuro con variables de HA.
10. Traducciones (inglés y español) antes de publicar en HACS.

## 5. Riesgos abiertos

| Riesgo | Impacto | Mitigación actual |
| --- | --- | --- |
| Sin CAS en Lovelace | Dos editores simultáneos pueden pisarse | Doble lectura + un editor activo; resolvería D11 |
| Plano legible por todo usuario HA | Privacidad frente a otros usuarios de la misma HA | Documentado; D11 permitiría restringir |
| Sin prueba en HA real | Diferencias de API o permisos | P0.3 |
| Código minificado | Errores al modificar, revisiones difíciles | P0.2 |
| Contrato V2 aún no integrado | Agentes que sigan escribiendo V1 | La migración acepta V1; documentar V2 como vigente |

## 6. Reglas que siguen vigentes

Sin Browser Mod; RF/C01 y scripts permanecen en HA; ningún dato de vivienda, URL interna o credencial en el público; sin releases ni despliegues sin aprobación; `sent` no confirma efectos físicos; los commits públicos usan el correo `noreply` de GitHub.
