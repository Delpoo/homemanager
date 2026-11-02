import { test, expect } from '../browser/local-test.mjs';

test('room mask clones a concave L with ancestor transforms and leaves the source unchanged', async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  const result = await page.evaluate(async () => {
    const { sanitizeArchitecture, createRoomHighlight } = await import('/.work/card/geometry.js');
    const { svg } = sanitizeArchitecture(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 200 200"><g transform="translate(15 25)"><path id="room-l" d="M0 0H100V40H40V100H0Z" fill="none" opacity="0"/></g></svg>',
    );
    document.body.append(svg);
    const before = svg.outerHTML,
      highlight = createRoomHighlight(svg, 'l');
    document.body.append(highlight);
    const path = highlight.querySelector('mask path');
    return {
      unchanged: before === svg.outerHTML,
      box: highlight.getAttribute('viewBox'),
      transform: highlight.querySelector('.room-contour [transform]').getAttribute('transform'),
      shape: path.getAttribute('d'),
      inL: path.isPointInFill(new DOMPoint(20, 80)),
      inNotch: path.isPointInFill(new DOMPoint(80, 80)),
      mask: !!highlight.querySelector('mask path'),
      noRoom: createRoomHighlight(svg, 'missing'),
    };
  });
  expect(result).toEqual({
    unchanged: true,
    box: '10 20 200 200',
    transform: 'translate(15 25)',
    shape: 'M0 0H100V40H40V100H0Z',
    inL: true,
    inNotch: false,
    mask: true,
    noRoom: null,
  });
  // The contour is stroke-only; its geometry remains exactly the concave path.
});
