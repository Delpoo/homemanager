# Versiones y preparación de releases

La versión única vive en `package.json`, el lockfile, el manifest y el primer registro de `CHANGELOG.md`. La candidata 0.3.1 no se publica al hacer commit ni al abrir un PR.

1. Revisar y fusionar el PR autorizado, con todos los checks aprobados. Identificar el commit y ensayar actualización/recuperación en HA desechable.
2. El propietario crea un tag SemVer, por ejemplo `v0.3.1`, que apunte al commit actual de `main` y coincida con la versión del paquete. No se preparan tags antiguos con un workflow posterior.
3. Ejecutar manualmente **Prepare verified draft release**, desde `main`, indicando ese tag. El workflow exige que tag, `main` y el commit del propio workflow coincidan, y llama a la CI completa con ese SHA exacto: contratos, unidades, tipos, navegador, auditoría npm, inspección del ZIP y matriz de dos versiones HA.
4. Sólo después de aprobar todas las capas, un trabajo separado descarga el artefacto, comprueba su SHA-256, crea una atestación y prepara una **release en borrador**. Ese trabajo no hace checkout ni ejecuta código del repositorio. Rechaza una release existente y no sobrescribe assets.
5. Revisar notas, archivos y procedencia; publicar manualmente sólo con autorización del propietario. La publicación automática por evento `release: published` fue retirada.

El ZIP usa entradas permitidas, orden, permisos y timestamps fijos. Dos builds con la misma fuente y herramientas deben coincidir; diferencias de herramientas de compresión/bundling todavía requieren revisar su efecto. El checksum identifica los bytes; la atestación vincula esos bytes al workflow verificador. Una cuenta o workflow mantenedor comprometido sigue formando parte de la frontera de confianza.

Rollback: conservar código y backup completo de HA previos, incluidos `.storage` y autenticación. El historial de SVG no reemplaza ese backup. El store rechaza versiones mayores futuras; no forzar una versión anterior sobre datos incompatibles. Ningún procedimiento de este documento fue ejecutado en una vivienda durante la corrección.
