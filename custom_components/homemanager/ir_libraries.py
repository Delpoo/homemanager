"""0.14 · «Mis bibliotecas»: infrared catalog files kept to recognise a remote and bring its buttons.

A library is a parsed Flipper-IRDB, SmartIR or IRremoteESP8266 file with a name, brand and model.
Only the supported signals are kept (name and raw timings). A captured signal is compared with
every kept signal; the closest ones say which library and button it probably is. Codes never
leave Home Assistant: the app gets names, scores and counts.
"""

from __future__ import annotations

import asyncio
from typing import Any
from uuid import uuid4

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .errors import ModelError
from .ir_model import IrSignal
from .remote_catalog import SOURCES, parse_catalog
from .rf_model import _text

DATA_IR_LIBRARIES = "homemanager_ir_libraries"
STORE_KEY = "homemanager.ir_libraries"
MAX_LIBRARIES = 8
# How close two durations must be to count as the same, and the least score worth showing.
TOLERANCE = 0.25
MIN_SCORE = 0.75
COMPARE = 160


def similarity(a: list[int] | tuple[int, ...], b: list[int] | tuple[int, ...]) -> float:
    """Share of durations that agree (within 25 %, or 120 µs for very short ones), over the longer
    of the two, trying a small shift because a capture may start one pulse late."""
    x = [abs(value) for value in a][:COMPARE]
    y = [abs(value) for value in b][:COMPARE]
    if not x or not y:
        return 0.0
    best = 0.0
    for shift in (0, 1, 2):
        for first, second in ((x[shift:], y), (x, y[shift:])):
            pairs = zip(first, second)
            same = sum(abs(p - q) <= max(120, TOLERANCE * max(p, q)) for p, q in pairs)
            best = max(best, same / max(len(first), len(second)))
    return round(best, 3)


def _reachable(n: int, m: int) -> bool:
    """Whether signals of these lengths could still reach MIN_SCORE. The share of agreeing durations
    never beats the shorter over the longer, so another protocol is skipped without comparing a pulse."""
    n, m = min(n, COMPARE), min(m, COMPARE)
    return any(
        a > 0 and b > 0 and min(a, b) >= MIN_SCORE * max(a, b)
        for shift in (0, 1, 2)
        for a, b in ((n - shift, m), (n, m - shift))
    )


def match_items(items: list[dict[str, Any]], timings: tuple[int, ...] | list[int], limit: int = 3) -> list[dict[str, Any]]:
    """The library buttons closest to a captured signal, best first. Pure: it runs off the event loop."""
    found = []
    for item in items:
        # 0.14 · «Reconocer al aprender»: a library switched off is never compared.
        if item.get("recognise") is False:
            continue
        for index, entry in enumerate(item["entries"]):
            if not _reachable(len(timings), len(entry["timings_us"])):
                continue
            score = similarity(timings, entry["timings_us"])
            if score >= MIN_SCORE:
                found.append({"library_id": item["id"], "library": item["name"], "brand": item["brand"],
                              "model": item["model"], "index": index, "entry": entry["name"], "score": score})
    found.sort(key=lambda row: -row["score"])
    return found[:limit]


