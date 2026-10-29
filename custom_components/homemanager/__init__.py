"""HomeManager: spatial floor-plan interface for Home Assistant.

The integration stores homes (spaces, devices, bindings and the SVG plan) in
.storage, exposes them over the authenticated websocket, serves the frontend
bundle and registers the HomeManager sidebar panel. Entity commands run in the
user's HA session. The optional RF remote manager (rf.py) is the only part that
calls services itself: it sends stored codes through ESPHome transmitters.
"""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from .const import CONF_GLOBAL_FRONTEND, CONF_VIEWER_USER_IDS, DOMAIN, FRONTEND_FILENAME, FRONTEND_URL_BASE, PANEL_ELEMENT, PANEL_ICON, PANEL_TITLE, PANEL_URL_PATH
from .rf import RfManager
from .rf_websocket import DATA_RF, async_register as async_register_rf
from .store import HomeManagerStore
from .websocket import async_register

_LOGGER = logging.getLogger(__name__)
FRONTEND_DIR = Path(__file__).parent / "frontend"
DATA_STATIC = f"{DOMAIN}_static_registered"
# Entities built from RF remotes (rf_entity.py).
PLATFORMS = [Platform.BUTTON, Platform.FAN, Platform.LIGHT]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    store = HomeManagerStore(hass)
    await store.async_load()
    store.viewer_user_ids = set(entry.options.get(CONF_VIEWER_USER_IDS, []))
    hass.data[DOMAIN] = store
    rf = RfManager(hass)
    await rf.async_load()
    hass.data[DATA_RF] = rf
    async_register(hass)
    async_register_rf(hass)
    await _async_register_frontend(hass)
    await _async_update_options(hass, entry)
    entry.async_on_unload(entry.add_update_listener(_async_update_options))
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    if not await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        return False
    frontend.async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)
    if url := hass.data.pop(f"{DOMAIN}_module_url", None):
        frontend.remove_extra_js_url(hass, url)
    if store := hass.data.pop(DOMAIN, None):
        store.async_close()
    hass.data.pop(DATA_RF, None)
    # Websocket commands and the static route cannot be unregistered in HA; they
    # answer "not loaded" errors through the missing store until the next setup.
    return True


def _bundle_version(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


async def _async_update_options(hass: HomeAssistant, entry: ConfigEntry) -> None:
    store = hass.data.get(DOMAIN)
    if store:
        store.viewer_user_ids = set(entry.options.get(CONF_VIEWER_USER_IDS, []))
    if url := hass.data.get(f"{DOMAIN}_module_url"):
        if entry.options.get(CONF_GLOBAL_FRONTEND, False):
            frontend.add_extra_js_url(hass, url)
        else:
            frontend.remove_extra_js_url(hass, url)


async def _async_register_frontend(hass: HomeAssistant) -> None:
    bundle = FRONTEND_DIR / FRONTEND_FILENAME
    if not await hass.async_add_executor_job(bundle.is_file):
        _LOGGER.error("Frontend bundle %s is missing; build it with `npm run build` or install a release package", bundle)
        return
    if not hass.data.get(DATA_STATIC):
        # The bundle is public MIT software and contains no household data, so a
        # cacheable static route is fine. Plans never use static routes.
        await hass.http.async_register_static_paths([StaticPathConfig(FRONTEND_URL_BASE, str(FRONTEND_DIR), True)])
        hass.data[DATA_STATIC] = True
    version = await hass.async_add_executor_job(_bundle_version, bundle)
    url = f"{FRONTEND_URL_BASE}/{FRONTEND_FILENAME}?v={version}"
    # The panel loads its own module. Loading on every dashboard/session is an
    # explicit integration option; existing installs also default to private.
    hass.data[f"{DOMAIN}_module_url"] = url
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name=PANEL_ELEMENT,
        frontend_url_path=PANEL_URL_PATH,
        module_url=url,
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        require_admin=False,
        config={},
    )
