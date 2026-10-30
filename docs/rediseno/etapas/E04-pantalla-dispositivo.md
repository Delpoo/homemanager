# E04 · Pantalla del dispositivo

**Objetivo:** tocar un dispositivo muestra lo esencial, sus lecturas en orden y lo técnico plegado, como en la maqueta aprobada.
**Depende de:** E00.
**Maqueta:** [vision-mockup §8](../../vision-mockup.html#s8). Respuesta del propietario: **Sí**.

## Alcance

- Encabezado con icono, nombre, espacio, salud y hora de la última lectura.
- Lecturas principales en tarjetas: Ahora, Hoy, Tensión.
- **Tabla de canales de un medidor** con Canal, barra, Ahora y Hoy. Hoy falla con lecturas tipo «Power 1»: ampliar la detección, con pruebas, sin depender de un fabricante.
- Equipo en el teléfono: control principal, modos y lecturas en una hoja, como en la maqueta.
- Actividad y Diagnóstico plegados.
- Pie con **Abrir en Home Assistant**, sólo para administradores, y **Editar**.
- En escritorio, ocupa el lugar de *Ahora* sin tapar el plano.

## Fuera de alcance

La ventana de controles al mantener pulsado (E09) y los indicadores configurables (E05).

## No se puede perder

Todas las lecturas: lo que no entra en lo principal queda plegado, nunca desaparece. También controles rápidos, estados estimados y selección del dispositivo.

## Dónde mirar

- `src/panels/device-screen.ts`, `src/model/device-screen.ts`.
- `src/model/names.ts` (`readingName`) y `src/model/device-catalog.ts`.
- `tests/browser/fixtures/device-screen.html` y sus pruebas.

## Pasos

1. Reclamar la etapa.
2. Comparar cada parte con la maqueta y listar las diferencias.
3. Ampliar la detección de canales en `src/model/`, con pruebas unitarias. Casos inventados: «Power 1», «Channel 1 Power», «Canal 1 · Potencia», sin canales.
4. Ajustar la pantalla.
5. Pruebas, capturas y reporte.

## Aceptación

- [ ] Un medidor con 6 canales llamados «Power 1» a «Power 6» muestra la tabla.
- [ ] Un sensor sin canales no muestra una tabla vacía.
- [ ] Ninguna lectura deja de estar disponible.
- [ ] El plano sigue visible en escritorio.
- [ ] Un no administrador no ve **Abrir en Home Assistant**.
- [ ] Lo técnico está plegado y traducido.

## Registro
