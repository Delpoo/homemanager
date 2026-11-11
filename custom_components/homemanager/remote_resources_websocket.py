"""Administrator actions for absolute controls and local catalog import."""
from __future__ import annotations

import asyncio
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .absolute_remotes import DATA_ABSOLUTE, AbsoluteRemotes
from .errors import ModelError
from .ir import DATA_IR
from .remote_catalog import MAX_DOCUMENT, MAX_ENTRIES, SOURCES, parse_catalog

TEXT = vol.All(str, vol.Length(min=1, max=120))
ID = vol.All(str, vol.Length(min=1, max=64))
TARGET = vol.All(str, vol.Length(min=1, max=255))
CATALOG = {vol.Required("source"): vol.In(SOURCES), vol.Required("document"): vol.All(str, vol.Length(min=1, max=MAX_DOCUMENT))}


def _manager(hass: HomeAssistant) -> AbsoluteRemotes:
    if (manager := hass.data.get(DATA_ABSOLUTE)) is None:
        raise ModelError("not_loaded", "absolute controls are unavailable")
    return manager


@callback
def async_register(hass: HomeAssistant) -> None:
    for action in (ws_resources, ws_absolute, ws_catalog, ws_import):
        websocket_api.async_register_command(hass, action)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/remotes/resources"})
@callback
def ws_resources(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        connection.send_result(msg["id"], _manager(hass).resources())
    except ModelError as error:
        connection.send_error(msg["id"], error.code, str(error))


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "homemanager/remotes/absolute",
    vol.Required("command"): vol.In(("create", "configure", "send", "preset", "schedule", "remove", "design", "link-powerful", "powerful")),
    vol.Optional("control_id"): ID,
    vol.Optional("fields", default=dict): {
        vol.Optional("profile"): ID, vol.Optional("remote_id"): ID, vol.Optional("button_id"): ID,
        vol.Optional("name"): TEXT, vol.Optional("brand"): TEXT, vol.Optional("model"): TEXT,
        vol.Optional("emitter"): TARGET, vol.Optional("schedule_id"): ID, vol.Optional("remove"): bool,
        vol.Optional("days"): [int], vol.Optional("time"): str, vol.Optional("power"): bool,
        vol.Optional("zone"): TEXT, vol.Optional("enabled"): bool,
        vol.Optional("state"): {str: vol.Any(bool, str, int, float)},
        vol.Optional("layout"): vol.Any(None, vol.All(list, vol.Length(max=160))),
    },
})
@websocket_api.async_response
async def ws_absolute(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        manager = _manager(hass)
        work = manager.async_command(msg["command"], msg.get("control_id"), msg["fields"])
        result = await asyncio.shield(hass.async_create_task(work, "HomeManager absolute control"))
    except ModelError as error:
        connection.send_error(msg["id"], error.code, str(error))
    else:
        connection.send_result(msg["id"], result)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/remotes/catalog/preview", **CATALOG})
@websocket_api.async_response
async def ws_catalog(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        rows = await hass.async_add_executor_job(parse_catalog, msg["source"], msg["document"])
        connection.send_result(msg["id"], [{"index": index, "name": name, "supported": signal is not None,
                                         "fingerprint": signal.fingerprint if signal else None, "reason": reason}
                                        for index, (name, signal, reason) in enumerate(rows)])
    except ModelError as error:
        connection.send_error(msg["id"], error.code, str(error))


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "homemanager/remotes/catalog/import", **CATALOG,
    vol.Required("indexes"): vol.All([vol.All(int, vol.Range(min=0, max=MAX_ENTRIES - 1))], vol.Length(min=1, max=MAX_ENTRIES)),
    vol.Required("name"): TEXT, vol.Required("brand"): TEXT, vol.Required("model"): TEXT,
    vol.Required("entry"): TEXT, vol.Required("revision"): TEXT, vol.Required("emitter"): TARGET,
    vol.Optional("remote_id"): ID,
})
@websocket_api.async_response
async def ws_import(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        manager = hass.data.get(DATA_IR)
        if manager is None:
            raise ModelError("not_loaded", "the infrared library is unavailable")
        rows = await hass.async_add_executor_job(parse_catalog, msg["source"], msg["document"])
        indexes = sorted(set(msg["indexes"]))
        if any(index >= len(rows) or rows[index][1] is None for index in indexes):
            raise ModelError("invalid_catalog", "choose supported signals from the preview")
        origin = {key: msg[key].strip() for key in ("source", "brand", "model", "entry", "revision")}
        if not all(origin.values()):
            raise ModelError("invalid_catalog", "fill in the source, brand, model and revision")
        signals = [(rows[i][0], rows[i][1], {**origin, "index": i, "function": rows[i][0],
                                          "partial": len(indexes) != len(rows)}) for i in indexes]
        result = await manager.async_import(msg["name"], msg["emitter"], signals, msg.get("remote_id"))
    except ModelError as error:
        connection.send_error(msg["id"], error.code, str(error))
    else:
        connection.send_result(msg["id"], result)