class IrLibraries:
    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.store: Store[dict[str, Any]] = Store(hass, 1, STORE_KEY)
        self.items: dict[str, dict[str, Any]] = {}
        self.lock = asyncio.Lock()

    async def async_load(self) -> None:
        data = await self.store.async_load()
        items = data.get("libraries") if isinstance(data, dict) else None
        if not isinstance(items, dict):
            return
        for ident, item in items.items():
            try:
                _check(item)
            except (ModelError, KeyError, TypeError, ValueError):
                continue
            self.items[ident] = item

    @staticmethod
    def public(item: dict[str, Any]) -> dict[str, Any]:
        return {key: item[key] for key in ("id", "name", "source", "brand", "model")} | {
            "count": len(item["entries"]), "recognise": item.get("recognise") is not False}

    def list(self) -> list[dict[str, Any]]:
        return [self.public(item) for item in self.items.values()]

    def entries(self, library_id: str) -> list[dict[str, Any]]:
        """Names only, with their index: what the app needs to choose which to bring."""
        item = self._item(library_id)
        return [{"index": index, "name": entry["name"]} for index, entry in enumerate(item["entries"])]

    def signals(self, library_id: str, indexes: list[int]) -> list[tuple[int, str, IrSignal]]:
        item = self._item(library_id)
        if any(not 0 <= index < len(item["entries"]) for index in indexes):
            raise ModelError("invalid_library", "unknown library button")
        return [(index, item["entries"][index]["name"], _signal(item["entries"][index])) for index in indexes]

    def _item(self, library_id: str) -> dict[str, Any]:
        item = self.items.get(library_id)
        if item is None:
            raise ModelError("library_not_found", "unknown library")
        return item

    async def async_add(self, source: str, document: str, name: str, brand: str, model: str) -> dict[str, Any]:
        rows = await self.hass.async_add_executor_job(parse_catalog, source, document)
        entries = [
            {"name": entry, "carrier_hz": signal.carrier_hz, "timings_us": list(signal.timings_us)}
            for entry, signal, _ in rows
            if signal is not None
        ]
        if not entries:
            raise ModelError("invalid_catalog", "the file has no supported infrared signal")
        async with self.lock:
            if len(self.items) >= MAX_LIBRARIES:
                raise ModelError("too_many_libraries", f"at most {MAX_LIBRARIES} libraries")
            ident = uuid4().hex
            item = {"id": ident, "source": source, "name": _text(name, "name"), "brand": _text(brand, "brand"),
                    "model": _text(model, "model"), "entries": entries}
            _check(item)
            items = {**self.items, ident: item}
            await self.store.async_save({"libraries": items})
            self.items = items
            return self.public(item)

    async def async_recognise(self, library_id: str, enabled: bool) -> dict[str, Any]:
        """Whether a capture is compared with this library (on by default)."""
        async with self.lock:
            item = {**self._item(library_id), "recognise": bool(enabled)}
            items = {**self.items, library_id: item}
            await self.store.async_save({"libraries": items})
            self.items = items
            return self.public(item)

    async def async_remove(self, library_id: str) -> None:
        async with self.lock:
            self._item(library_id)
            items = {key: value for key, value in self.items.items() if key != library_id}
            await self.store.async_save({"libraries": items})
            self.items = items

    def match(self, timings: tuple[int, ...] | list[int], limit: int = 3) -> list[dict[str, Any]]:
        """The library buttons closest to a captured signal, best first."""
        return match_items(list(self.items.values()), timings, limit)

    async def async_match(self, timings: tuple[int, ...] | list[int], limit: int = 3) -> list[dict[str, Any]]:
        """The same, in a worker thread: eight full libraries are millions of comparisons, and Home
        Assistant must not wait for them. The list of libraries is taken here, on the event loop."""
        return await self.hass.async_add_executor_job(match_items, list(self.items.values()), tuple(timings), limit)


def _signal(entry: dict[str, Any]) -> IrSignal:
    return IrSignal.from_dict({"carrier_hz": entry["carrier_hz"], "carrier_source": "known" if entry["carrier_hz"] else "estimated",
                               "timings_us": entry["timings_us"]})


def _check(item: dict[str, Any]) -> None:
    if item["source"] not in SOURCES or not isinstance(item["entries"], list) or not item["entries"]:
        raise ModelError("invalid_library", "invalid library")
    for key in ("id", "name", "brand", "model"):
        if not isinstance(item[key], str) or not item[key]:
            raise ModelError("invalid_library", "invalid library")
    if not isinstance(item.get("recognise", True), bool):
        raise ModelError("invalid_library", "invalid library")
    for entry in item["entries"]:
        if not isinstance(entry.get("name"), str):
            raise ModelError("invalid_library", "invalid library button")
        _signal(entry)
