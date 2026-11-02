# E08 · Selector de iconos y color

**Objetivo:** un solo selector en toda la app, con una lista enorme y nombres simples, y color personalizable.
**Depende de:** E05.
**Maqueta:** [módulos, dibujo 1](../maqueta-modulos.html). Comentarios: [Controles remotos](../decisiones-propietario.md#controles-remotos).

## Alcance

**Selector único**
- El mismo componente en símbolos, espacios, controles y botones RF. Hoy hay varios: `src/ui/icon-picker.ts` (144 sugeridos), `REMOTE_ICONS` y `BUTTON_ICONS` en `src/rf/catalog.ts`, y un desplegable en `src/rf/manager.ts`.
- **Lista completa** con buscador, por palabras en español e inglés. Sugeridos arriba y el resto debajo.
- **Nombres simples:** se ve «lock», nunca `mdi:lock`. Se guarda como hasta ahora (`mdi:lock`), para no romper el contrato ni los planos. Escribir «lock» o «mdi:lock» lleva al mismo icono.
- Debe funcionar bien con miles de iconos, sin trabar la pantalla ni agrandar demasiado la app.

**Color**
- Campo opcional en la base del símbolo. Sin elegir, se ve como hoy.
- Paleta sugerida más un color libre.
- El rojo queda reservado por defecto para las alertas, y la marca de salud sigue siendo legible.
- Revisar con el propietario los colores por defecto: pidió «mejores colores». Proponer antes de cambiar.

## Antes de construir: investigar

¿De dónde sale la lista? Comprobar en la versión mínima (2026.2.3) y en la actual (2026.10.4):
1. Si Home Assistant expone la lista de iconos a un panel propio, o si `ha-icon-picker` se puede usar en el panel y en la tarjeta.
2. Si no, incluir sólo nombres y palabras clave, y calcular cuánto pesa.

Reportar lo encontrado con una recomendación. Los iconos siempre se dibujan con `ha-icon`, sin caracteres Unicode.

## Fuera de alcance

Subir iconos propios. Si parece muy útil, anotarlo como idea.

## Datos

`display.color`, opcional, validado en los tres lugares. Sin cambios en el formato de iconos.

## No se puede perder

Sugerir un icono según el nombre, usar cualquier `mdi:` escrito a mano, iconos ya guardados aunque no estén en la lista, y el comportamiento del selector dentro de una hoja con scroll.

## Pasos

1. Reclamar la etapa.
2. **Parada de validación:** reportar la investigación, la propuesta de colores y el peso estimado.
3. Selector único y reemplazo en cada pantalla.
4. Color en el modelo, en `symbolSpec` y en la ficha.
5. Pruebas, capturas y reporte.

## Aceptación

- [ ] Hay un solo selector en toda la app.
- [ ] Buscar «lock» o «cerradura» encuentra el icono; nunca se ve `mdi:` en la lista.
- [ ] Un icono guardado que no esté en la lista se sigue mostrando.
- [ ] Abrir el selector no traba la pantalla (dar la medida).
- [ ] El color se ve en vivo en el plano, en claro y oscuro, con contraste suficiente.
- [ ] Una alerta se sigue distinguiendo aunque el símbolo tenga otro color.
- [ ] Un plano sin color se ve igual que antes.

## Registro

### 2026-11-02 — Codex — terminada para revisión
- **Hecho:** selector único en símbolos, espacios, controles, mando RF, botones aprendidos y widgets; 7447 nombres, búsqueda ES/EN, 96 resultados por tanda, entrada manual y borrado opcional. Nombre visible sin prefijo, valor persistido con mdi:. Color opcional en base, paleta y libre, vista previa y contraste en ambos temas; alertas/salud separadas.
- **Investigación y decisiones:** [fuentes, compatibilidad, peso y colores](../icon-index.md). Selector compartido propio porque el nativo muestra prefijos y su índice es interno; no se cambian los colores predeterminados. Ajuste sólo del tono dibujado para legibilidad.
- **Aceptación:** 1 cumplido (mismo componente en todos los puntos; listas RF cortas retiradas); 2 cumplido (lock/cerradura/mdi:lock en navegador, opciones sin prefijo); 3 cumplido (valor no listado en prueba de navegador); 4 cumplido (96 nodos/tanda, apertura medida en captura, aproximadamente 13–16 ms en esta PC); 5 cumplido (cambio en vivo y temas en navegador, contraste 4.5:1 en pruebas); 6 cumplido (modelo conserva insignia crítica y salud independientemente del color); 7 cumplido (sin color no se agrega semántica al símbolo ni cambian sus colores).
- **Inventario:** F-042 nombre/icono en base; F-100 edición de mandos/botones con selector compartido; F-104 widgets conservan icono opcional; F-110 candidato aprendido conserva sugerencias y rol; F-121 campos opcionales, tres validadores; F-131 búsqueda/manual/fuera de lista/scroll conservados. Seis filas cotejadas; ninguna función retirada.
- **Comprobaciones:** check, formato, recorridos focales, 34 casos Python aislados y capturas se registran en el PR. 40 capturas ficticias (1440×900 y 390×844, claro/oscuro; ocho superficies y dos referencias por combinación). Correcciones de contraste y ancho de filas incluidas tras inspección visual.
- **Falta:** auditor independiente, validación del propietario, lector/teléfono físicos y E2E previsto para lote 4. Python local sin pytest; matriz de integración en CI.
- **Dónde quedó:** `chatgpt/rediseno-lote-2`, commit E08 y PR propio al cierre; no se fusiona ni publica.
