"""Manual IR capture/editing for administrators and playback for Remotes readers."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import MAX_SUBSCRIPTIONS_TOTAL
from .errors import ModelError
from .ir import DATA_IR, IrManager
from .ir_model import MAX_CARRIER_HZ
from .rf_model import MAX_DESCRIPTION, MAX_NAME, MAX_WIDGETS
from .websocket import _read_allowed

ITEM_ID = vol.All(str, vol.Length(min=1, max=64))
TARGET_ID = vol.All(str, vol.Length(min=1, max=255))
NAME = vol.All(str, vol.Length(min=1, max=MAX_NAME))
SIGNAL = {
    vol.Required("candidate_id"): ITEM_ID,
    vol.Required("emitter_id"): TARGET_ID,
    vol.Required("carrier_hz"): vol.All(int, vol.Range(min=0, max=MAX_CARRIER_HZ)),
    vol.Optional("carrier_source", default="estimated"): vol.In(("estimated", "known")),
}
REMOTE_EDIT = {
    vol.Optional("name"): NAME,
    vol.Optional("icon"): vol.Any(None, vol.All(str, vol.Length(max=72))),
    vol.Optional("description"): vol.Any(None, vol.All(str, vol.Length(max=MAX_DESCRIPTION))),
    vol.Optional("emitter"): TARGET_ID,
    vol.Optional("layout"): vol.Any(None, vol.All(list, vol.Length(max=MAX_WIDGETS))),
}
BUTTON_EDIT = {
    vol.Optional("name"): NAME,
    vol.Optional("icon"): vol.Any(None, vol.All(str, vol.Length(max=72))),
    vol.Optional("emitter"): vol.Any(None, TARGET_ID),
    vol.Optional("carrier_hz"): vol.All(int, vol.Range(min=0, max=MAX_CARRIER_HZ)),
    vol.Optional("carrier_source"): vol.In(("estimated", "known")),
}


def _manager(hass: HomeAssistant) -> IrManager:
    if (manager := hass.data.get(DATA_IR)) is None:
        raise ModelError("not_loaded", "the HomeManager integration is not loaded")
    return manager


@callback
def async_register(hass: HomeAssistant) -> None:
    for command in (ws_devices, ws_capture, ws_test, ws_save, ws_press, ws_remote_edit, ws_button_edit, ws_settings):
        websocket_api.async_register_command(hass, command)


def _result(connection: websocket_api.ActiveConnection, msg_id: int, work: Callable[[], dict[str, Any]]) -> None:
    try:
        result = work()
    except ModelError as error:
        connection.send_error(msg_id, error.code, str(error))
        return
    connection.send_result(msg_id, result)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/remotes/ir/devices"})
@callback
def ws_devices(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    _result(connection, msg["id"], lambda: _manager(hass).devices())


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "homemanager/remotes/ir/capture", vol.Required("receiver_id"): TARGET_ID,
    vol.Optional("batch", default=False): bool,
})
@callback
def ws_capture(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    msg_id = msg["id"]
    if len(connection.subscriptions) >= MAX_SUBSCRIPTIONS_TOTAL:
        connection.send_error(msg_id, "too_many_subscriptions", "too many open subscriptions")
        return

    def report(event: dict[str, Any]) -> None:
        connection.send_message(websocket_api.event_message(msg_id, event))

    try:
        stop = _manager(hass).start_capture(connection, msg["receiver_id"], report, batch=msg["batch"])
    except ModelError as error:
        connection.send_error(msg_id, error.code, str(error))
        return
    connection.subscriptions[msg_id] = stop
    connection.send_result(msg_id)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/remotes/ir/test", **SIGNAL})
@callback
def ws_test(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    _result(connection, msg["id"], lambda: _manager(hass).test(
        connection, msg["candidate_id"], msg["emitter_id"], msg["carrier_hz"], msg["carrier_source"],
    ))


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "homemanager/remotes/ir/save", **SIGNAL,
    vol.Required("button_name"): NAME,
    vol.Optional("remote_id"): ITEM_ID,
    vol.Optional("remote_name"): NAME,
    vol.Optional("button_id"): ITEM_ID,
})
@websocket_api.async_response
async def ws_save(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        result = await _manager(hass).async_save(connection, msg)
    except ModelError as error:
        connection.send_error(msg["id"], error.code, str(error))
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command({
    vol.Required("type"): "homemanager/remotes/ir/press",
    vol.Required("remote_id"): ITEM_ID,
    vol.Required("button_id"): ITEM_ID,
})
@callback
def ws_press(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    if _read_allowed(hass, connection, msg["id"]):
        _result(connection, msg["id"], lambda: _manager(hass).press(msg["remote_id"], msg["button_id"]))


async def _edit(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        result = await _manager(hass).async_edit(msg["remote_id"], msg.get("button_id"), msg["changes"])
    except ModelError as error:
        connection.send_error(msg["id"], error.code, str(error))
        return
    connection.send_result(msg["id"], result)


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "homemanager/remotes/ir/remote/edit",
    vol.Required("remote_id"): ITEM_ID,
    vol.Required("changes"): vol.Any(None, REMOTE_EDIT),
})
@websocket_api.async_response
async def ws_remote_edit(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    await _edit(hass, connection, msg)


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "homemanager/remotes/ir/button/edit",
    vol.Required("remote_id"): ITEM_ID, vol.Required("button_id"): ITEM_ID,
    vol.Required("changes"): vol.Any(None, BUTTON_EDIT),
})
@websocket_api.async_response
async def ws_button_edit(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    await _edit(hass, connection, msg)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/remotes/ir/settings", vol.Required("remote_id"): ITEM_ID})
@callback
def ws_settings(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    _result(connection, msg["id"], lambda: _manager(hass).settings(msg["remote_id"]))
