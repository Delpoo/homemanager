import { t } from '../i18n/index.js';
import { type RoomId } from './types.js';

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Camera {
  x: number;
  y: number;
  scale: number;
}
export interface Point {
  x: number;
  y: number;
}
const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
export const ARCHITECTURE_MAX_BYTES = 1024 * 1024;
const ELEMENTS = new Set([
  'svg',
  'g',
  'defs',
  'symbol',
  'use',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'title',
  'desc',
  'clipPath',
  'mask',
  'linearGradient',
  'radialGradient',
  'stop',
  'pattern',
  'marker',
  'style',
]);
const PRESENTATION = new Set([
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-stretch',
  'letter-spacing',
  'word-spacing',
  'text-anchor',
  'dominant-baseline',
  'display',
  'visibility',
  'clip-path',
  'mask',
  'paint-order',
  'vector-effect',
  'stop-color',
  'stop-opacity',
  'marker-start',
  'marker-mid',
  'marker-end',
  'shape-rendering',
  'text-rendering',
]);
const ATTRIBUTES = new Set([
  'id',
  'class',
  'style',
  'viewBox',
  'preserveAspectRatio',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'width',
  'height',
  'd',
  'points',
  'transform',
  'dx',
  'dy',
  'rotate',
  'textLength',
  'lengthAdjust',
  'href',
  'offset',
  'gradientUnits',
  'gradientTransform',
  'spreadMethod',
  'fx',
  'fy',
  'fr',
  'patternUnits',
  'patternContentUnits',
  'patternTransform',
  'maskUnits',
  'maskContentUnits',
  'clipPathUnits',
  'markerUnits',
  'markerWidth',
  'markerHeight',
  'refX',
  'refY',
  'orient',
  ...PRESENTATION,
]);
const ID = /^[A-Za-z0-9_][A-Za-z0-9_.:-]*$/;
const NUMBERS = new Set([
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'width',
  'height',
  'dx',
  'dy',
  'rotate',
  'textLength',
  'offset',
  'fx',
  'fy',
  'fr',
  'markerWidth',
  'markerHeight',
  'refX',
  'refY',
]);
const PRESENTATION_NUMBERS = new Set([
  'fill-opacity',
  'stroke-width',
  'stroke-opacity',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
  'font-size',
  'font-weight',
  'letter-spacing',
  'word-spacing',
  'stop-opacity',
]);
const NUMBER = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?`;
const NUMERIC_LIST = new RegExp(`^(?:\\s*(?:${NUMBER})(?:%|px|pt|pc|mm|cm|in|em|ex)?[\\s,]*)+$`);
function finiteNumbers(value: string): boolean {
  return [...value.matchAll(new RegExp(NUMBER, 'g'))].every(match => Number.isFinite(Number(match[0])));
}
function finitePresentation(property: string, value: string): boolean {
  return !PRESENTATION_NUMBERS.has(property) || finiteNumbers(value);
}
function validTransform(value: string): boolean {
  const expression = /\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)\s*/g;
  let end = 0,
    count = 0;
  for (const match of value.matchAll(expression)) {
    if (match.index !== end) return false;
    const values = match[2].trim().split(/[\s,]+/);
    if (!values.length || values.some(item => !new RegExp(`^${NUMBER}$`).test(item) || !Number.isFinite(Number(item))))
      return false;
    const arity = values.length,
      name = match[1];
    if (
      name === 'matrix'
        ? arity !== 6
        : name === 'rotate'
          ? ![1, 3].includes(arity)
          : name === 'skewX' || name === 'skewY'
            ? arity !== 1
            : ![1, 2].includes(arity)
    )
      return false;
    end = match.index + match[0].length;
    count++;
  }
  return count > 0 && end === value.length;
}
function safeValue(value: string): boolean {
  if (
    /[\\<>@]|\/\*|javascript\s*:|(?:https?|data|blob|file)\s*:|\/\/|(?:var|env|image|image-set|expression)\s*\(/i.test(
      value,
    )
  )
    return false;
  let remainder = value;
  for (const match of value.matchAll(/url\s*\(([^)]*)\)/gi)) {
    const id = match[1].trim().replace(/^(['"])(.*)\1$/, '$2');
    if (!id.startsWith('#') || !ID.test(id.slice(1))) return false;
    remainder = remainder.replace(match[0], '');
  }
  return !/url/i.test(remainder);
}
export function parseViewBox(value: string | null): ViewBox {
  const numbers = (value ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    numbers.length !== 4 ||
    numbers.some(number => !Number.isFinite(number)) ||
    numbers[2] <= 0 ||
    numbers[3] <= 0 ||
    !Number.isFinite(numbers[0] + numbers[2]) ||
    !Number.isFinite(numbers[1] + numbers[3])
  )
    throw new Error(t('El SVG requiere un viewBox finito con dimensiones positivas.'));
  return { x: numbers[0], y: numbers[1], width: numbers[2], height: numbers[3] };
}
export function fitCamera(bounds: ViewBox, viewport: { width: number; height: number }, padding = 32): Camera {
  if (
    ![bounds.x, bounds.y, bounds.width, bounds.height, viewport.width, viewport.height, padding].every(
      Number.isFinite,
    ) ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    padding < 0
  )
    throw new Error(t('No se puede encuadrar una región sin dimensiones válidas.'));
  const scale = Math.min(
    Math.max(1, viewport.width - padding * 2) / bounds.width,
    Math.max(1, viewport.height - padding * 2) / bounds.height,
  );
  const camera = {
    scale,
    x: viewport.width / 2 - (bounds.x + bounds.width / 2) * scale,
    y: viewport.height / 2 - (bounds.y + bounds.height / 2) * scale,
  };
  if (![camera.x, camera.y, camera.scale].every(Number.isFinite) || camera.scale <= 0)
    throw new Error(t('Las dimensiones exceden el rango de encuadre.'));
  return camera;
}
export function zoomCamera(camera: Camera, factor: number, point: Point, min: number, max: number): Camera {
  if (
    ![camera.x, camera.y, camera.scale, factor, point.x, point.y, min, max].every(Number.isFinite) ||
    camera.scale <= 0 ||
    factor <= 0 ||
    min <= 0 ||
    max < min
  )
    throw new Error(t('Zoom no válido.'));
  const scale = Math.max(min, Math.min(max, camera.scale * factor)),
    ratio = scale / camera.scale;
  const next = { scale, x: point.x - (point.x - camera.x) * ratio, y: point.y - (point.y - camera.y) * ratio };
  if (![next.x, next.y, next.scale].every(Number.isFinite))
    throw new Error(t('El zoom excede el rango de coordenadas.'));
  return next;
}
/** Camera maps SVG global coordinates into viewport pixels, including viewBox
 * origin. Inverse of screen.x = camera.x + (box.x + normalized.x*box.width)*scale. */
export function normalizedPoint(point: Point, camera: Camera, box: ViewBox): Point {
  if (
    ![point.x, point.y, camera.x, camera.y, camera.scale, box.x, box.y, box.width, box.height].every(Number.isFinite) ||
    camera.scale <= 0 ||
    box.width <= 0 ||
    box.height <= 0
  )
    throw new Error(t('Coordenadas no válidas.'));
  return {
    x: Math.min(1, Math.max(0, ((point.x - camera.x) / camera.scale - box.x) / box.width)),
    y: Math.min(1, Math.max(0, ((point.y - camera.y) / camera.scale - box.y) / box.height)),
  };
}

interface Declaration {
  property: string;
  value: string;
  important: boolean;
}
class StyleBudgetError extends Error {}
const STYLE_LIMITS = { rules: 1000, selectors: 2000, applications: 250000, visits: 5000000 } as const;
function declarations(css: string): { values: Declaration[]; removed: number } {
  const parser = document.createElement('span').style;
  parser.cssText = css;
  const values: Declaration[] = [];
  let removed = 0;
  for (const property of [...parser]) {
    const value = parser.getPropertyValue(property).trim();
    if (!PRESENTATION.has(property) || !safeValue(value) || !finitePresentation(property, value)) {
      removed++;
      continue;
    }
    values.push({ property, value, important: parser.getPropertyPriority(property) === 'important' });
  }
  return { values, removed };
}
/** Static tag, class and ID selectors, optionally joined by descendant/child.
 * No attributes, pseudo selectors, escapes, nesting or at-rules are supported. */
function selectorAllowed(selector: string): boolean {
  const simple = String.raw`(?:[A-Za-z][A-Za-z0-9-]*|\*)?(?:[.#][A-Za-z_][A-Za-z0-9_-]*)*`;
  return (
    !!selector &&
    selector.length <= 400 &&
    new RegExp(`^${simple}(?:\\s*>?\\s*${simple})*$`).test(selector) &&
    !/[\[\]:+~\\@]/.test(selector)
  );
}
function specificity(selector: string): number {
  return (
    (selector.match(/#/g)?.length ?? 0) * 100 +
    (selector.match(/\./g)?.length ?? 0) * 10 +
    (selector.match(/(?:^|[ >])[A-Za-z]/g)?.length ?? 0)
  );
}
function flattenStyles(root: SVGSVGElement): number {
  const priorities = new WeakMap<Element, Map<string, { important: boolean; weight: number; order: number }>>();
  let removed = 0,
    order = 0;
  const budget = { rules: 0, selectors: 0, applications: 0, visits: 0 },
    nodeCount = 1 + root.querySelectorAll('*').length;
  const exceed = () => {
    throw new StyleBudgetError(t('El SVG excede el presupuesto seguro de estilos.'));
  };
  const charge = (key: keyof typeof STYLE_LIMITS, count: number) => {
    budget[key] += count;
    if (budget[key] > STYLE_LIMITS[key]) exceed();
  };
  const checkApplications = (count: number) => {
    if (budget.applications + count > STYLE_LIMITS.applications) exceed();
  };
  charge('visits', nodeCount);
  const apply = (element: Element, declaration: Declaration, weight: number) => {
    charge('applications', 1);
    let map = priorities.get(element);
    if (!map) {
      map = new Map();
      priorities.set(element, map);
    }
    const previous = map.get(declaration.property),
      next = { important: declaration.important, weight, order: ++order };
    if (
      !previous ||
      Number(next.important) > Number(previous.important) ||
      (next.important === previous.important &&
        (next.weight > previous.weight || (next.weight === previous.weight && next.order > previous.order)))
    ) {
      element.setAttribute(declaration.property, declaration.value);
      map.set(declaration.property, next);
    }
  };
  for (const style of [...root.querySelectorAll('style')]) {
    const source = style.textContent ?? '';
    // Reject the complete stylesheet before parsing if it requests executable or
    // external facilities. The constructed sheet is never adopted into a page.
    if (/@|\\|\/\*/.test(source)) {
      removed++;
      style.remove();
      continue;
    }
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(source);
      charge('rules', sheet.cssRules.length);
      for (const rule of [...sheet.cssRules]) {
        if (rule.type !== CSSRule.STYLE_RULE) {
          removed++;
          continue;
        }
        const styleRule = rule as CSSStyleRule,
          parsed = declarations(styleRule.style.cssText);
        removed += parsed.removed;
        const selectors = styleRule.selectorText.split(',').map(value => value.trim());
        charge('selectors', selectors.length);
        for (const selector of selectors) {
          if (!selectorAllowed(selector)) {
            removed++;
            continue;
          }
          if (!parsed.values.length) continue;
          // Charge the worst-case node scan BEFORE running a selector. Bounds
          // apply to the whole document, across every style and inline rule.
          charge('visits', nodeCount);
          let matches: Element[] = [];
          try {
            matches = [...(root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector)];
          } catch {
            removed++;
            continue;
          }
          checkApplications(matches.length * parsed.values.length);
          for (const element of matches)
            for (const declaration of parsed.values) apply(element, declaration, specificity(selector));
        }
      }
    } catch (error) {
      if (error instanceof StyleBudgetError) throw error;
      removed++;
    }
    style.remove();
  }
  charge('visits', nodeCount);
  for (const element of [root, ...root.querySelectorAll('*')]) {
    const inline = element.getAttribute('style');
    if (inline) {
      const parsed = declarations(inline);
      removed += parsed.removed;
      checkApplications(parsed.values.length);
      for (const declaration of parsed.values) apply(element, declaration, 1000);
    }
    element.removeAttribute('style');
    element.removeAttribute('class');
  }
  return removed;
}
function internalRefs(element: Element): string[] {
  const refs: string[] = [];
  for (const attr of [...element.attributes]) {
    if (attr.localName === 'href') refs.push(attr.value.slice(1));
    for (const match of attr.value.matchAll(/url\s*\(\s*['"]?#([A-Za-z0-9_.:-]+)['"]?\s*\)/gi)) refs.push(match[1]);
  }
  return refs;
}
function checkReferences(root: SVGSVGElement, ids: Map<string, Element>): void {
  for (const element of [root, ...root.querySelectorAll('*')])
    for (const reference of internalRefs(element))
      if (!ids.has(reference)) throw new Error(`Referencia SVG interna inexistente: ${reference}.`);
  // Multiplicity matters: two references to the same subtree double its render
  // cost even when the graph has no cycle. Bound expanded geometry, not just XML.
  const active = new Set<Element>();
  const memo = new Map<Element, { count: number; references: number }>();
  const visit = (node: Element, calls = 0): { count: number; references: number } => {
    if (active.has(node)) throw new Error(t('El SVG contiene referencias internas cíclicas.'));
    if (calls > 128) throw new Error(t('SVG demasiado profundo.'));
    const cached = memo.get(node);
    if (cached) return cached;
    active.add(node);
    let count = 1,
      references = 0;
    const edges = [
      ...[...node.children].map(child => ({ child, reference: 0 })),
      ...internalRefs(node).map(id => ({ child: ids.get(id)!, reference: 1 })),
    ];
    for (const { child, reference } of edges) {
      const cost = visit(child, calls + 1);
      count += cost.count;
      references = Math.max(references, cost.references + reference);
      if (count > 20000 || references > 32) throw new Error(t('SVG demasiado profundo.'));
    }
    active.delete(node);
    const result = { count, references };
    memo.set(node, result);
    return result;
  };
  visit(root);
}
/** Explicit static-vector profile; sanitizes in the inert XML document BEFORE
 * importNode. Styles become permitted presentation attributes, never live CSS. */
export interface SanitizedArchitecture {
  content: string;
  svg: SVGSVGElement;
  box: ViewBox;
  warnings: string[];
}
// The same plan is validated on setConfig, adapter setup, render and save. Memoize
// the inert sanitized root (keyed by source AND by its clean output, which is a
// fixed point) and hand out a fresh imported copy each time, never the cached node.
const SANITIZED = new Map<string, { root: SVGSVGElement; content: string; box: ViewBox; warnings: string[] }>();
export function sanitizeArchitecture(source: string): SanitizedArchitecture {
  const cached = typeof source === 'string' ? SANITIZED.get(source) : undefined;
  if (cached) {
    SANITIZED.delete(source);
    SANITIZED.set(source, cached);
    return {
      content: cached.content,
      svg: document.importNode(cached.root, true),
      box: { ...cached.box },
      warnings: [...cached.warnings],
    };
  }
  const result = sanitizeUncached(source);
  const entry = { root: result.root, content: result.content, box: result.box, warnings: result.warnings };
  SANITIZED.set(source, entry);
  SANITIZED.set(result.content, { ...entry, warnings: [] });
  while (SANITIZED.size > 8) SANITIZED.delete(SANITIZED.keys().next().value!);
  return {
    content: result.content,
    svg: document.importNode(result.root, true),
    box: { ...result.box },
    warnings: [...result.warnings],
  };
}
function sanitizeUncached(source: string): { content: string; root: SVGSVGElement; box: ViewBox; warnings: string[] } {
  if (typeof source !== 'string' || new TextEncoder().encode(source).byteLength > ARCHITECTURE_MAX_BYTES)
    throw new Error(t('El SVG supera el máximo de 1 MiB UTF-8.'));
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error(t('No se permiten DTD ni entidades en el SVG.'));
  const documentXML = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (
    documentXML.querySelector('parsererror') ||
    documentXML.documentElement.localName !== 'svg' ||
    documentXML.documentElement.namespaceURI !== SVG_NS
  )
    throw new Error(t('Se requiere un único documento SVG XML válido.'));
  const root = documentXML.documentElement as unknown as SVGSVGElement,
    box = parseViewBox(root.getAttribute('viewBox'));
  const elements = [root, ...root.querySelectorAll('*')];
  if (elements.length > 20000) throw new Error(t('SVG demasiado complejo: máximo 20000 elementos.'));
  const originalIds = new Set<string>();
  let removed = 0;
  for (const element of elements) {
    let depth = 0;
    for (let parent = element.parentElement; parent; parent = parent.parentElement)
      if (++depth > 64) throw new Error(t('SVG demasiado profundo.'));
    const id = element.getAttribute('id');
    if (id !== null && (!ID.test(id) || originalIds.has(id)))
      throw new Error(t('El SVG requiere IDs válidos y únicos.'));
    if (id) originalIds.add(id);
    if (element.namespaceURI !== SVG_NS || !ELEMENTS.has(element.localName)) {
      element.remove();
      removed++;
      continue;
    }
    for (const attr of [...element.attributes]) {
      const name = attr.localName,
        value = attr.value.trim();
      if (attr.namespaceURI === 'http://www.w3.org/2000/xmlns/') continue;
      if (attr.namespaceURI === XML_NS && name === 'space' && /^(preserve|default)$/.test(value)) continue;
      if (
        (attr.namespaceURI && !(attr.namespaceURI === XLINK_NS && name === 'href')) ||
        !ATTRIBUTES.has(name) ||
        /^on/i.test(name)
      ) {
        element.removeAttributeNode(attr);
        removed++;
        continue;
      }
      if (name === 'href' && (!value.startsWith('#') || !ID.test(value.slice(1)))) {
        element.removeAttributeNode(attr);
        removed++;
        continue;
      }
      if (name === 'style' || name === 'class') continue;
      if (!safeValue(value)) {
        element.removeAttributeNode(attr);
        removed++;
        continue;
      }
      if (NUMBERS.has(name) && (!NUMERIC_LIST.test(value) || !finiteNumbers(value)))
        throw new Error(t('Atributo geométrico SVG no válido: {name}.', { name }));
      if (
        ['d', 'points'].includes(name) &&
        (!/^[MmZzLlHhVvCcSsQqTtAaEe0-9+.,\s-]*$/.test(value) || !finiteNumbers(value))
      )
        throw new Error(t('Trazado SVG no válido.'));
      if (/^(?:transform|gradientTransform|patternTransform)$/.test(name) && !validTransform(value))
        throw new Error(t('Transformación SVG no válida.'));
      if (PRESENTATION.has(name) && !finitePresentation(name, value)) throw new Error(t('Presentación SVG no finita.'));
    }
  }
  removed += flattenStyles(root);
  const ids = new Map<string, Element>();
  for (const element of [root, ...root.querySelectorAll('*')]) {
    const id = element.getAttribute('id');
    if (id) ids.set(id, element);
  }
  checkReferences(root, ids);
  root.setAttribute('width', String(box.width));
  root.setAttribute('height', String(box.height));
  const content = new XMLSerializer().serializeToString(root);
  // Presentation-only attributes for the live node; kept out of the persisted
  // content so that re-sanitizing a saved plan is a silent fixed point.
  root.setAttribute('aria-hidden', 'true');
  root.setAttribute('focusable', 'false');
  if (new TextEncoder().encode(content).byteLength > ARCHITECTURE_MAX_BYTES)
    throw new Error(t('El SVG sanitizado supera 1 MiB.'));
  return {
    content,
    root,
    box,
    warnings: removed ? [`${removed} elementos, atributos o reglas fuera del perfil vectorial fueron eliminados.`] : [],
  };
}
const ZONE_PREFIX = 'room-';
function roomZone(svg: SVGSVGElement, roomId: RoomId): SVGGraphicsElement | null {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(roomId)) return null;
  return (
    [...svg.querySelectorAll<SVGGraphicsElement>('[id]')].find(element => element.id === `${ZONE_PREFIX}${roomId}`) ??
    null
  );
}
/** Candidate spaces found in a sanitized plan: every element whose ID follows the
 * `room-${id}` convention, in document order, with its <title> as label hint.
 * Detection only proposes; the instance decides which zones become spaces. */
export function detectZones(svg: SVGSVGElement): { id: string; label: string | null }[] {
  const zones: { id: string; label: string | null }[] = [];
  for (const element of svg.querySelectorAll('[id]')) {
    if (!element.id.startsWith(ZONE_PREFIX)) continue;
    const id = element.id.slice(ZONE_PREFIX.length);
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) ||
      ['__proto__', 'prototype', 'constructor'].includes(id) ||
      zones.some(zone => zone.id === id)
    )
      continue;
    const title = [...element.children].find(child => child.localName === 'title')?.textContent?.trim();
    zones.push({ id, label: title ? title.slice(0, 240) : null });
  }
  return zones;
}
export function roomBounds(svg: SVGSVGElement, roomId: RoomId): ViewBox | null {
  const zone = roomZone(svg, roomId);
  if (!zone) return null;
  try {
    const bounds = zone.getBBox(),
      matrix = zone.getCTM(),
      rootMatrix = svg.getCTM();
    if (!matrix || !rootMatrix || bounds.width <= 0 || bounds.height <= 0) return null;
    const transform = rootMatrix.inverse().multiply(matrix);
    const points = [
      [bounds.x, bounds.y],
      [bounds.x + bounds.width, bounds.y],
      [bounds.x, bounds.y + bounds.height],
      [bounds.x + bounds.width, bounds.y + bounds.height],
    ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(transform));
    const x = Math.min(...points.map(point => point.x)),
      y = Math.min(...points.map(point => point.y)),
      right = Math.max(...points.map(point => point.x)),
      bottom = Math.max(...points.map(point => point.y)),
      width = right - x,
      height = bottom - y;
    return [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0 ? { x, y, width, height } : null;
  } catch {
    return null;
  }
}
/** Actual geometry hit-testing, including grouped/concave/transformed shapes.
 * Ambiguous overlaps, missing geometry and bounding-box-only evidence return null. */
export function roomAt(svg: SVGSVGElement, normalized: Point, box: ViewBox, roomIds: readonly RoomId[]): RoomId | null {
  if (
    ![normalized.x, normalized.y].every(Number.isFinite) ||
    normalized.x < 0 ||
    normalized.x > 1 ||
    normalized.y < 0 ||
    normalized.y > 1
  )
    return null;
  const point = new DOMPoint(box.x + normalized.x * box.width, box.y + normalized.y * box.height),
    matches = new Set<RoomId>();
  for (const id of roomIds) {
    const zone = roomZone(svg, id);
    if (!zone) continue;
    const shapes =
      zone instanceof SVGGeometryElement
        ? [zone]
        : [...zone.querySelectorAll('*')].filter(
            (element): element is SVGGeometryElement => element instanceof SVGGeometryElement,
          );
    for (const shape of shapes)
      try {
        const matrix = shape.getCTM(),
          rootMatrix = svg.getCTM();
        if (
          matrix &&
          rootMatrix &&
          shape.isPointInFill(point.matrixTransform(rootMatrix.inverse().multiply(matrix).inverse()))
        ) {
          matches.add(id);
          break;
        }
      } catch {
        /* No guess from a rectangle. */
      }
  }
  return matches.size === 1 ? [...matches][0] : null;
}
