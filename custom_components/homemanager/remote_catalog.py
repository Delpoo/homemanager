"""Bounded adapters for local, user-supplied infrared catalog files."""
from __future__ import annotations

import base64
from binascii import Error as Base64Error
import json
import re
from typing import Any

from .absolute_profiles import encode_signal
from .errors import ModelError
from .ir_model import IrSignal

MAX_DOCUMENT = 512_000
MAX_ENTRIES = 1024
SOURCES = ("Flipper-IRDB", "SmartIR", "IRremoteESP8266")


def _raw(numbers: Any, frequency: int = 38000, source: str = "estimated") -> IrSignal:
    if not isinstance(numbers, list) or any(type(number) is not int for number in numbers):
        raise ModelError("invalid_catalog", "invalid pulse list")
    timings = [number if i % 2 == 0 else -number for i, number in enumerate(numbers)] if all(n > 0 for n in numbers) else numbers
    return IrSignal.from_dict({"carrier_hz": frequency, "carrier_source": source, "timings_us": timings})


def _broadlink(value: str) -> IrSignal:
    packet = base64.b64decode(value, validate=True)
    if len(packet) < 6 or packet[0] != 0x26 or packet[1] != 0:
        raise ModelError("unsupported_catalog", "unsupported Broadlink transport or repeat field")
    size = int.from_bytes(packet[2:4], "little")
    if 4 + size > len(packet) or packet[4 + size - 2:4 + size] != b"\x0d\x05":
        raise ModelError("invalid_catalog", "invalid Broadlink pulse packet")
    values = []
    index = 4
    end = 4 + size - 2
    while index < end:
        value = packet[index]
        index += 1
        if not value:
            if index + 2 > end:
                raise ModelError("invalid_catalog", "truncated Broadlink pulse packet")
            value = int.from_bytes(packet[index:index + 2], "big")
            index += 2
        values.append(round(value * 269 / 8192 * 1000))
    return _raw(values)


def _flipper(text: str):
    block: dict[str, str] = {}
    for line in [*text.splitlines(), "#"]:
        line = line.strip()
        if line.startswith("#") or line.startswith("name:"):
            if "name" in block:
                yield block["name"], block
                block = {}
            if line.startswith("#"):
                continue
        key, sep, value = line.partition(":")
        if sep:
            block[key.strip()] = value.strip()


def _flipper_signal(block: dict[str, str]) -> IrSignal:
    if block.get("type") == "raw":
        return _raw([int(part) for part in block["data"].split()], int(block["frequency"]), "known")
    protocol = block.get("protocol")
    if block.get("type") == "parsed" and protocol in ("NEC", "NECext"):
        address = bytes.fromhex(block["address"])
        command = bytes.fromhex(block["command"])
        if len(address) != 4 or len(command) != 4 or any(address[2:]) or any(command[2:]):
            raise ValueError("invalid NEC address or command")
        if protocol == "NEC" and (address[1] or command[1]):
            raise ValueError("invalid NEC address or command")
        data = ([address[0], 255 - address[0], command[0], 255 - command[0]]
                if protocol == "NEC" else [*address[:2], *command[:2]])
        values = [9000, -4500]
        for byte in data:
            for bit in range(8):
                values.extend((560, -1690 if byte & (1 << bit) else -560))
        return _raw([*values, 560], 38000, "known")
    raise ModelError("unsupported_catalog", "parsed protocol needs a supported encoder or raw data")


def _smartir(value: Any, path: tuple[str, ...] = ()):
    if len(path) >= 6 or not isinstance(value, dict):
        yield " · ".join(path), value
        return
    for key, item in value.items():
        yield from _smartir(item, (*path, key))


def _dump(text: str):
    for match in re.finditer(r"(rawData|state)\s*\[\s*\d*\s*\]\s*=\s*\{([^}]+)\}", text):
        name, body = match.groups()
        values = [int(part.strip(), 0) for part in body.split(",") if part.strip()]
        yield f"{name} · {match.start()}", (name, values)


def parse_catalog(source: str, text: str) -> list[tuple[str, IrSignal | None, str | None]]:
    if not isinstance(text, str) or not 0 < len(text) <= MAX_DOCUMENT or source not in SOURCES:
        raise ModelError("invalid_catalog", "select a supported catalog file up to 512 KB")
    try:
        if source == "Flipper-IRDB":
            entries = _flipper(text)
        elif source == "SmartIR":
            document = json.loads(text)
            if not isinstance(document, dict) or not isinstance(document.get("commands"), dict):
                raise ValueError("missing commands")
            entries = _smartir(document["commands"])
        else:
            entries = _dump(text)
        result = []
        for name, entry in entries:
            if len(result) >= MAX_ENTRIES:
                raise ModelError("invalid_catalog", f"select a file with at most {MAX_ENTRIES} signals")
            label = (name.strip() or f"Señal {len(result) + 1}")[:80]
            try:
                if source == "Flipper-IRDB":
                    signal = _flipper_signal(entry)
                elif source == "SmartIR":
                    signal = _broadlink(entry) if isinstance(entry, str) else _raw(entry)
                else:
                    kind, values = entry
                    signal = encode_signal(bytes(values)) if kind == "state" else _raw(values)
                result.append((label, signal, None))
            except (ModelError, ValueError, Base64Error, KeyError, TypeError):
                result.append((label, None, "unsupported_signal"))
    except (ValueError, TypeError, RecursionError):
        raise ModelError("invalid_catalog", "could not read the selected catalog format") from None
    if not result:
        raise ModelError("invalid_catalog", "the catalog file has no signals")
    return result
