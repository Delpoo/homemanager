// Recorre la maqueta en un navegador real: cada pantalla en PC, teléfono, claro y oscuro.
const path = require('path');
const repo = process.argv[2], dir = process.argv[3];
const { chromium } = require(path.join(repo, 'node_modules', '@playwright', 'test'));
const url = 'file:///' + path.join(dir, 'maqueta013', 'index.html').replace(/\\/g, '/');
const out = path.join(dir, 'shots');
require('fs').mkdirSync(out, { recursive: true });
const screens = ['inicio', 'casas', 'simbolo', 'plano', 'ahora', 'vista', 'alertas', 'alerta-nueva', 'guia', 'automatizaciones', 'automatizacion', 'controles', 'estado', 'datos', 'ayuda', 'indicadores', 'equipos', 'control', 'nuevo-control', 'aprender', 'probar', 'disenador', 'ficha'];
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const problems = [];
  for (const [name, vp, scheme] of [['pc', { width: 1440, height: 900 }, 'light'], ['pc-dark', { width: 1440, height: 900 }, 'dark'], ['tel', { width: 390, height: 844 }, 'light']]) {
    const page = await browser.newPage({ viewport: vp, colorScheme: scheme });
    page.on('pageerror', e => problems.push(`${name}: error ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') problems.push(`${name}: consola ${m.text()}`); });
    for (const s of screens) {
      if (name !== 'pc' && !['inicio', 'simbolo', 'indicadores', 'plano', 'ahora', 'alerta-nueva', 'automatizacion', 'aprender', 'disenador'].includes(s)) continue;
      await page.goto(url + '#' + s);
      await page.waitForTimeout(350);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (over > 1) problems.push(`${name}/${s}: se corre ${over}px a la derecha`);
      await page.screenshot({ path: path.join(out, `${name}-${s}.png`) });
    }
    if (name === 'pc') {
      // Interacciones: vista previa en vivo, cambiar de símbolo, unir espacios, agregar bloque.
      await page.goto(url + '#simbolo'); await page.waitForTimeout(200);
      const before = await page.locator('.sym.sel').boundingBox();
      await page.locator('#n-size').fill('160'); await page.locator('#n-size').dispatchEvent('input');
      const after = await page.locator('.sym.sel').boundingBox();
      if (!(after.width > before.width * 1.4)) problems.push('tamaño: el símbolo no creció en vivo');
      await page.locator('.sym[aria-label="Maceta"]').click();
      if ((await page.locator('#sym-name').inputValue()) !== 'Maceta') problems.push('tocar otro símbolo no cambió la ficha');
      await page.locator('[data-act="color:#D0453A"]').click();
      await page.goto(url + '#plano'); await page.waitForTimeout(200);
      await page.locator('[data-act="ptool:merge"]').click();
      await page.locator('#side [data-act="space:bano"]').click(); await page.locator('#side [data-act="space:balcon"]').click();
      if (await page.locator('#side [data-act="space:balcon"]').count()) problems.push('unir: Balcón sigue como espacio aparte');
      await page.screenshot({ path: path.join(out, 'pc-plano-unido.png') });
      await page.goto(url + '#ahora'); await page.waitForTimeout(200);
      await page.locator('[data-act="w-add"]').click(); await page.locator('[data-act="w-new:grafico"]').click();
      if ((await page.locator('.w').count()) !== 6) problems.push('Ahora: no se agregó el bloque');
      await page.goto(url + '#vista'); await page.waitForTimeout(200);
      await page.locator('#r-zoom').fill('2.2'); await page.locator('#r-zoom').dispatchEvent('input');
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(out, 'pc-vista-zoom.png') });
      // Indicadores: mover el valor de prueba cambia el anillo del plano.
      await page.goto(url + '#indicadores'); await page.waitForTimeout(200);
      const ring = () => page.locator('.sym[aria-label="Cortina"] .fx-ring').getAttribute('style');
      const r1 = await ring(); await page.locator('#fx-test').fill('20'); await page.locator('#fx-test').dispatchEvent('input');
      if ((await ring()) === r1) problems.push('indicadores: el anillo no cambió en vivo');
      await page.screenshot({ path: path.join(out, 'pc-indicadores-20.png') });
      // Menú: abre a la izquierda y lleva a Controles.
      await page.goto(url + '#inicio'); await page.waitForTimeout(150);
      await page.locator('[data-act="navopen"]').click(); await page.screenshot({ path: path.join(out, 'pc-menu.png') });
      await page.locator('[data-act="nav:set|rf"]').click();
      if (!(await page.locator('.side h2', { hasText: 'Controles' }).count())) problems.push('menú: no abrió Controles');
      // Aprender: llegan botones; probar: enviar y responder.
      await page.goto(url + '#aprender'); await page.waitForTimeout(4200);
      if ((await page.locator('.capcard').count()) < 1) problems.push('aprender: no aparecieron botones');
      await page.screenshot({ path: path.join(out, 'pc-aprender-4s.png') });
      await page.goto(url + '#probar'); await page.waitForTimeout(150);
      await page.locator('[data-act="rftest:0"]').first().click(); await page.locator('[data-act="rfok:0:0"]').click();
      if (!(await page.locator('.tune').count())) problems.push('probar: no aparecen los ajustes al decir que no reaccionó');
      await page.screenshot({ path: path.join(out, 'pc-probar-ajuste.png') });
      await page.goto(url + '#disenador'); await page.waitForTimeout(150);
      await page.locator('[data-act="esel:e3"]').click();
      if (!(await page.locator('.rel.sel[data-e="e3"]').count())) problems.push('diseñador: no se elige el elemento');
      await page.goto(url + '#guia'); await page.waitForTimeout(200);
      await page.locator('[data-act="g-next"]').click(); await page.locator('[data-act="g-next"]').click();
      await page.screenshot({ path: path.join(out, 'pc-guia-3.png') });
    }
    await page.close();
  }
  await browser.close();
  console.log(problems.length ? problems.join('\n') : 'sin problemas');
})();
