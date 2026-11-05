"""Native IR Proxy transport over the connection owned by Home Assistant."""

from __future__ import annotations

import asyncio
from collections.abc import Iterator
from dataclasses import dataclass
from hashlib import sha256
from time import monotonic
from typing import TYPE_CHECKING

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

from .errors import ModelError
from .ir_model import MAX_TIMINGS, IrSignal

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
                )

    def devices(self) -> dict[str, list[dict[str, str]]]:
        receivers = []
        emitters = []
        for target in sorted(self._targets(), key=lambda item: (item.name.casefold(), item.proxy_id)):
            summary = {"id": target.proxy_id, "name": target.name}
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
        target = self._get(receiver_id, receive=True)
        from aioesphomeapi import APIConnectionError

        result: asyncio.Future[tuple[int, ...]] = asyncio.get_running_loop().create_future()

        def received(event: InfraredRFReceiveEvent) -> None:
            if result.done() or event.key != target.key or event.device_id != target.device_id:
                return
            # The native API model retains protobuf's repeated field container.
            if not 1 <= len(event.timings) <= MAX_TIMINGS:
                return
            try:
                signal = IrSignal.from_dict({"carrier_hz": None, "carrier_source": "unknown", "timings_us": list(event.timings)})
            except ModelError:
                return
            result.set_result(signal.timings_us)

        def disconnected() -> None:
            if not result.done():
                result.set_exception(ModelError("ir_receiver_unavailable", "the selected infrared receiver disconnected"))

        try:
            unsubscribe = target.runtime.client.subscribe_infrared_rf_receive(received)
        except APIConnectionError:
            raise ModelError("ir_receiver_unavailable", "the selected infrared receiver is unavailable") from None
        disconnect_callbacks = target.runtime.disconnect_callbacks
        disconnect_callbacks.add(disconnected)
        try:
            return await result
        finally:
            disconnect_callbacks.discard(disconnected)
            unsubscribe()

    def send(self, emitter_id: str, signal: IrSignal) -> None:
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
        self._busy_until[target.node_id] = monotonic() + max(duration, MIN_SEND_INTERVAL_SECONDS)
