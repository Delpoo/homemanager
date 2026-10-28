# Handoff para el Agente 4 (integración)

Fecha: 29 de octubre de 2026. Autor: auditoría de arquitectura y calidad (Claude). Destinatario: Codex, Agente 4. Complemento privado con los datos de la instalación: `docs/handoff-agent4-instance.md` en `Delpoo/homemanager-instance`.

Leé primero la [auditoría](audit-2026-10-29.md): explica qué se encontró y por qué se cambió. Este documento dice qué hacer ahora.

## 1. Estado de ramas y PR

### Público `Delpoo/homemanager`

| PR | Rama → base | Contenido | Recomendación |
| --- | --- | --- | --- |
| [#6](https://github.com/Delpoo/homemanager/pull/6) | `frontend` → `main` | Tarjeta, editor, paneles **y** los dos commits HA de #5 (como cherry-picks con otros SHA) | Integrar primero |
| [#5](https://github.com/Delpoo/homemanager/pull/5) | `ha-bindings` → `main` | Adaptador HA | Cerrar como incluido en #6 (integrar ambos duplicaría los mismos cambios con SHA distintos) |
| [#7](https://github.com/Delpoo/homemanager/pull/7) | `claude/universal-spaces` → `frontend` | Contrato V2, gestión de planos, rendimiento, límites, documentación | Integrar después de #6; GitHub lo redirige a `main` al borrar `frontend` |
| PR de la integración | `claude/companion-integration` → `claude/universal-spaces` | Integración compañera (D11 aprobada), panel lateral, migración, empaquetado HACS, CI `integration`, E2E contra HA real | Integrar después de #7 |
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
- `ConfigurationStore` (en `src/editor/storage.ts`) es la interfaz de almacenamiento, con dos implementaciones: `LovelaceConfigurationStore` (tarjetas inline) e `IntegrationConfigurationStore` (`src/integration/store.ts`, tarjetas con `home_id`).
- **Integración compañera** (D11, aprobada): ver [integration.md](integration.md). Categoría HACS Integración con `homemanager.zip`.

## 3. Cómo verificar en local

```sh
npm ci --ignore-scripts
npm run check           # límites públicos, esquemas, tipos, 80 pruebas unitarias
npm run test:browser    # 140 pruebas Playwright (escritorio y móvil)
```

Integración (Python 3.13): `python -m pip install -r requirements_test.txt` y `python -m pytest -q` (26 pruebas sobre HA 2026.2.3; en Linux/CI funcionan tal cual).

**En Windows** el arnés de HA necesita, sólo en el entorno virtual local y nunca en el repositorio: `lru-dict==1.4.1` en lugar de 1.3.0 (sin binario para 3.13), stubs de `fcntl` y `resource`, y un plugin de pytest que use el bucle *selector* y relaje `pytest-socket` (`-p hm_windows_shim`). Así se verificó esta entrega.

**Prueba E2E contra HA real** (`tests/e2e/local-ha.e2e.mjs`): instancia desechable en `127.0.0.1:8124` con `configuration.yaml` mínimo (`frontend`, `config`, `lovelace`, `onboarding`, `api` y una luz `template` llamada `light.e2e_lamp`), la integración copiada en `custom_components/`, onboarding de una cuenta de prueba por la API y alta de la integración por su flujo. El script recibe `HM_E2E_CREDENTIALS` (JSON con `hassUrl`, `clientId` y `tokens`) y se niega a ejecutarse contra hosts que no sean locales. En Windows nativo, HA requiere un lanzador que omita la comprobación de plataforma y los manejadores de señales, además de stubs de `pymicro_vad`, `pyspeex_noise` y `turbojpeg`; en Linux o en un contenedor no hace falta nada de eso.

En el privado, `npm run build:configuration -- --public ../homemanager` genera `build/homemanager-configuration.json` (ignorado por Git) y lo valida con el validador público de ese checkout.

## 4. Objetivos siguientes, en orden

### P0 · Antes de cualquier otra cosa

1. Integrar PR en el orden de la sección 1 (requiere aprobación del propietario).
2. **Formato:** un commit aislado con Prettier sobre `src/` y `tests/` (sin cambios de lógica), con `npm run check` y `test:browser` antes y después. Hacerlo antes de abrir otras ramas evita conflictos permanentes.
3. **Instalación de prueba:** en una instancia HA de prueba (no la de la vivienda sin aprobación explícita), registrar `dist/homemanager.js` como recurso de módulo y verificar: carga, editor en el diálogo Lovelace, guardado con relectura, recarga, usuario no administrador, dashboard YAML, sesión caducada, reconexión, y un dashboard distinto del principal sin `dashboard_path` (detección por URL).
4. Importar la configuración privada generada (sección 3) por el editor. **No ejecutar acciones físicas**: todos los bindings siguen en `null`.

### P1 · Producto

5. **Integración en la versión real de HA:** instalar la integración en una instancia de prueba con la **misma versión** que la vivienda (sólo se probó 2026.2.3), ejecutar `tests/e2e/local-ha.e2e.mjs` contra ella, crear el hogar desde el panel e importar `build/homemanager-configuration.json` del privado. Falta una interfaz para el **historial de planos** (la API existe: `homemanager/plans` y `plan/get`); añadir "Restaurar plano anterior" en *Importar y exportar*.
6. **Densidad de marcadores** con el plano real: modo compacto en escalas bajas, agrupación por espacio y detalle al seleccionar. Es el principal problema visible para el usuario.
7. **Selectores nativos de HA** en el editor (`ha-selector` de entidad e icono) y "pulsar en el plano para colocar".

### P2 · Calidad de producto

8. Controles con valor en paneles (propuesta en la auditoría, §7) como contrato V2.1 compatible.
9. Tema oscuro con variables de HA.
10. Traducciones (inglés y español) antes de publicar en HACS.

## 5. Riesgos abiertos

| Riesgo | Impacto | Mitigación actual |
| --- | --- | --- |
| Sin CAS en Lovelace | Dos editores simultáneos en tarjetas inline pueden pisarse | Doble lectura; migrar a la integración, que tiene revisión atómica |
| Integración probada sólo en HA 2026.2.3 | APIs de panel/frontend podrían diferir en la versión real | P1.5; `hacs.json` declara 2026.2.0 como mínima provisional |
| Plano legible por todo usuario HA | Privacidad frente a otros usuarios de la misma HA | Igual que un dashboard; la integración permitiría restringir lecturas por usuario si se requiere |
| Sin prueba en HA real | Diferencias de API o permisos | P0.3 |
| Código minificado | Errores al modificar, revisiones difíciles | P0.2 |
| Contrato V2 aún no integrado | Agentes que sigan escribiendo V1 | La migración acepta V1; documentar V2 como vigente |

## 6. Reglas que siguen vigentes

Sin Browser Mod; RF/C01 y scripts permanecen en HA; ningún dato de vivienda, URL interna o credencial en el público; sin releases ni despliegues sin aprobación; `sent` no confirma efectos físicos; los commits públicos usan el correo `noreply` de GitHub.
