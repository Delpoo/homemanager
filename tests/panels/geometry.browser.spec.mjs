import { test, expect } from '../browser/local-test.mjs';

// Deliberately synthetic geometry. These tests contain no instance plan/data.
const fixture = '/tests/browser/fixtures/card.html';

test('acyclic duplicate SVG references cannot expand beyond the rendering budget', async ({ page }) => {
  await page.goto(fixture);
  const result = await page.evaluate(async () => {
    const { sanitizeArchitecture } = await import('/.work/card/geometry.js');
    const plan = levels => {
      let groups = '<g id="n0"><rect width="1" height="1"/></g>';
      for (let i = 1; i <= levels; i++) groups += `<g id="n${i}"><use href="#n${i - 1}"/><use href="#n${i - 1}"/></g>`;
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs>${groups}</defs><use href="#n${levels}"/></svg>`;
    };
    const small = sanitizeArchitecture(plan(3)).content;
    try {
      sanitizeArchitecture(plan(16));
      return { rejected: false, small };
    } catch {
      return { rejected: true, small };
    }
  });
  expect(result.rejected).toBe(true);
  expect(result.small).toContain('use');
});
test.beforeEach(async ({ page }) => {
  await page.goto(fixture);
});

test('static vector styles are flattened before rendering and safe colors survive', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { sanitizeArchitecture } = await import('/.work/card/geometry.js');
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 300 200"><style>rect{fill:#1e9999;stroke:#456;stroke-width:2}.accent{fill:#abc!important}#shape{opacity:.7}</style><defs><linearGradient id="gradient"><stop offset="0%" stop-color="#1e9999"/><stop offset="100%" stop-color="#fff"/></linearGradient></defs><g transform="translate(2 3)"><rect id="shape" class="accent" x="20" y="30" width="50" height="40" style="fill:#fed;stroke-width:3"/><circle id="other" cx="120" cy="80" r="10" fill="url(#gradient)"/></g><text x="25" y="100" font-family="sans-serif">Synthetic vector</text></svg>';
    const output = sanitizeArchitecture(source),
      rect = output.svg.querySelector('#shape');
    document.querySelector('#mount').replaceChildren(output.svg);
    return {
      content: output.content,
      box: output.box,
      fill: rect.getAttribute('fill'),
      stroke: rect.getAttribute('stroke'),
      strokeWidth: rect.getAttribute('stroke-width'),
      opacity: rect.getAttribute('opacity'),
      computedFill: getComputedStyle(rect).fill,
      styleCount: output.svg.querySelectorAll('style,[style],[class]').length,
      gradient: output.svg.querySelector('#other').getAttribute('fill'),
    };
  });
  expect(result.box).toEqual({ x: 10, y: 20, width: 300, height: 200 });
  expect(result.computedFill).toBe('rgb(170, 187, 204)');
  expect(result.strokeWidth).toBe('3');
  expect(Number(result.opacity)).toBe(0.7);
  expect(result.styleCount).toBe(0);
  expect(result.gradient).toBe('url(#gradient)');
  expect(result.content).toContain('stop-color="#1e9999"');
});

test('scripts, HTML, animation, events and external resources never reach the live document', async ({ page }) => {
  const external = [],
    origin = new URL(page.url()).origin;
  page.on('request', request => {
    if (!request.url().startsWith(origin + '/') && !request.url().startsWith('data:')) external.push(request.url());
  });
  const result = await page.evaluate(async () => {
    const { sanitizeArchitecture } = await import('/.work/card/geometry.js');
    window.syntheticAttack = 0;
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100" onload="window.syntheticAttack++" xml:base="https://example.invalid/"><script>window.syntheticAttack++</script><foreignObject x="0" y="0" width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml"><img src="https://example.invalid/html" onerror="window.syntheticAttack++"/></div></foreignObject><image href="https://example.invalid/image"/><a href="https://example.invalid/link"><rect width="2" height="2"/></a><style>@import url(https://example.invalid/css);rect{fill:url(https://example.invalid/paint)}</style><rect id="safe" x="10" y="10" width="30" height="30" onclick="window.syntheticAttack++" style="fill:url(https://example.invalid/fill);filter:url(https://example.invalid/filter);stroke:#123"/><use href="https://example.invalid/remote.svg#x"/><use xlink:href="data:image/svg+xml,abc"/><animate attributeName="href" to="https://example.invalid/animation"/><set attributeName="onload" to="window.syntheticAttack++"/></svg>';
    const output = sanitizeArchitecture(source);
    // Instrument the importing boundary, after the inert sanitizer has finished.
    document.querySelector('#mount').replaceChildren(output.svg);
    output.svg.querySelector('#safe').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      content: output.content,
      attack: window.syntheticAttack,
      warnings: output.warnings,
      unsupported: output.svg.querySelectorAll('script,foreignObject,image,a,style,animate,set').length,
      events: [...output.svg.querySelectorAll('*'), output.svg].flatMap(element =>
        [...element.attributes].filter(attr => /^on/i.test(attr.localName)).map(attr => attr.name),
      ),
      hrefs: [...output.svg.querySelectorAll('use')].map(
        element => element.getAttribute('href') || element.getAttributeNS('http://www.w3.org/1999/xlink', 'href'),
      ),
    };
  });
  expect(result.attack).toBe(0);
  expect(result.unsupported).toBe(0);
  expect(result.events).toEqual([]);
  expect(result.hrefs.every(value => value === null)).toBe(true);
  expect(result.warnings.length).toBeGreaterThan(0);
  expect(result.content).not.toContain('example.invalid');
  expect(result.content).not.toContain('xml:base');
  expect(external).toEqual([]);
});

test('sanitization rejects malformed XML, duplicate IDs, unresolved or cyclic references and nonfinite geometry', async ({
  page,
}) => {
  const failures = await page.evaluate(async () => {
    const { sanitizeArchitecture } = await import('/.work/card/geometry.js');
    const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 100 100">${body}</svg>`;
    const cases = {
      dtd: '<!DOCTYPE svg [<!ENTITY injected "x">]>' + svg('<text>&injected;</text>'),
      roots: svg('') + svg(''),
      namespace: '<svg viewBox="0 0 100 100"/>',
      missingViewBox: '<svg xmlns="http://www.w3.org/2000/svg"/>',
      zeroViewBox: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 100"/>',
      nonfiniteViewBox: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="1e308 0 1e308 100"/>',
      duplicate: svg('<rect id="same"/><circle id="same"/>'),
      emptyId: svg('<rect id=""/>'),
      missingUse: svg('<use href="#absent"/>'),
      missingPaint: svg('<rect fill="url(#absent)"/>'),
      selfUse: svg('<g id="self"><use href="#self"/></g>'),
      referenceCycle: svg('<defs><linearGradient id="a" href="#b"/><linearGradient id="b" href="#a"/></defs>'),
      nonfiniteCoordinate: svg('<rect width="1e999" height="10"/>'),
      nonfinitePresentation: svg('<path stroke-width="1e999"/>'),
      nonfinitePath: svg('<path d="M0 0 L1e999 3"/>'),
      badTransform: svg('<g transform="matrix(1 2 3)"/>'),
      nonfiniteTransform: svg('<g transform="translate(1e999 2)"/>'),
    };
    return Object.fromEntries(
      Object.entries(cases).map(([name, source]) => {
        try {
          sanitizeArchitecture(source);
          return [name, false];
        } catch {
          return [name, true];
        }
      }),
    );
  });
  expect(Object.entries(failures).filter(([, failed]) => !failed)).toEqual([]);
});

test('internal references stay local and dangerous CSS facilities are removed', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { sanitizeArchitecture } = await import('/.work/card/geometry.js');
    const output = sanitizeArchitecture(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100"><defs><path id="shape" d="M0 0H10V10Z"/><clipPath id="clip"><rect width="30" height="30"/></clipPath></defs><style>rect{fill:red;animation:evil 1s;filter:url(#clip);cursor:url(https://example.invalid/cursor),auto}rect:hover{stroke:black}</style><use xlink:href="#shape" x="20" y="20"/><rect id="clipped" width="40" height="40" clip-path="url(#clip)" style="fill:var(--bad);stroke:#1e9999"/></svg>',
    );
    document.querySelector('#mount').replaceChildren(output.svg);
    return {
      content: output.content,
      use: output.svg.querySelector('use').getAttributeNS('http://www.w3.org/1999/xlink', 'href'),
      clip: output.svg.querySelector('#clipped').getAttribute('clip-path'),
      fill: output.svg.querySelector('#clipped').getAttribute('fill'),
      stroke: getComputedStyle(output.svg.querySelector('#clipped')).stroke,
    };
  });
  expect(result.use).toBe('#shape');
  expect(result.clip).toBe('url(#clip)');
  expect(result.fill).toBe('red');
  expect(result.stroke).toBe('rgb(30, 153, 153)');
  expect(result.content).not.toMatch(/style=|<style|animation|filter=|cursor=|var\(/);
});

