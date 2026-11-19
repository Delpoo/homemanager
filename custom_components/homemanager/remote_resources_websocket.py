"""Administrator actions for absolute controls and local catalog import."""
from __future__ import annotations

import asyncio
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .absolute_profiles import MITSUBISHI, decode_signal
from .absolute_remotes import DATA_ABSOLUTE, AbsoluteRemotes
from .errors import ModelError
from .ir import DATA_IR
from .ir_libraries import DATA_IR_LIBRARIES, IrLibraries
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
    for action in (ws_resources, ws_absolute, ws_catalog, ws_import, ws_libraries, ws_library_add, ws_library_remove,
                   ws_library_entries, ws_library_match, ws_library_bring):
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
    vol.Required("command"): vol.In(("create", "configure", "send", "preset", "schedule", "remove", "design", "link-powerful", "powerful", "program", "run-program")),
    vol.Optional("control_id"): ID,
    vol.Optional("fields", default=dict): {
        vol.Optional("profile"): ID, vol.Optional("remote_id"): ID, vol.Optional("button_id"): ID,
        vol.Optional("name"): TEXT, vol.Optional("brand"): TEXT, vol.Optional("model"): TEXT,
        vol.Optional("emitter"): TARGET, vol.Optional("schedule_id"): ID, vol.Optional("remove"): bool,
        vol.Optional("days"): [int], vol.Optional("time"): str, vol.Optional("power"): bool,
        vol.Optional("zone"): TEXT, vol.Optional("enabled"): bool,
        vol.Optional("state"): {str: vol.Any(bool, str, int, float)},
        vol.Optional("layout"): vol.Any(None, vol.All(list, vol.Length(max=160))),
        vol.Optional("program_id"): ID, vol.Optional("icon"): vol.Any(None, vol.All(str, vol.Length(max=72))),
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
        signals = []
        for index in indexes:
            name, signal, _ = rows[index]
            assert signal is not None
            try:
                decode_signal(signal)
            except ModelError:
                protocol = "ir_raw"
            else:
                protocol = MITSUBISHI
            provenance = {**origin, "index": index, "function": name, "protocol": protocol,
                          "partial": len(indexes) != len(rows)}
            signals.append((name, signal, provenance))
        result = await manager.async_import(msg["name"], msg["emitter"], signals, msg.get("remote_id"))
    except ModelError as error:
        connection.send_error(msg["id"], error.code, str(error))
    else:
        connection.send_result(msg["id"], result)


def _libraries(hass: HomeAssistant) -> IrLibraries:
    if (libraries := hass.data.get(DATA_IR_LIBRARIES)) is None:
        raise ModelError("not_loaded", "the infrared libraries are unavailable")
    return libraries


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/remotes/libraries/list"})
@callback
def ws_libraries(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        connection.send_result(msg["id"], _libraries(hass).list())
    except ModelError as error:
        connection.send_error(msg["id"], error.code, str(error))


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "homemanager/remotes/libraries/add", **CATALOG,
    vol.Required("name"): TEXT, vol.Required("brand"): TEXT, vol.Required("model"): TEXT,
})
@websocket_api.async_response
async def ws_library_add(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        result = await _libraries(hass).async_add(msg["source"], msg["document"], msg["name"], msg["brand"], msg["model"])
    except ModelError as error:
        connection.send_error(msg["id"], error.code, str(error))
    else:
        connection.send_result(msg["id"], result)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/remotes/libraries/remove", vol.Required("library_id"): ID})
@websocket_api.async_response
async def ws_library_remove(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        await _libraries(hass).async_remove(msg["library_id"])
    except ModelError as error:
        connection.send_error(msg["id"], error.code, str(error))
    else:
        connection.send_result(msg["id"], {})


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/remotes/libraries/entries", vol.Required("library_id"): ID})
@callback
def ws_library_entries(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        connection.send_result(msg["id"], _libraries(hass).entries(msg["library_id"]))
    except ModelError as error:
        connection.send_error(msg["id"], error.code, str(error))


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/remotes/libraries/match", vol.Required("candidate_id"): ID})
@callback
def ws_library_match(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Which library button a captured signal probably is (the capture of this same connection)."""
    try:
        manager = hass.data.get(DATA_IR)
        if manager is None:
            raise ModelError("not_loaded", "the infrared library is unavailable")
        candidate = manager._candidate(connection, msg["candidate_id"])
        connection.send_result(msg["id"], _libraries(hass).match(candidate.timings))
    except ModelError as error:
        connection.send_error(msg["id"], error.code, str(error))


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "homemanager/remotes/libraries/bring",
    vol.Required("library_id"): ID,
    vol.Required("indexes"): vol.All([vol.All(int, vol.Range(min=0, max=MAX_ENTRIES - 1))], vol.Length(min=1, max=MAX_ENTRIES)),
    vol.Optional("names", default=dict): {str: TEXT},
    vol.Required("emitter"): TARGET,
    vol.Optional("remote_id"): ID,
    vol.Optional("remote_name"): TEXT,
})
@websocket_api.async_response
async def ws_library_bring(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Brings chosen library buttons into an infrared remote (a new one without remote_id),
    named as the app asks (for example as a template names them)."""
    try:
        manager = hass.data.get(DATA_IR)
        if manager is None:
            raise ModelError("not_loaded", "the infrared library is unavailable")
        libraries = _libraries(hass)
        library = libraries._item(msg["library_id"])
        signals = []
        for index, entry, signal in libraries.signals(msg["library_id"], sorted(set(msg["indexes"]))):
            try:
                decode_signal(signal)
            except ModelError:
                protocol = "ir_raw"
            else:
                protocol = MITSUBISHI
            provenance = {"source": library["source"], "brand": library["brand"], "model": library["model"],
                          "entry": library["name"], "revision": "Mis bibliotecas", "index": index, "function": entry,
                          "protocol": protocol, "partial": True}
            signals.append((msg["names"].get(str(index), entry), signal, provenance))
        result = await manager.async_import(msg.get("remote_name") or library["name"], msg["emitter"], signals, msg.get("remote_id"))
    except ModelError as error:
        connection.send_error(msg["id"], error.code, str(error))
    else:
        connection.send_result(msg["id"], result)
