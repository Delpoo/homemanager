# Auditoría de una etapa

El auditor revisa una etapa terminada antes de que el propietario la valide. Quien implementó no se audita a sí mismo.

No alcanza con leer el reporte: hay que abrir la app y mirar el código. Los hallazgos son de comportamiento, no de estilo. Si el implementador no pudo recorrer algo en la app, el auditor lo recorre y lo deja anotado.

## Qué revisar

1. **Alcance:** el PR hace lo que pide la etapa, sin agregar otra cosa.
2. **Funciones conservadas:** cada función de [inventario.md](inventario.md) que toca la etapa sigue disponible. Probarlo, sin fiarse del reporte.
3. **Criterios de aceptación:** comprobar cada uno y anotar cómo se comprobó.
4. **Maqueta:** comparar las capturas con [maqueta-modulos.html](maqueta-modulos.html) y con la sección que indique la etapa. Mirar distribución, tamaños, colores y textos, en claro y en oscuro, en 1440×900 y 390×844.
5. **Datos viejos:** un plano anterior carga igual y al guardar no pierde campos.
6. **Contrato:** cada campo nuevo es opcional y se valida en los tres lugares.
7. **Sin nada fijo:** ni valores ni opciones fijas donde el propietario pidió poder configurar.
8. **Lenguaje:** sin `entity_id`, `mdi:`, inglés ni palabras técnicas a la vista.
9. **Estado:** un envío RF nunca aparece como confirmado.
10. **Privacidad:** sin datos de la vivienda, credenciales ni direcciones internas en código, capturas o texto del PR.
11. **Comprobaciones:** CI en verde y comandos del [LEEME](LEEME.md#comprobaciones-antes-de-pedir-revisión) coherentes con el reporte.
12. **Registro:** [ESTADO.md](ESTADO.md) y el registro de la etapa dicen lo mismo que el PR.

## Veredicto

Publicarlo en el PR y enviarlo al propietario. Los hallazgos van ordenados de más a menos grave.

```markdown
## Auditoría EXX · <agente auditor> · <fecha>

**Veredicto:** Aprobable | Aprobable con observaciones | Debe corregirse

**En una frase:** <qué conviene hacer>

### Debe corregirse
1. <qué falla, cómo reproducirlo, y qué debería pasar>

### Observaciones
- <no frena la aprobación>

### Qué comprobé
- <criterio> · <cómo> · <resultado>

### Qué no pude comprobar
- <y por qué>
```

Después, el auditor cambia la fila de la etapa a `auditada` y agrega su línea a la bitácora. Si el veredicto es **Debe corregirse**, la etapa vuelve al implementador con esos puntos.

## Después del veredicto

Sólo el propietario pasa la etapa a `aprobada`. Fusiona quien el propietario indique. Un agente no publica versiones sin un pedido expreso.
