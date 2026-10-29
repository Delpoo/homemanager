"""Websocket API. Private by default; explicit viewers can read all homes.

The plan is never served from a static or unauthenticated URL; it travels only
over the authenticated websocket of the current HA session.
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN
from .model import ModelError, RevisionConflict
from .store import HomeManagerStore

HOME_ID = vol.All(str, vol.Length(min=1, max=64))


def _store(hass: HomeAssistant) -> HomeManagerStore:
    store = hass.data.get(DOMAIN)
    if store is None:
        # Commands stay registered after an unload; answer clearly instead of crashing.
        raise ModelError("not_loaded", "the HomeManager integration is not loaded")
    return store


def _error(connection: websocket_api.ActiveConnection, msg_id: int, error: ModelError) -> None:
    if isinstance(error, RevisionConflict):
        connection.send_error(msg_id, error.code, f"revision:{error.current}")
    else:
        connection.send_error(msg_id, error.code, str(error))


def _read_allowed(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg_id: int) -> bool:
    try:
        store = _store(hass)
    except ModelError as error:
        _error(connection, msg_id, error)
        return False
    user = connection.user
    if user and user.is_active and (user.is_admin or user.id in store.viewer_user_ids):
        return True
    connection.send_error(msg_id, "unauthorized", "HomeManager access requires an administrator or an explicitly selected viewer")
    return False


@callback
def async_register(hass: HomeAssistant) -> None:
    for command in (ws_homes, ws_home_get, ws_home_save, ws_home_delete, ws_home_subscribe, ws_plans, ws_plan_get, ws_storage_status, ws_history_purge):
        websocket_api.async_register_command(hass, command)


@websocket_api.websocket_command({vol.Required("type"): "homemanager/homes"})
@callback
def ws_homes(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    if not _read_allowed(hass, connection, msg["id"]):
        return
    try:
        homes = _store(hass).state.homes.values()
    except ModelError as error:
        _error(connection, msg["id"], error)
        return
    connection.send_result(msg["id"], {"homes": [home.summary() for home in sorted(homes, key=lambda home: home.home_id)]})


@websocket_api.websocket_command({vol.Required("type"): "homemanager/home/get", vol.Required("home_id"): HOME_ID})
@callback
def ws_home_get(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    if not _read_allowed(hass, connection, msg["id"]):
        return
    try:
        home = _store(hass).state.get(msg["home_id"])
    except ModelError as error:
        _error(connection, msg["id"], error)
        return
    connection.send_result(msg["id"], {**home.summary(), "configuration": home.configuration})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "homemanager/home/save",
        vol.Required("home_id"): HOME_ID,
        # null creates the home; otherwise it must equal the stored revision.
        vol.Required("expected_revision"): vol.Any(None, vol.All(int, vol.Range(min=1))),
        vol.Required("configuration"): dict,
        vol.Optional("title"): vol.Any(None, str),
    }
)
@websocket_api.async_response
async def ws_home_save(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        home = await _store(hass).async_save(msg["home_id"], msg["expected_revision"], msg["configuration"], msg.get("title"), connection.user.id)
    except ModelError as error:
        _error(connection, msg["id"], error)
        return
    connection.send_result(msg["id"], home.summary())


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "homemanager/home/delete",
        vol.Required("home_id"): HOME_ID,
        vol.Required("expected_revision"): vol.All(int, vol.Range(min=1)),
    }
)
@websocket_api.async_response
async def ws_home_delete(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        await _store(hass).async_delete(msg["home_id"], msg["expected_revision"])
    except ModelError as error:
        _error(connection, msg["id"], error)
        return
    connection.send_result(msg["id"])


@websocket_api.websocket_command({vol.Required("type"): "homemanager/home/subscribe", vol.Required("home_id"): HOME_ID})
@callback
def ws_home_subscribe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Pushes {revision} on every save and {revision: null, deleted: true} on delete.
    Only revision numbers are pushed; clients fetch the document themselves."""
    msg_id = msg["id"]
    if not _read_allowed(hass, connection, msg_id):
        return

    @callback
    def forward(home_id: str, revision: int | None) -> None:
        # Revocations apply to existing subscriptions as well as new requests.
        user = connection.user
        current = hass.data.get(DOMAIN)
        if current and user and user.is_active and (user.is_admin or user.id in current.viewer_user_ids):
            connection.send_message(websocket_api.event_message(msg_id, {"home_id": home_id, "revision": revision, "deleted": revision is None}))

    try:
        store = _store(hass)
        unsubscribe = store.async_subscribe(msg["home_id"], forward, id(connection))
    except ModelError as error:
        _error(connection, msg_id, error)
        return
    connection.subscriptions[msg_id] = unsubscribe
    connection.send_result(msg_id)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/plans", vol.Required("home_id"): HOME_ID})
@websocket_api.async_response
async def ws_plans(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        plans = await _store(hass).async_plans(msg["home_id"])
    except ModelError as error:
        _error(connection, msg["id"], error)
        return
    connection.send_result(msg["id"], {"plans": [plan.summary() for plan in reversed(plans)]})


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/plan/get", vol.Required("home_id"): HOME_ID, vol.Required("plan_id"): vol.All(str, vol.Length(max=80))})
@websocket_api.async_response
async def ws_plan_get(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Restoring is done by the editor: load this content into a draft and save
    it through home/save, so restores follow the same validation and revision check."""
    try:
        plans = await _store(hass).async_plans(msg["home_id"])
    except ModelError as error:
        _error(connection, msg["id"], error)
        return
    for plan in plans:
        if plan.plan_id == msg["plan_id"]:
            connection.send_result(msg["id"], {**plan.summary(), "content": plan.content})
            return
    connection.send_error(msg["id"], "plan_not_found", "unknown plan")


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/storage/status"})
@websocket_api.async_response
async def ws_storage_status(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        result = await _store(hass).async_storage_status()
    except ModelError as error:
        _error(connection, msg["id"], error)
        return
    connection.send_result(msg["id"], result)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "homemanager/history/purge", vol.Required("home_id"): HOME_ID, vol.Required("confirm"): vol.All(bool, True)})
@websocket_api.async_response
async def ws_history_purge(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        await _store(hass).async_purge_history(msg["home_id"])
    except ModelError as error:
        _error(connection, msg["id"], error)
        return
    connection.send_result(msg["id"])
