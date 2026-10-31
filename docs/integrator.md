# Continuación para el integrador 4

**El plan vigente y su contexto están en [handoff-agent4.md](handoff-agent4.md).** Esta lista conserva los criterios de aceptación originales. Revisar primero `contract.md`, `decisions.md` y `security.md`, y el estado real de GitHub que informe Agente 0.

## Orden de integración

1. Revisar PR del plano privado. Confirmar zonas `room-${roomId}` de los espacios declarados por la instancia, geometría y viewBox global. No trasladar el archivo al público.
2. Revisar PR del frontend genérico. Retirar transporte, mappings y eventos de Browser Mod de cualquier código previo antes de incorporarlo. Los paneles nativos deben vivir dentro de la tarjeta y ser locales al navegador que los abre.
3. Revisar PR del adaptador HA. Una sola sesión existente, acciones con destinos explícitos y lista permitida, RF exclusivamente por scripts HA. Reconciliar `mobility` y un solo resolver de estado.
4. Probar editor propio en dashboard `storage`: elegir entidad, acción y panel, validar, guardar con botón Lovelace, recargar, comprobar persistencia; cancelar debe descartar. Probar no administrador, YAML, conflicto y sesión caducada. No introducir backend solo para persistir posiciones.
5. Probar SVG importado y saneado como dato inline, carga/recarga y restauración con el plano privado real. Probar SVG malicioso con archivos sintéticos. Ningún recurso externo ejecutable.
6. Probar estados `unknown`, `estimated`, `sent`, `confirmed`, `error`, expiración, entidad ausente y feedback RF; el acuse de servicio no confirma respuesta física.
7. Revisar el artefacto compilado y sus mapas de código: debe contener solo código y recursos genéricos. Confirmar licencias y reproducibilidad; ejecutar comprobación de HACS.
8. Solo tras pruebas reales y autorización de publicación: crear tag SemVer y release con bundle `homemanager.js`, checksum y notas honestas. Antes, usar PR y artefactos de CI, sin release funcional.

No modificar, borrar ni reemplazar popups existentes en HA durante esta integración. Cualquier instalación o ensayo con acciones reales necesita alcance aprobado por el usuario. La migración de su instalación es distinta de publicar software genérico.
