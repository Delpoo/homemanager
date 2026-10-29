# Integración compañera `homemanager`

Implementa la decisión [D11](decisions.md#d11--almacenamiento-del-plano-y-la-configuración): HomeManager guarda los hogares (espacios, dispositivos, acciones, paneles y plano SVG) en el almacenamiento de Home Assistant, **fuera de los dashboards**, y añade un panel propio a la barra lateral. Código en `custom_components/homemanager/`, sin dependencias externas ni acceso a dispositivos: no llama servicios, no contiene lógica RF y no reemplaza permisos de HA.

## Qué aporta frente al almacenamiento en Lovelace

| | Lovelace inline (sigue disponible) | Integración |
| --- | --- | --- |
| Dónde vive el plano | Dentro del dashboard; viaja en cada carga | `.storage/homemanager.homes`; se pide sólo al abrir el plano |
| Escrituras simultáneas | Doble lectura, sin CAS | **Revisión atómica**: un guardado con revisión antigua se rechaza (`revision_conflict`) |
| Cambios de otro editor | Se ven al recargar | La tarjeta abierta se actualiza sola (suscripción) |
| Historial de planos | No | Últimos 10 planos por hogar, restaurables |
| Varias tarjetas del mismo hogar | Copias que divergen | Todas referencian el mismo `home_id` |
| Instalación | Recurso Lovelace manual | Panel con carga propia; carga global opcional para dashboards |
| Panel lateral | No | **HomeManager** en la barra lateral; datos sólo para cuentas autorizadas |

## Instalación

Por HACS, como repositorio personalizado de categoría **Integración** (`hacs.json` usa `zip_release` con el asset `homemanager.zip`). Manualmente, copiar el contenido de `homemanager.zip` en `config/custom_components/homemanager/`. Reiniciar y añadirla en *Ajustes → Dispositivos y servicios → Añadir integración → HomeManager* (instancia única; opciones de lectores y carga global).

Para desarrollo: `npm run build` copia el bundle en `custom_components/homemanager/frontend/` (ignorado por Git) y `npm run package` genera `.work/release/homemanager.zip`. Sin bundle, la integración guarda y sirve datos pero registra un error y no crea el panel.

## Uso

- **Panel HomeManager:** lista los hogares; un administrador crea uno con un ID kebab-case y lo completa con *Editar plano* (importar SVG/JSON, detectar espacios, colocar dispositivos). El primer guardado crea el hogar.
- **Tarjeta en un dashboard:** `type: custom:homemanager-card`, `card_id: plano`, `home_id: casa`. El dashboard guarda sólo esa referencia.
- **Migrar una tarjeta existente:** en el editor de la tarjeta, sección *Mover a la integración HomeManager*. Crea el hogar con la configuración actual (nunca sobrescribe uno existente) y cambia la tarjeta a `home_id`; después se pulsa *Guardar* en el editor de HA. La configuración inline anterior deja de usarse, pero la copia exportada sigue siendo el respaldo recomendado antes de migrar.

## API WebSocket

| Comando | Permiso | Resultado |
| --- | --- | --- |
| `homemanager/homes` | Administrador o lector seleccionado | Resumen de hogares: revisión, fecha, hash del plano, conteos |
| `homemanager/home/get` `{home_id}` | Administrador o lector seleccionado | Resumen + `configuration` |
| `homemanager/home/save` `{home_id, expected_revision, configuration, title?}` | **Administrador** | Crea (`expected_revision: null`) o reemplaza si coincide la revisión |
| `homemanager/home/delete` `{home_id, expected_revision}` | **Administrador** | Borra el hogar; su historial de planos se conserva |
| `homemanager/home/subscribe` `{home_id}` | Administrador o lector seleccionado | Eventos `{home_id, revision, deleted}`; nunca el documento |
| `homemanager/plans` `{home_id}` | **Administrador** | Historial de planos (sin contenido) |
| `homemanager/plan/get` `{home_id, plan_id}` | **Administrador** | Contenido de un plano anterior |

La interfaz de historial está en *Editar plano → Importar y exportar → Planos anteriores*.

Errores adicionales: `storage_quota`, `storage_error`, `subscription_limit`, `home_in_use`. Errores estables: `unsafe_plan`, `not_loaded`, `revision_conflict` (mensaje `revision:N`), `home_not_found`, `invalid_home_id`, `invalid_configuration`, `unsupported_schema`, `plan_too_large`, `configuration_too_large`, `too_many_homes`, `unauthorized`. Restaurar un plano se hace cargándolo en un borrador y guardando con `home/save`, de modo que pasa por la misma validación y control de revisión.

## Seguridad

- El plano **nunca** se sirve por una ruta estática ni sin autenticación: sólo viaja por el WebSocket de la sesión HA. La ruta estática `/homemanager_files/` contiene únicamente el bundle público MIT.
- Lectura privada por defecto: administradores y lectores elegidos explícitamente en las opciones. La autorización se comprueba en listar, leer y suscribir. Escritura e historial sólo para administradores (`require_admin`).
- El servidor valida el contrato V2 completo y un perfil SVG XML estático con lista permitida, entidades/DTD prohibidas, referencias locales y presupuesto de expansión. El navegador vuelve a sanearlo antes de renderizar.
- Los guardados y borrados se serializan; el estado visible cambia sólo después de persistir. Si falla el guardado principal se intenta restaurar el historial anterior. No hay una transacción de sistema de archivos entre ambos stores; un corte de energía todavía requiere recuperación desde backup.
- Suscripciones: hogar existente, 40 por conexión y 400 totales; la cancelación y descarga liberan los índices.
- Cuotas: 20 hogares activos, diez versiones por historial, 40 stores de historial y 64 MiB totales, incluidos hogares eliminados. Los documentos inválidos quedan preservados en cuarentena.
- `homemanager/storage/status` (administrador) informa uso e IDs de historiales retenidos; `homemanager/history/purge` requiere `{home_id, confirm: true}` y sólo admite hogares ya eliminados. El panel ofrece **Almacenamiento** para esta operación. No purga backups.


## Verificación

- `tests/integration/test_model.py` y `test_init.py`: pruebas con el arnés oficial `pytest-homeassistant-custom-component` sobre Home Assistant 2026.2.3 (permisos, CAS concurrente, suscripción, historial, persistencia tras recarga, flujo de configuración, registro del panel). CI: job `integration`.
- `tests/integration/home.browser.spec.mjs`: tarjeta, editor, migración y panel con un servidor simulado que sigue el mismo contrato.
- `tests/e2e/local-ha.e2e.mjs`: 11 comprobaciones en Chrome contra instancias **reales y desechables** de HA 2026.2.3 y 2026.10.4 (procedimiento en [testing.md](testing.md)).

`hacs.json` declara `homeassistant: 2026.2.0`; probado en 2026.2.3 y 2026.10.4. Hay que validar la versión de la instalación real antes de publicar.
