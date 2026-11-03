# Candidata 0.11.0-beta.2

Preparación autorizada el 2026-11-03. Sin publicar, fusionar ni instalar en la vivienda. Incluye E01–E13; Remotes es un proyecto separado.

## Actualización y retorno

1. Conservar el paquete de beta.1 y realizar una copia completa de Home Assistant antes de cambiar código o guardar con beta.2. Conservar también una exportación del hogar. El historial del plano no reemplaza la copia completa.
2. Ensayar primero en Home Assistant desechable, con configuración ficticia de beta.1: cargar, editar, guardar y recargar. Comparar dispositivos, posiciones, acciones, paneles, reglas y biblioteca RF; no basta comprobar que la pantalla abre.
3. Probar alternativas claras/oscuras y copia con imágenes, Ahora, diseñador, navegación y salida de pared. No enviar señales a equipos físicos durante este ensayo.
4. Para volver atrás, restaurar conjuntamente el código anterior y la copia completa anterior a la actualización. No sobrescribir datos nuevos con código viejo ni importar sólo el SVG como sustituto de recuperación.
5. Comprobar nuevamente configuración, biblioteca RF y autenticación tras restaurar. Los cambios hechos después de la copia no estarán en ella; conservar una copia separada antes de restaurar.

Este procedimiento todavía necesita un ensayo completo de actualización y restauración; el E2E del lote 4 comprobó una instalación nueva, guardado y recarga, no una restauración mediante el asistente de HA.

## Condiciones de publicación

- Auditor distinto del implementador: aplicar docs/rediseno/auditoria.md al candidato completo. CI aprobada no sustituye ese veredicto.
- Resolver hallazgos y registrar qué no se probó. Teléfono/tablet, lector y RF/IR físicos siguen pendientes.
- Integración consciente de #55/#56/#57: están apilados; no aplicar squash sucesivos sin reconciliar las bases. Conservar ramas e historia.
- Versiones alineadas, CI completa del candidato y, tras autorización de fusión, del árbol definitivo de main.
- Sólo después: etiqueta v0.11.0-beta.2 coincidente con HEAD de main; ejecutar Prepare verified draft release, revisar ZIP/checksum/notas y publicar como pre-release con autorización.

## Evidencia previa

El candidato del lote 4 (35713a8) aprobó CI 41549872498: 284 pruebas de código, 476 de navegador, cuatro omisiones previstas, 253 pruebas por versión de HA y E2E desechable. La nueva versión debe obtener su propia CI; no se atribuye a este commit el resultado anterior.
