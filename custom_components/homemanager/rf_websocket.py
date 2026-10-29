"""Websocket API of the RF remote manager.

Reading the library (names and fingerprints only), pressing a button and
correcting an assumed state follow HomeManager's access rule: administrators
and the viewers selected in the integration options. Capturing, testing and
editing remotes require an administrator. No command returns a code:
captures are referenced by candidate id.
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN, MAX_SUBSCRIPTIONS_TOTAL
from .model import ModelError
from .rf import MAX_CAPTURE_SECONDS, RfManager
from .rf_model import MAX_DESCRIPTION, MAX_NAME

DATA_RF = f"{DOMAIN}_rf"
ITEM_ID = vol.All(str, vol.Length(min=1, max=64))
SETTINGS = {
    vol.Optional("transmitter"): vol.All(str, vol.Length(max=64)),
    vol.Optional("protocol"): int,
    vol.Optional("nbits"): int,
    vol.Optional("pulse_us"): int,
    vol.Optional("repeats"): int,
    vol.Optional("wait_us"): int,
}
ABOUT = {
    vol.Optional("icon"): vol.Any(None, vol.All(str, vol.Length(max=72))),
    vol.Optional("description"): vol.Any(None, vol.All(str, vol.Length(max=MAX_DESCRIPTION))),
    vol.Optional("measured_pulse_us"): vol.Any(None, int),
}


def _rf(hass: HomeAssistant) -> RfManager:
    manager = hass.data.get(DATA_RF)
    if manager is None:
        raise ModelError("not_loaded", "the HomeManager integration is not loaded")
    return manager


def _reader(hass: HomeAssistant, connection: websocket_api.ActiveConnection) -> None:
    """Same rule as the homes API (websocket.py): admins and selected viewers."""
    user = connection.user
    store = hass.data.get(DOMAIN)
    viewers = getattr(store, "viewer_user_ids", set())
    if not (user and user.is_active and (user.is_admin or user.id in viewers)):
        raise ModelError("unauthorized", "HomeManager access requires an administrator or an explicitly selected viewer")


@callback
def async_register(hass: HomeAssistant) -> None:
    for command in (
        ws_library,
        ws_subscribe,
        ws_transmitters,
        ws_devices,
        ws_default_receiver,
        ws_remote_save,
        ws_remote_delete,
        ws_parts_save,
        ws_layout_save,
        ws_button_save,
        ws_button_delete,
        ws_press,
        ws_assume,
        ws_test,
        ws_capture,
    ):
        websocket_api.async_register_command(hass, command)


async def _run(connection: websocket_api.ActiveConnection, msg_id: int, work: Any) -> None:
    try:
        result = await work
    except ModelError as error:
        connection.send_error(msg_id, error.code, str(error))
        return
    connection.send_result(msg_id, result)


@websocket_api.websocket_command({vol.Required("type"): "homemanager/rf/library"})
@callback
def ws_library(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        _reader(hass, connection)
        connection.send_result(msg["id"], _rf(hass).library.public())
    except ModelError as error:
        connection.send_error(msg["id"], error.code, str(error))


@websocket_api.websocket_command({vol.Required("type"): "homemanager/rf/subscribe"})
@callback
def ws_subscribe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Pushes an empty event whenever the library changes; clients re-read it."""
    msg_id = msg["id"]
    try:
        _reader(hass, connection)
        manager = _rf(hass)
        if manager.subscriber_count >= MAX_SUBSCRIPTIONS_TOTAL:
            raise ModelError("too_many_subscriptions", "too many open subscriptions")
    except ModelError as error:
        connection.send_error(msg_id, error.code, str(error))
        return
    connection.subscriptions[msg_id] = manager.async_subscribe(lambda: connection.send_message(websocket_api.event_message(msg_id, {})))
    connection.send_result(msg_id)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/rf/transmitters"})
