"""Server-side static SVG profile. No external parser, URLs, CSS or execution."""

from __future__ import annotations

import math
import re
from xml.etree import ElementTree as ET

from .errors import ModelError
from .const import MAX_PLAN_BYTES

SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"
XML_NS = "http://www.w3.org/XML/1998/namespace"
MAX_ELEMENTS = 20_000
MAX_EXPANDED_ELEMENTS = 20_000
MAX_REFERENCE_DEPTH = 32
ELEMENTS = frozenset("svg g defs symbol use path rect circle ellipse line polyline polygon text tspan title desc clipPath mask linearGradient radialGradient stop pattern marker".split())
TAGS = frozenset(f"{{{SVG_NS}}}{name}" for name in ELEMENTS)
PRESENTATION = frozenset("fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity color font-family font-size font-weight font-style font-stretch letter-spacing word-spacing text-anchor dominant-baseline display visibility clip-path mask paint-order vector-effect stop-color stop-opacity marker-start marker-mid marker-end shape-rendering text-rendering".split())
ATTRIBUTES = PRESENTATION | frozenset("id viewBox preserveAspectRatio x y x1 y1 x2 y2 cx cy r rx ry width height d points transform dx dy rotate textLength lengthAdjust href offset gradientUnits gradientTransform spreadMethod fx fy fr patternUnits patternContentUnits patternTransform maskUnits maskContentUnits clipPathUnits markerUnits markerWidth markerHeight refX refY orient".split())
ID = re.compile(r"[A-Za-z0-9_][A-Za-z0-9_.:-]*\Z")
URL = re.compile(r"url\s*\(\s*(['\"]?)#([A-Za-z0-9_][A-Za-z0-9_.:-]*)\1\s*\)", re.I)
UNSAFE_VALUE = re.compile(r"[\\<>@]|/\*|javascript\s*:|(?:https?|data|blob|file|vbscript)\s*:|//|(?:var|env|image|image-set|expression)\s*\(", re.I)
NUMBER = r"[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?"
NUMERIC_LIST = re.compile(rf"(?:\s*(?:{NUMBER})(?:%|px|pt|pc|mm|cm|in|em|ex)?[\s,]*)+\Z")
NUMBERS = frozenset("x y x1 y1 x2 y2 cx cy r rx ry width height dx dy rotate textLength offset fx fy fr markerWidth markerHeight refX refY".split())
PRESENTATION_NUMBERS = frozenset("fill-opacity stroke-width stroke-opacity stroke-miterlimit stroke-dasharray stroke-dashoffset opacity font-size font-weight letter-spacing word-spacing stop-opacity".split())


def _reject() -> None:
    raise ModelError("unsafe_plan", "the plan must be a bounded static SVG; import it through the editor")


def validate_svg(source: str) -> None:
    """Reject active/invalid XML after entity decoding, before storing its bytes."""
    if not isinstance(source, str) or len(source.encode("utf-8")) > MAX_PLAN_BYTES or re.search(r"<!\s*(?:DOCTYPE|ENTITY)|<\?(?!xml\s)", source, re.I):
        _reject()
    try:
        root = ET.fromstring(source)
    except (ET.ParseError, ValueError, RecursionError):
        _reject()
    if root.tag != f"{{{SVG_NS}}}svg":
        _reject()
    try:
        box = [float(value) for value in re.split(r"[\s,]+", root.get("viewBox", "").strip())]
        if len(box) != 4 or not all(math.isfinite(value) for value in box) or box[2] <= 0 or box[3] <= 0 or not math.isfinite(box[0] + box[2]) or not math.isfinite(box[1] + box[3]):
            _reject()
    except ValueError:
        _reject()
    elements = list(root.iter())
    if len(elements) > MAX_ELEMENTS:
        _reject()
    ids: dict[str, ET.Element] = {}
    references: dict[ET.Element, list[str]] = {}
    stack = [(root, 0)]
    while stack:
        node, depth = stack.pop()
        if depth > 64 or node.tag not in TAGS:
            _reject()
        stack.extend((child, depth + 1) for child in node)
        references[node] = []
        for name, raw in node.attrib.items():
            value = raw.strip()
            if name == f"{{{XML_NS}}}space" and value in ("preserve", "default"):
                continue
            if name == f"{{{XLINK_NS}}}href":
                name = "href"
            if name not in ATTRIBUTES or UNSAFE_VALUE.search(value):
                _reject()
            if name in NUMBERS and not NUMERIC_LIST.fullmatch(value):
                _reject()
            if name in NUMBERS | PRESENTATION_NUMBERS | {"d", "points", "transform", "gradientTransform", "patternTransform"}:
                if any(not math.isfinite(float(match[0])) for match in re.finditer(NUMBER, value)):
                    _reject()
            if name in ("d", "points") and not re.fullmatch(r"[MmZzLlHhVvCcSsQqTtAaEe0-9+.,\s-]*", value):
                _reject()
            if name == "id":
                if not ID.fullmatch(value) or value in ids:
                    _reject()
                ids[value] = node
            if name == "href":
                if not value.startswith("#") or not ID.fullmatch(value[1:]):
                    _reject()
                references[node].append(value[1:])
            references[node].extend(match[2] for match in URL.finditer(value))
            if re.search(r"url", URL.sub("", value), re.I):
                _reject()
    if any(ref not in ids for refs in references.values() for ref in refs):
        _reject()
    # Count every reference occurrence, not a set of edges: acyclic doubling is
    # expensive too. Include DOM descendants and stop before arithmetic explodes.
    memo: dict[ET.Element, tuple[int, int]] = {}
    active: set[ET.Element] = set()

    def cost(node: ET.Element, calls: int = 0) -> tuple[int, int]:
        if node in active or calls > 128:
            _reject()
        if node in memo:
            return memo[node]
        active.add(node)
        total, reference_depth = 1, 0
        for child, reference in [(child, 0) for child in node] + [(ids[ref], 1) for ref in references[node]]:
            count, height = cost(child, calls + 1)
            total += count
            reference_depth = max(reference_depth, height + reference)
            if total > MAX_EXPANDED_ELEMENTS or reference_depth > MAX_REFERENCE_DEPTH:
                _reject()
        active.remove(node)
        memo[node] = (total, reference_depth)
        return memo[node]

    cost(root)
