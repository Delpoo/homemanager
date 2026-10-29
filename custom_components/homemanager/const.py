"""Constants for the HomeManager companion integration."""

from __future__ import annotations

DOMAIN = "homemanager"

STORAGE_VERSION = 1
STORAGE_MINOR_VERSION = 2
STORAGE_KEY = "homemanager.homes"
PLAN_STORAGE_KEY_PREFIX = "homemanager.plans."

# Same limits as the frontend contract (docs/contract.md). The configuration is
# sent to every viewer over the websocket, whose frames are limited to 4 MiB.
MAX_CONFIGURATION_BYTES = 3 * 1024 * 1024
MAX_PLAN_BYTES = 1024 * 1024
MAX_HOMES = 20
MAX_PLAN_HISTORY = 10
MAX_TITLE_LENGTH = 240
MAX_PLAN_STORES = 40
MAX_TOTAL_STORAGE_BYTES = 64 * 1024 * 1024
MAX_SUBSCRIPTIONS_PER_CONNECTION = 40
MAX_SUBSCRIPTIONS_TOTAL = 400
CONF_VIEWER_USER_IDS = "viewer_user_ids"
CONF_GLOBAL_FRONTEND = "load_on_all_pages"
SCHEMA_VERSION = 2

FRONTEND_URL_BASE = "/homemanager_files"
FRONTEND_FILENAME = "homemanager.js"
PANEL_URL_PATH = "homemanager"
PANEL_ELEMENT = "homemanager-app"
PANEL_TITLE = "HomeManager"
PANEL_ICON = "mdi:floor-plan"

SIGNAL_HOME_UPDATED = f"{DOMAIN}_home_updated"