test('UTF-8 size, element count and nesting limits are enforced before importing', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { sanitizeArchitecture, ARCHITECTURE_MAX_BYTES } = await import('/.work/card/geometry.js');
    const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;
    const cases = {
      utf8: svg('<desc>' + 'ñ'.repeat(ARCHITECTURE_MAX_BYTES / 2) + '</desc>'),
      elements: svg('<g/>'.repeat(20001)),
      depth: svg('<g>'.repeat(66) + '</g>'.repeat(66)),
    };
    return Object.fromEntries(
      Object.entries(cases).map(([name, source]) => {
        try {
          sanitizeArchitecture(source);
          return [name, false];
        } catch {
          return [name, true];
        }
      }),
    );
  });
  expect(result).toEqual({ utf8: true, elements: true, depth: true });
});

test('compact adversarial styles exceed global rule, selector, application or node-scan budgets', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { sanitizeArchitecture, ARCHITECTURE_MAX_BYTES } = await import('/.work/card/geometry.js');
    const svg = (styles, body = '') =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${styles}${body}</svg>`;
    const declarations =
      'fill:red;stroke:blue;opacity:.8;fill-opacity:.8;stroke-opacity:.8;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:4;stroke-dasharray:2 4;stroke-dashoffset:1;color:green;font-family:serif;font-size:12px;font-weight:400;font-style:normal;letter-spacing:1px;word-spacing:1px;text-anchor:start;dominant-baseline:auto;visibility:visible;paint-order:normal;vector-effect:non-scaling-stroke;stop-color:red;stop-opacity:.5;shape-rendering:auto;text-rendering:auto';
    const cases = {
      rules: svg(
        '<style>' +
          Array.from({ length: 501 }, (_, i) => `.unused${i}{fill:red}`).join('') +
          '</style><style>' +
          Array.from({ length: 500 }, (_, i) => `.other${i}{fill:red}`).join('') +
          '</style>',
      ),
      selectors: svg(
        '<style>' + Array.from({ length: 2001 }, (_, i) => `.unused${i}`).join(',') + '{fill:red}</style>',
      ),
      applications: svg('<style>rect{' + declarations + '}</style>', '<rect/>'.repeat(10000)),
      scans: svg(
        '<style>' + Array.from({ length: 1100 }, (_, i) => `.unused${i}`).join(',') + '{fill:red}</style>',
        '<rect/>'.repeat(5000),
      ),
    };
    return Object.fromEntries(
      Object.entries(cases).map(([name, source]) => {
        try {
          sanitizeArchitecture(source);
          return [
            name,
            {
              withinByteLimit: new TextEncoder().encode(source).byteLength < ARCHITECTURE_MAX_BYTES,
              budgetRejected: false,
            },
          ];
        } catch (error) {
          return [
            name,
            {
              withinByteLimit: new TextEncoder().encode(source).byteLength < ARCHITECTURE_MAX_BYTES,
              budgetRejected: /presupuesto seguro de estilos/.test(error.message),
            },
          ];
        }
      }),
    );
  });
  for (const value of Object.values(result)) expect(value).toEqual({ withinByteLimit: true, budgetRejected: true });
});

test('global camera coordinates roundtrip a nonzero-origin viewBox and zoom preserves the focal point', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { parseViewBox, fitCamera, normalizedPoint, zoomCamera } = await import('/.work/card/geometry.js');
    const box = parseViewBox('10 20 300 200'),
      camera = fitCamera(box, { width: 900, height: 640 }, 20),
      normalized = { x: 0.37, y: 0.61 };
    const point = {
      x: camera.x + (box.x + normalized.x * box.width) * camera.scale,
      y: camera.y + (box.y + normalized.y * box.height) * camera.scale,
    };
    const zoom = zoomCamera(camera, 1.8, point, 0.1, 30);
    return {
      box,
      camera,
      roundtrip: normalizedPoint(point, camera, box),
      zoomRoundtrip: normalizedPoint(point, zoom, box),
      center: {
        x: camera.x + (box.x + box.width / 2) * camera.scale,
        y: camera.y + (box.y + box.height / 2) * camera.scale,
      },
      clamp: normalizedPoint({ x: -10000, y: 10000 }, camera, box),
      zoomLimit: zoomCamera(camera, 10000, point, 0.1, 4).scale,
    };
  });
  expect(result.roundtrip.x).toBeCloseTo(0.37, 10);
  expect(result.roundtrip.y).toBeCloseTo(0.61, 10);
  expect(result.zoomRoundtrip.x).toBeCloseTo(0.37, 10);
  expect(result.zoomRoundtrip.y).toBeCloseTo(0.61, 10);
  expect(result.center).toEqual({ x: 450, y: 320 });
  expect(result.clamp).toEqual({ x: 0, y: 1 });
  expect(result.zoomLimit).toBe(4);
});

test('room bounds include ancestor and zone transforms without substituting missing geometry', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { sanitizeArchitecture, roomBounds } = await import('/.work/card/geometry.js');
    const output = sanitizeArchitecture(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 300 200"><g transform="translate(40 60)"><g id="room-living" transform="scale(2)"><rect x="5" y="10" width="30" height="20"/></g></g><g id="room-office"/><path id="room-kitchen" d="M100 40h50v30h-50Z" transform="rotate(90 100 40)"/></svg>',
    );
    document.querySelector('#mount').replaceChildren(output.svg);
    return {
      living: roomBounds(output.svg, 'living'),
      kitchen: roomBounds(output.svg, 'kitchen'),
      office: roomBounds(output.svg, 'office'),
      missing: roomBounds(output.svg, 'balcony'),
    };
  });
  expect(result.living).toEqual({ x: 50, y: 80, width: 60, height: 40 });
  expect(result.kitchen.x).toBeCloseTo(70, 8);
  expect(result.kitchen.y).toBeCloseTo(40, 8);
  expect(result.kitchen.width).toBeCloseTo(30, 8);
  expect(result.kitchen.height).toBeCloseTo(50, 8);
  expect(result.office).toBeNull();
  expect(result.missing).toBeNull();
});

test('room hit-testing respects concave paths, grouped shapes, transforms and ambiguous overlaps', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { sanitizeArchitecture, roomAt } = await import('/.work/card/geometry.js');
    const output = sanitizeArchitecture(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 300 200"><g transform="translate(20 30)"><g id="room-living"><path d="M0 0H100V30H30V100H0Z"/></g></g><g id="room-kitchen" transform="translate(180 40)"><rect width="30" height="30"/><circle cx="50" cy="60" r="15"/></g><g id="room-office"><rect x="180" y="40" width="10" height="10"/></g></svg>',
    );
    document.querySelector('#mount').replaceChildren(output.svg);
    const rooms = ['living', 'kitchen', 'office'];
    const at = (x, y, ids = rooms) =>
      roomAt(
        output.svg,
        { x: (x - output.box.x) / output.box.width, y: (y - output.box.y) / output.box.height },
        output.box,
        ids,
      );
    // Only configured spaces participate: without 'office' the overlap is no longer ambiguous.
    return {
      lArm: at(35, 90),
      lTop: at(90, 40),
      concaveHole: at(90, 90),
      groupCircle: at(230, 100),
      groupGap: at(220, 75),
      ambiguous: at(185, 45),
      onlyConfigured: at(185, 45, ['living', 'kitchen']),
      unconfigured: at(35, 90, ['kitchen']),
      outside: roomAt(output.svg, { x: -0.1, y: 0.5 }, output.box, rooms),
    };
  });
  expect(result).toEqual({
    lArm: 'living',
    lTop: 'living',
    concaveHole: null,
    groupCircle: 'kitchen',
    groupGap: null,
    ambiguous: null,
    onlyConfigured: 'kitchen',
    unconfigured: null,
    outside: null,
  });
});

test('memoized sanitization returns independent nodes and its output is a fixed point', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { sanitizeArchitecture } = await import('/.work/card/geometry.js');
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>.a{fill:red}</style><rect id="room-a" class="a" width="5" height="5" onclick="x()"/></svg>';
    const fresh = (await import('/.work/card/geometry.js?uncached')).sanitizeArchitecture;
    // A separate module instance has an empty cache, so this really re-sanitizes the output.
    const first = sanitizeArchitecture(source),
      second = sanitizeArchitecture(source),
      again = fresh(first.content);
    first.svg.querySelector('rect').setAttribute('fill', 'blue');
    return {
      distinct: first.svg !== second.svg,
      untouched: second.svg.querySelector('rect').getAttribute('fill'),
      fixedPoint: again.content === first.content,
      warnings: [first.warnings.length, second.warnings.length, again.warnings.length],
    };
  });
  expect(result).toEqual({ distinct: true, untouched: 'red', fixedPoint: true, warnings: [1, 1, 0] });
});
