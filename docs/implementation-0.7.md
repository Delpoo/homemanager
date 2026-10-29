# HomeManager 0.7 · pista A

Base auditada: `main`, `211c085` (PR #17 fusionado). Rama: `chatgpt/0.7-shell`.
Fuentes: `PROMPT-CHATGPT-0.7.md` adjunto, plan de seis fases aprobado,
`vision.md`, `roadmap.md`, `vision-mockup.html` y D01–D20 de `decisions.md`.

## Matriz de auditoría · fase 1

| Requisito | Situación en la base | Cambio necesario | Compatibilidad y verificación |
| --- | --- | --- | --- |
| Tokens y logo | Tema hereda `primary-color`; logo Unicode | Paleta clara/oscura de visión §9 y logo SVG de la maqueta | Alias de tokens anteriores; comprobar oscuro HA y ausencia del azul primario |
| Barra superior | Administración visible en tarjeta y aplicación | `src/shell/`, actividad, alertas, reloj y menú accesible | Mantener selección del hogar, tarjeta montada y RF; acciones de escritura sólo para administrador |
| Riel de espacios | Botones de texto y encuadre | MDI, nombres accesibles, contador de alertas y punto activo | Orden e IDs conservados; lateral desde 1100 px y abajo en móvil; barras ≤120 px |
| Contrato | Tres validadores rechazan los campos nuevos | `rooms[].icon`, `display.archetype`, `display.show` opcionales | JS/declaraciones/TS, Python y JSON Schema sincronizados; datos 0.6 intactos |
| Modelo | No existe `src/model/`; decisiones mezcladas con dibujo | Funciones puras, `SymbolSpec`, arquetipos, alertas y actividad | Sin DOM ni imports de otras capas; decisiones por `kind` centralizadas |
| Tamaño de tarjeta | 1687 líneas | Extraer responsabilidades y shell | Objetivo estricto de visión §10: menos de 600 líneas |
| Símbolos | Círculo e indicador universal | Icono/valor, anillo/arco, etiqueta, mando e infraestructura | Formato HA, tamaños, controles fijados, ciclos y agrupaciones conservados |
| Salud y confianza | Adaptador ya verifica fuente medida y baseline | Salud sólo ante problema; conservar adaptador | `unknown` permite comandos; `unavailable` los bloquea; enviado/eco nunca confirman |
| Geometría de espacio | Rectángulo envolvente | Formas SVG clonadas, máscara y contorno real | Espacio L, transformaciones, viewBox desplazado, zoom y vuelta a casa entera |
| Alertas | Sin motor ni contadores | Clases críticas, batería <15 %, no disponible >10 min | Símbolo/espacio/píldora; resolución y encuadre; configuración queda para 0.9 |
| Actividad | Nota 4 s y seguimiento de eco | Registro por aplicación, 50 líneas, actualización por comando, 6 s y último | `Enviado`, `en el aire`, `confirmado`, `No se pudo enviar`; conservar nota junto al símbolo |
| Capas | Unicode sin texto; infraestructura activa | MDI y nombre abajo a la izquierda; infraestructura apagada | Conservar filtros, edición y agrupaciones; móvil sin desbordamiento |
| Persistencia y gestos | V1→V2 en memoria, CAS, borrador, pan/pinch/hold | Refactorizar conservando los flujos | Pruebas existentes y nuevas con acceso administrativo desde menú |
| Evidencia | Playwright y fixtures sintéticas | Cinco escenarios a 1440×900 y 390×844, comparados con maqueta | Instalación, check, formato, escritorio/móvil y pytest; documentar límites del E2E/CI |

## Fases y punto de continuación

1. Auditoría: completada en este documento; la matriz se incluye en el PR borrador.
2. Fundamentos: tokens, logo, modelo puro, contrato opcional y pruebas. Abrir el PR borrador inmediatamente después, antes de modificar la interfaz, y comunicar URL/estado.
3. Shell: barra superior, menú, riel, capas y adaptación accesible.
4. Plano: geometría real y dibujo exclusivo de `SymbolSpec`.
5. Eventos: alertas y actividad conectadas con los flujos existentes.
6. Verificación: pruebas, capturas comparadas y entrega verificable, después del punto 10.
7. Importación y espacios (punto 10 añadido por el propietario): modelo puro con revisión intermedia antes de su interfaz; revisión previa al importar y sobre el plano guardado; espacios editables desde el riel; fijo sólo bloquea posición. Commit propio antes de la verificación final de fase 6.

Un commit por fase. No se implementan columna Ahora, pantallas de dispositivo,
`deviceId`, inspector nuevo, configuración de alertas ni pista B. No modificar
`esphome/**`, `custom_components/homemanager/rf*.py`, versiones o CHANGELOG.
No fusionar, publicar releases ni tocar instalaciones reales.
