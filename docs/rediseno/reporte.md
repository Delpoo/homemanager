# Reporte al propietario

Enviar este reporte al terminar una etapa o al dejarla a medias, y pegarlo también en el PR.

Se escribe para una persona no técnica: frases cortas, sin nombres de archivos ni de código fuera de «Detalle técnico». Es obligatorio decir lo que falta y lo que no se probó.

```markdown
## Etapa EXX · <nombre> · <terminada | a medias | bloqueada>

**En una frase:** <qué cambió para quien usa la app>

### Qué se hizo
- <cambio visible>

### Qué falta
- <lo pendiente de esta etapa, o «Nada de esta etapa»>

### Cómo probarlo
1. <paso que puede seguir el propietario>
2. <qué debería ver>

### Funciones conservadas
<Resultado contra docs/rediseno/inventario.md: las N funciones que tocó esta etapa siguen disponibles.
Si alguna cambió de lugar, decir dónde quedó. Si alguna se quitó, decir quién lo aprobó.>

### Qué no se probó
- <por ejemplo: teléfono real, casa real, o «Se probó todo lo indicado»>

### Riesgos o dudas
- <lo que podría salir mal>

### Lo que necesito de vos
- <decisión o validación, con mi recomendación; o «Nada»>

### Siguiente etapa sugerida
<EXX · por qué>

### Detalle técnico
- PR: <enlace>
- Rama: <rama>
- Comprobaciones: `npm run check` <resultado>, `npm run format:check` <resultado>, navegador <resultado>, `pytest` <resultado o «no corrido»>, extremo a extremo <resultado o «no corrido»>
- Capturas: <ruta>
- Cambios en el contrato: <cuáles, o «Ninguno»>
```

## Entrada para el registro de la etapa

Agregar esto al final del archivo de la etapa, sin borrar entradas anteriores:

```markdown
### AAAA-MM-DD · <agente> · <terminada | a medias | bloqueada>
- **Hecho:** …
- **Falta:** …
- **Dónde quedó:** rama, PR y último commit
- **Para quien siga:** lo que no es evidente y hay que saber antes de continuar
```