@callback
def ws_transmitters(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        connection.send_result(msg["id"], {"transmitters": _rf(hass).transmitters()})
    except ModelError as error:
        connection.send_error(msg["id"], error.code, str(error))


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/rf/devices"})
@websocket_api.async_response
async def ws_devices(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Every ESPHome device, whether it has the package, and what to paste."""

    async def work() -> dict[str, Any]:
        return await _rf(hass).async_devices()

    await _run(connection, msg["id"], work())


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/rf/default_receiver", vol.Required("receiver"): vol.Any(None, vol.All(str, vol.Length(max=64)))})
@websocket_api.async_response
async def ws_default_receiver(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    async def work() -> None:
        await _rf(hass).async_set_default_receiver(msg["receiver"])

    await _run(connection, msg["id"], work())


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "homemanager/rf/remote/save",
        # Omitted: a new remote whose id is derived from its name.
        vol.Optional("remote_id"): ITEM_ID,
        vol.Required("remote"): {vol.Required("name"): vol.All(str, vol.Length(max=MAX_NAME)), **SETTINGS, **ABOUT},
    }
)
@websocket_api.async_response
async def ws_remote_save(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    async def work() -> dict[str, Any]:
        return (await _rf(hass).async_put_remote(msg.get("remote_id"), msg["remote"])).public()

    await _run(connection, msg["id"], work())


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/rf/remote/delete", vol.Required("remote_id"): ITEM_ID})
@websocket_api.async_response
async def ws_remote_delete(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    async def work() -> None:
        await _rf(hass).async_delete_remote(msg["remote_id"])

    await _run(connection, msg["id"], work())


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "homemanager/rf/parts/save",
        vol.Required("remote_id"): ITEM_ID,
        # The whole list: what Home Assistant gets from this remote.
        vol.Required("parts"): [dict],
    }
)
@websocket_api.async_response
async def ws_parts_save(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    async def work() -> dict[str, Any]:
        return await _rf(hass).async_put_parts(msg["remote_id"], msg["parts"])

    await _run(connection, msg["id"], work())


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "homemanager/rf/layout/save",
        vol.Required("remote_id"): ITEM_ID,
        # null returns to the default drawing.
        vol.Required("layout"): vol.Any(None, [dict]),
    }
)
@websocket_api.async_response
async def ws_layout_save(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    async def work() -> dict[str, Any]:
        return await _rf(hass).async_put_layout(msg["remote_id"], msg["layout"])

    await _run(connection, msg["id"], work())


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "homemanager/rf/button/save",
        vol.Required("remote_id"): ITEM_ID,
        vol.Optional("button_id"): ITEM_ID,
        vol.Required("button"): {vol.Required("name"): vol.All(str, vol.Length(max=MAX_NAME)), vol.Optional("icon"): vol.Any(None, vol.All(str, vol.Length(max=72)))},
        # Optional: what the button does in a fan or light of this remote.
        vol.Optional("role"): {vol.Required("part"): ITEM_ID, vol.Required("role"): vol.All(str, vol.Length(max=32))},
        # A new code comes from a capture; `code` exists for importing an
        # existing catalogue and is never echoed back.
        vol.Exclusive("candidate_id", "code"): vol.All(str, vol.Length(max=32)),
        vol.Exclusive("code", "code"): vol.All(str, vol.Length(max=64)),
    }
)
@websocket_api.async_response
async def ws_button_save(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    async def work() -> dict[str, Any]:
        return await _rf(hass).async_put_button(msg["remote_id"], msg.get("button_id"), msg["button"], msg.get("candidate_id"), msg.get("code"), msg.get("role"))

    await _run(connection, msg["id"], work())


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/rf/button/delete", vol.Required("remote_id"): ITEM_ID, vol.Required("button_id"): ITEM_ID})
@websocket_api.async_response
async def ws_button_delete(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    async def work() -> None:
        await _rf(hass).async_delete_button(msg["remote_id"], msg["button_id"])

    await _run(connection, msg["id"], work())


@websocket_api.websocket_command({vol.Required("type"): "homemanager/rf/press", vol.Required("remote_id"): ITEM_ID, vol.Required("button_id"): ITEM_ID})
@websocket_api.async_response
async def ws_press(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    async def work() -> dict[str, Any]:
        _reader(hass, connection)
        return await _rf(hass).async_press(msg["remote_id"], msg["button_id"])

    await _run(connection, msg["id"], work())


@websocket_api.websocket_command({vol.Required("type"): "homemanager/rf/assume", vol.Required("entity_id"): vol.All(str, vol.Length(max=255)), vol.Required("is_on"): bool})
@callback
def ws_assume(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Corrects the assumed on/off state of an RF fan or light. Nothing is sent:
    it is for when someone used the physical remote."""
    try:
        _reader(hass, connection)
        _rf(hass).assume(msg["entity_id"], msg["is_on"])
    except ModelError as error:
        connection.send_error(msg["id"], error.code, str(error))
        return
    connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/rf/test", vol.Required("candidate_id"): vol.All(str, vol.Length(max=32)), **SETTINGS})
@websocket_api.async_response
async def ws_test(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    settings = {key: msg[key] for key in ("transmitter", "pulse_us", "repeats", "wait_us") if key in msg}

    async def work() -> dict[str, Any]:
        return await _rf(hass).async_test(msg["candidate_id"], settings)

    await _run(connection, msg["id"], work())


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "homemanager/rf/capture",
        vol.Required("transmitter"): vol.All(str, vol.Length(max=64)),
        vol.Optional("seconds", default=30): vol.All(int, vol.Range(min=1, max=MAX_CAPTURE_SECONDS)),
    }
)
@websocket_api.async_response
async def ws_capture(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Subscription: pushes {candidate: {...}} for each heard code, {noise: n}
    for signals no supported protocol explains and {done: true} when the
    window closes. Unsubscribing stops the capture."""
    msg_id = msg["id"]

    @callback
    def report(event: dict[str, Any]) -> None:
        connection.send_message(websocket_api.event_message(msg_id, event))

    @callback
    def done() -> None:
        connection.subscriptions.pop(msg_id, None)
        connection.send_message(websocket_api.event_message(msg_id, {"done": True}))

    try:
        stop = await _rf(hass).async_capture(msg["transmitter"], msg["seconds"], report, done)
    except ModelError as error:
        connection.send_error(msg_id, error.code, str(error))
        return
    connection.subscriptions[msg_id] = stop
    connection.send_result(msg_id)
