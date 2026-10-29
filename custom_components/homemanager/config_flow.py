"""Private-by-default access and an explicit opt-in to global frontend loading."""

from __future__ import annotations

from typing import Any
import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import CONF_GLOBAL_FRONTEND, CONF_VIEWER_USER_IDS, DOMAIN


async def _options_schema(hass, options: dict[str, Any]) -> vol.Schema:
    users = await hass.auth.async_get_users()
    viewers = [{"value": user.id, "label": user.name or user.id} for user in users if user.is_active and not user.is_admin and not user.system_generated]
    return vol.Schema({
        vol.Optional(CONF_VIEWER_USER_IDS, default=options.get(CONF_VIEWER_USER_IDS, [])): selector.SelectSelector(selector.SelectSelectorConfig(options=viewers, multiple=True, mode=selector.SelectSelectorMode.DROPDOWN)),
        vol.Optional(CONF_GLOBAL_FRONTEND, default=options.get(CONF_GLOBAL_FRONTEND, False)): bool,
    })


async def _valid_viewers(hass, user_input: dict[str, Any]) -> bool:
    selected = user_input.get(CONF_VIEWER_USER_IDS, [])
    users = await hass.auth.async_get_users()
    allowed = {user.id for user in users if user.is_active and not user.is_admin and not user.system_generated}
    return isinstance(selected, list) and len(selected) <= 100 and all(isinstance(value, str) and value in allowed for value in selected)


class HomeManagerConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            if await _valid_viewers(self.hass, user_input):
                return self.async_create_entry(title="HomeManager", data={}, options=user_input)
            return self.async_show_form(step_id="user", data_schema=await _options_schema(self.hass, {}), errors={"base": "invalid_viewers"})
        return self.async_show_form(step_id="user", data_schema=await _options_schema(self.hass, {}))

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> HomeManagerOptionsFlow:
        return HomeManagerOptionsFlow()


class HomeManagerOptionsFlow(OptionsFlow):
    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors = {}
        if user_input is not None:
            if await _valid_viewers(self.hass, user_input):
                return self.async_create_entry(title="", data=user_input)
            errors["base"] = "invalid_viewers"
        return self.async_show_form(step_id="init", data_schema=await _options_schema(self.hass, dict(self.config_entry.options)), errors=errors)
