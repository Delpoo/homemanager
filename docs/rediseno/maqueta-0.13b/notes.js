/* ═════════ Notas de diseño (solo para revisar la maqueta) ═════════ */
$('#notes').innerHTML = `<h3>Cómo se pensó</h3>
<p>Cada pantalla parte de su misión y de cómo lo resuelven herramientas que la gente ya conoce: programas de dibujo como Figma o Illustrator para el plano, editores de mapas de aspiradoras robot y apps de planos para los espacios, y diseñadores de controles universales para los controles. En pantalla no hay explicaciones: cada ícono dice qué hace al pasar el mouse, y los atajos están en el botón del teclado.</p>
<h3>1 · Menú cuaderno</h3>
<ul><li>Una sola puerta, la ruedita ⚙, con el menú clásico de ícono y nombre.</li>
<li>Cada opción entra deslizándose en el mismo panel y ← vuelve. Arriba queda el camino.</li>
<li>La página de un control muestra el control real, el mismo del diseñador.</li></ul>
<h3>2 · Editor del plano</h3>
<ul><li><b>Cada espacio es una forma de lados rectos.</b> No hay listas de cuartos: todo se hace sobre el dibujo.</li>
<li><b>Unir</b> deja un solo contorno, sin líneas adentro. Si las formas no se tocan, rellena lo que hay entre sus bordes más cercanos y quedan como una sola (probalo con Baño y Balcón).</li>
<li><b>Restar</b> le quita al primero lo que tapan los otros (Dormitorio menos Vestidor). <b>Intersecar</b> deja solo lo común.</li>
<li><b>Cortar con un trazo</b>: se dibuja una línea a través de una o varias formas y cada una queda en dos.</li>
<li><b>Editar puntos</b> (doble clic): mover un punto, agregar uno tocando el medio de un lado, quitarlo con Supr.</li>
<li>Rectángulo y forma libre, mover, agrandar desde 8 manijas (Shift mantiene la proporción), girar 90°, voltear, duplicar, adelante y atrás, y alinear varias.</li>
<li>Imán con la grilla y con las otras formas, con líneas guía. Medidas en metros mientras se dibuja, superficie en m² en cada espacio, zoom, mover la vista e imagen del plano con transparencia.</li>
<li>Deshacer y rehacer todo. Atajos: V, A, R, P, K, H, Ctrl+U, Ctrl+D, Supr, flechas.</li></ul>
<h3>3 · Diseñador de controles</h3>
<p><b>Lo que la maqueta anterior había sacado y vuelve:</b> botones aprendidos para arrastrar al control, con aviso de los que no se usan; tamaño de la grilla; mover y agrandar arrastrando; secuencias con veces y pausas; modo prueba; ordenar automáticamente; deshacer; color a elección; posición con números; aprender más botones desde ahí.</p>
<p><b>Lo nuevo:</b></p>
<ul><li><b>Bloques</b> como en un control de verdad: cruceta con OK, teclado numérico, reproducción y botones de colores.</li>
<li><b>Temas del control</b>: Grafito, Claro, Arena y Vidrio, con color del cuerpo, esquinas y separación.</li>
<li><b>Estilo de cada elemento</b>: tamaño y grosor de letra, tamaño del ícono, fondo, letra, borde, color al estar activo, esquinas o píldora, y relieve (con relieve, plano o contorno).</li>
<li><b>Texto e ícono propios</b>, aparte del nombre del botón aprendido. El ícono se busca por nombre.</li>
<li><b>Mantener apretado</b> repite (para volumen) u otro botón.</li>
<li>Duplicar un control para otro aparato, o elementos sueltos.</li></ul>
<table><tr><th>Categoría</th><th>Formas</th></tr>
<tr><td>Botón: una acción</td><td>Pulsador · Encender/apagar · Marca o app · Secuencia</td></tr>
<tr><td>Niveles: un valor que sube y baja</td><td>Subir/bajar con el valor en el medio · Barra · Escalones · Perilla. Números o nombres, frena o vuelve al inicio, envía subir/bajar, uno que avanza o uno por nivel</td></tr>
<tr><td>Modos: estados con nombre</td><td>Botones · Lista · Un botón que rota</td></tr>
<tr><td>Información: solo muestra</td><td>Valor · Gráfico · Título · Separador</td></tr>
<tr><td>Bloques</td><td>Cruceta · Teclado numérico · Reproducción · Colores</td></tr></table>
<p>Marcas: unas 80 entre marcas y teclas, con buscador. Donde hay ícono libre se usa; si no, la inicial con el color de la marca, porque los logos oficiales no se pueden incluir libremente.</p>
<h3>4 · Controles en el plano</h3>
<ul><li>Se pega cualquier elemento del control a un símbolo, y es el mismo del diseñador.</li>
<li>Se arrastra a donde uno quiera y se puede fijar con el candado. Al mover el símbolo, lo pegado lo acompaña. Un imán suave lo alinea con el centro del símbolo.</li>
<li>El tamaño se cambia arrastrando la esquina o con los controles del panel, y los dos siempre muestran lo mismo. Lo mismo pasa con el tamaño del símbolo.</li>
<li>Estilo propio: letra, tamaño del valor, fondo, letra, esquinas, opacidad y relieve. «Crece con el símbolo» decide si acompaña su tamaño.</li>
<li>Fuera de la edición, el control funciona. El anillo del símbolo muestra la velocidad, sin animaciones de giro.</li></ul>
<h3>Para decidir al aprobar</h3>
<ul><li>¿Los nombres de las categorías te sirven?</li>
<li>Al pasar el máximo en Niveles, ¿frena o vuelve al inicio?</li>
<li>¿Qué tema querés de base para los controles nuevos?</li></ul>`;
$('#notes-btn').onclick = () => {
  const n = $('#notes');
  n.hidden = !n.hidden;
  $('#notes-btn').setAttribute('aria-pressed', String(!n.hidden));
};
render();
