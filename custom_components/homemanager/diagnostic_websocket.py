"""Admin-only access to signal evidence and optional physical tests."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError

from .diagnostics import DATA_DIAGNOSTICS, Diagnostics
from .errors import ModelError

ID = vol.All(str, vol.Length(min=1, max=64))
TARGET = vol.All(str, vol.Length(min=1, max=255))
SOURCE = {vol.Required("source"): vol.In(("ir", "rf"))}
BUTTON = {**SOURCE, vol.Required("remote_id"): ID, vol.Required("button_id"): ID}


def _manager(hass: HomeAssistant) -> Diagnostics:
    if (manager := hass.data.get(DATA_DIAGNOSTICS)) is None:
        raise ModelError("not_loaded", "the HomeManager integration is not loaded")
    return manager


@callback
def async_register(hass: HomeAssistant) -> None:
    for command in (ws_candidate, ws_candidate_note, ws_sheet, ws_devices, ws_run, ws_rf_test, ws_note, ws_clear):
        websocket_api.async_register_command(hass, command)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/remotes/diagnostics/candidate", **SOURCE,
                                  vol.Required("candidate_id"): ID, vol.Optional("advanced", default=False): bool})
@callback
def ws_candidate(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        data = _manager(hass).candidate(connection, msg["source"], msg["candidate_id"], msg["advanced"])
    except ModelError as error:
        connection.send_error(msg["id"], error.code, str(error))
    else:
        connection.send_result(msg["id"], data)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/remotes/diagnostics/candidate_note", **SOURCE,
                                  vol.Required("candidate_id"): ID,
                                  vol.Required("response"): vol.In(("confirmed", "no_response", "inconclusive"))})
@callback
def ws_candidate_note(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        manager = _manager(hass)
        if msg["source"] == "ir":
            manager.ir.note_candidate(connection, msg["candidate_id"], msg["response"])
        else:
            manager.rf.note_candidate(msg["candidate_id"], msg["response"])
    except ModelError as error:
        connection.send_error(msg["id"], error.code, str(error))
    else:
        connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/remotes/diagnostics/sheet", **BUTTON,
                                  vol.Optional("trial_id"): ID})
@callback
def ws_sheet(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        data = _manager(hass).sheet(msg["source"], msg["remote_id"], msg["button_id"], msg.get("trial_id"))
    except ModelError as error:
        connection.send_error(msg["id"], error.code, str(error))
    else:
        connection.send_result(msg["id"], data)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/remotes/diagnostics/devices", **SOURCE})
@callback
def ws_devices(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        data = _manager(hass).devices(msg["source"])
    except ModelError as error:
        connection.send_error(msg["id"], error.code, str(error))
    else:
        connection.send_result(msg["id"], data)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/remotes/diagnostics/run", **BUTTON,
                                  vol.Required("emitter"): TARGET, vol.Optional("external"): TARGET,
                                  vol.Optional("self"): TARGET})
@websocket_api.async_response
async def ws_run(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        receivers = {key: msg[key] for key in ("self", "external") if key in msg}
        data = await _manager(hass).async_run(msg["source"], msg["remote_id"], msg["button_id"], msg["emitter"], receivers)
    except ModelError as error:
        connection.send_error(msg["id"], error.code, str(error))
    else:
        connection.send_result(msg["id"], data)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/remotes/diagnostics/rf_test",
                                  vol.Required("remote_id"): ID, vol.Required("button_id"): ID})
@websocket_api.async_response
async def ws_rf_test(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        result = await _manager(hass).async_rf_test(msg["remote_id"], msg["button_id"])
    except ModelError as error:
        connection.send_error(msg["id"], error.code, str(error))
    except HomeAssistantError:
        connection.send_error(msg["id"], "diagnostic_send_failed", "the transmitter did not accept the request")
    else:
        connection.send_result(msg["id"], result)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/remotes/diagnostics/note", **BUTTON,
                                  vol.Optional("camera"): vol.In(("visible", "not_visible", "inconclusive")),
                                  vol.Optional("response"): vol.In(("confirmed", "no_response", "inconclusive")),
                                  vol.Optional("note"): vol.All(str, vol.Length(min=1, max=240)),
                                  vol.Optional("trial_id"): ID})
@websocket_api.async_response
async def ws_note(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        data = await _manager(hass).async_note(msg["source"], msg["remote_id"], msg["button_id"], msg)
    except ModelError as error:
        connection.send_error(msg["id"], error.code, str(error))
    else:
        connection.send_result(msg["id"], data)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/remotes/diagnostics/clear", **BUTTON})
@websocket_api.async_response
async def ws_clear(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        await _manager(hass).async_clear(msg["source"], msg["remote_id"], msg["button_id"])
    except ModelError as error:
        connection.send_error(msg["id"], error.code, str(error))
    else:
        connection.send_result(msg["id"])
