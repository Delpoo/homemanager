"""Fixtures. All data is synthetic; no household plan or entity appears here."""

from pathlib import Path

import pytest

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homemanager.const import DOMAIN

PLAN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><rect id="room-studio" width="50" height="80"/></svg>'


def configuration(plan: str = PLAN, label: str = "Studio") -> dict:
    return {
        "schemaVersion": 2,
        "rooms": [{"id": "studio", "label": label}],
        "catalog": {"schemaVersion": 2, "devices": []},
        "architecture": {"format": "svg", "content": plan},
        "actions": {},
        "panels": {},
        "stateSources": {},
        "commandTtlSeconds": 30,
    }


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    yield


@pytest.fixture
def bundle_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A synthetic frontend bundle; the real one is produced by `npm run build`."""
    directory = tmp_path / "frontend"
    directory.mkdir()
    (directory / "homemanager.js").write_text("customElements.define('homemanager-test', class extends HTMLElement {});", encoding="utf-8")
    monkeypatch.setattr("custom_components.homemanager.FRONTEND_DIR", directory)
    return directory


@pytest.fixture
async def setup_integration(hass, bundle_dir):
    entry = MockConfigEntry(domain=DOMAIN, unique_id=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry
