"""Native IR Proxy transport over the connection owned by Home Assistant."""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from hashlib import sha256
from time import monotonic
from typing import TYPE_CHECKING

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

from .errors import ModelError
from .ir_model import MAX_TIMINGS, IrSignal
from .signals import sample

if TYPE_CHECKING:
    from aioesphomeapi import InfraredRFReceiveEvent
    from homeassistant.components.esphome.entry_data import RuntimeEntryData

MIN_SEND_INTERVAL_SECONDS = 0.15


@dataclass(frozen=True, slots=True)
class _Proxy:
    proxy_id: str
    node_id: str
    name: str
    runtime: RuntimeEntryData
    key: int
    device_id: int
    can_receive: bool
    can_send: bool
    entity_id: str | None
    registry_id: str | None
    device: str | None
    device_name: str


class IrProxy:
    """Discover explicit IR targets without connecting to a new host."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._busy_until: dict[str, float] = {}

    def _targets(self) -> Iterator[_Proxy]:
        entries = self.hass.config_entries.async_loaded_entries("esphome")
        if not entries:
            return

        # ESPHome owns the optional aioesphomeapi dependency and its connection.
        from aioesphomeapi import InfraredCapability, InfraredInfo
        from homeassistant.components.esphome.entry_data import build_device_unique_id

        registry = er.async_get(self.hass)
        for entry in entries:
            runtime = getattr(entry, "runtime_data", None)
            if runtime is None or not runtime.available or runtime.device_info is None:
                continue
            for info in runtime.info.get(InfraredInfo, {}).values():
                identity = build_device_unique_id(runtime.device_info.mac_address, info)
                entity_id = registry.async_get_entity_id("infrared", "esphome", identity)
                entity = registry.async_get(entity_id) if entity_id else None
                if entity and (entity.disabled or entity.config_entry_id != entry.entry_id):
                    continue
                # The native packet key can change. Derive a local identity from
                # the configured ESPHome entry and the stable entity identity.
                digest = sha256(f"{entry.entry_id}:{identity}".encode()).hexdigest()[:32]
                device_name = runtime.device_info.friendly_name or runtime.device_info.name
                name = info.name or info.object_id
                yield _Proxy(
                    proxy_id=f"esphome:{digest}",
                    node_id=entry.entry_id,
                    name=f"{device_name} · {name}" if device_name and device_name != name else name,
                    runtime=runtime,
                    key=info.key,
                    device_id=info.device_id,
                    can_receive=bool(info.capabilities & InfraredCapability.RECEIVER),
                    can_send=bool(info.capabilities & InfraredCapability.TRANSMITTER),
                    entity_id=entity.entity_id if entity else None,
                    registry_id=entity.id if entity else None,
                    device=entity.device_id if entity else None,
                    device_name=device_name or name,
                )

    def devices(self) -> dict[str, list[dict[str, str | None]]]:
        receivers = []
        emitters = []
        for target in sorted(self._targets(), key=lambda item: (item.name.casefold(), item.proxy_id)):
            # `device` (Home Assistant device id) and `device_name` let the Devices
            # page show each physical board once, with its RF and IR capabilities.
            summary = {"id": target.proxy_id, "name": target.name, "device": target.device, "device_name": target.device_name}
            if target.can_receive:
                receivers.append(summary)
            if target.can_send:
                emitters.append(summary)
        return {"receivers": receivers, "emitters": emitters}

    def _get(self, target_id: str, *, receive: bool) -> _Proxy:
        matches = [
            target for target in self._targets()
            if target_id and target_id in (target.proxy_id, target.entity_id, target.registry_id)
        ]
        if len(matches) == 1:
            target = matches[0]
            supports_operation = target.can_receive if receive else target.can_send
            if supports_operation:
                return target
        if receive:
            raise ModelError("ir_receiver_unavailable", "the selected infrared receiver is unavailable")
        raise ModelError("ir_emitter_unavailable", "the selected infrared emitter is unavailable")

    async def async_capture(self, receiver_id: str) -> tuple[int, ...]:
        [first] = await self._listen(receiver_id)
        return tuple(first["timings_us"])

    def same_node(self, emitter_id: str, receiver_id: str) -> bool:
        return self._get(emitter_id, receive=False).node_id == self._get(receiver_id, receive=True).node_id

    async def async_observe(self, receiver_id: str, ready: asyncio.Event,
                            accepting: Callable[[], bool], seconds: float, *, limit: int = 4,
                            distinct: bool = False) -> list[dict[str, Any]]:
        try:
            return await self._listen(receiver_id, ready=ready, accepting=accepting, seconds=seconds,
                                      limit=limit, distinct=distinct, playable=distinct)
        finally:
            ready.set()

    async def _listen(self, receiver_id: str, *, ready: asyncio.Event | None = None,
                      accepting: Callable[[], bool] | None = None, seconds: float | None = None,
                      limit: int = 1, distinct: bool = False, playable: bool = True) -> list[dict[str, Any]]:
        target = self._get(receiver_id, receive=True)
        from aioesphomeapi import APIConnectionError

        result: asyncio.Future[None] = asyncio.get_running_loop().create_future()
        blocks: list[dict[str, Any]] = []

        def received(event: InfraredRFReceiveEvent) -> None:
            if result.done() or (accepting is not None and not accepting()) or event.key != target.key or event.device_id != target.device_id:
                return
            # The native API model retains protobuf's repeated field container.
            if not 1 <= len(event.timings) <= MAX_TIMINGS:
                return
            timings = list(event.timings)
            integrity = "received"
            try:
                IrSignal.from_dict({"carrier_hz": None, "carrier_source": "unknown", "timings_us": timings})
            except ModelError:
                # A malformed observation is useful in a diagnostic, but the
                # same timings must never become a replayable learning sample.
                if playable or any(type(value) is not int or abs(value) > 2_000_000 for value in timings):
                    return
                integrity = "suspect"
            if distinct and any(len(block["timings_us"]) == len(timings) and all(
                a * b > 0 and abs(a - b) <= max(60, abs(a) * 0.15)
                for a, b in zip(block["timings_us"], timings)
            ) for block in blocks):
                return
            blocks.append(sample(timings, target.proxy_id, integrity=integrity))
            if len(blocks) >= limit:
                result.set_result(None)

        def disconnected() -> None:
            if result.done():
                return
            if blocks:
                result.set_result(None)
            else:
                result.set_exception(ModelError("ir_receiver_unavailable", "the selected infrared receiver disconnected"))

        try:
            unsubscribe = target.runtime.client.subscribe_infrared_rf_receive(received)
        except APIConnectionError:
            raise ModelError("ir_receiver_unavailable", "the selected infrared receiver is unavailable") from None
        disconnect_callbacks = target.runtime.disconnect_callbacks
        disconnect_callbacks.add(disconnected)
        if ready is not None:
            ready.set()
        try:
            try:
                async with asyncio.timeout(seconds):
                    await result
            except TimeoutError:
                pass
            return blocks
        finally:
            disconnect_callbacks.discard(disconnected)
            unsubscribe()

    def send(self, emitter_id: str, signal: IrSignal, *, reserve_seconds: float = 0) -> None:
        if signal.carrier_hz is None:
            raise ModelError("ir_carrier_unknown", "set the infrared carrier before sending")
        target = self._get(emitter_id, receive=False)
        now = monotonic()
        self._busy_until = {node_id: until for node_id, until in self._busy_until.items() if until > now}
        if target.node_id in self._busy_until:
            raise ModelError("ir_transmitter_busy", "the selected infrared transmitter is still sending")

        from aioesphomeapi import APIConnectionError

        try:
            target.runtime.client.infrared_rf_transmit_raw_timings(
                target.key,
                carrier_frequency=signal.carrier_hz,
                timings=list(signal.timings_us),
                repeat_count=1,
                device_id=target.device_id,
            )
        except APIConnectionError:
            raise ModelError("ir_emitter_unavailable", "the selected infrared emitter is unavailable") from None
        duration = sum(map(abs, signal.timings_us)) / 1_000_000
        # Multiple native emitter entities can share one physical transmitter.
        self._busy_until[target.node_id] = monotonic() + max(duration, MIN_SEND_INTERVAL_SECONDS, reserve_seconds)
