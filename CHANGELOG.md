# Changelog

Versionado [SemVer](https://semver.org/lang/es/). La versión vive en `package.json` y se replica en `custom_components/homemanager/manifest.json`; `tests/versioning.test.mjs` falla si divergen o si esta lista no empieza por la versión actual. Las releases las publica sólo el propietario (ver [docs/versioning.md](docs/versioning.md)).

## 0.3.1 — sin publicar

- Acceso privado por defecto; lectores elegidos desde las opciones de la integración.
- Carga global del frontend sólo con autorización explícita en las opciones.
- Validación completa V2 y perfil SVG estático en servidor; presupuesto de expansión en ambos lados.
- Suscripciones acotadas y limpieza al cancelar; cuotas globales de almacenamiento e historial con purga explícita.
- Guardados serializados y recuperación de fallos; documentos inválidos conservados en cuarentena.
- Paquete reproducible con lista de archivos permitidos y verificación final. Preparación manual de una release en borrador sólo después de superar toda la CI, con atestación y sin sobrescribir assets.

## 0.3.0 — sin publicar

Primera versión candidata para instalar en una vivienda real.

- **Producto único:** integración `homemanager` (almacenamiento con revisiones atómicas, historial de planos, panel lateral, bundle servido por la integración) + tarjeta + editor + paneles nativos, instalables como una sola integración HACS.
- **Contrato V2:** espacios definidos por cada instalación; migración automática y no destructiva desde V1.
- **Interacción espacial:** agrupación de dispositivos cercanos sin solapamientos, encuadre animado y resaltado de espacios, doble toque, pulsación larga, controles flotantes, hoja inferior en móvil.
- **Paneles nativos con capacidades reales:** brillo, temperatura de color, velocidad, modos, oscilación, dirección, posición, climatización y scripts con sus campos. Los comandos se muestran como enviados, nunca como confirmados sin evidencia.
- **Editor:** selector de entidades por nombre/área, alta en un paso desde una entidad con ubicación tocando el plano, gestión de espacios, reemplazo de plano con migración de posiciones, restauración de planos anteriores.
- **Tema e idioma:** variables de tema de Home Assistant (claro/oscuro/personalizado); español e inglés según el idioma del usuario.
- **Seguridad:** lectura para usuarios autenticados, escritura sólo administradores, validación del sobre en el servidor y rechazo de contenido activo en planos además de la sanitización del cliente.
- **Compatibilidad comprobada:** Home Assistant 2026.2.3 y 2026.10.4 (pruebas de integración y E2E en instancias locales desechables).
