"""Prepare a DISPOSABLE local Home Assistant for tests/e2e/local-ha.e2e.mjs.

Never run it against a real installation: it onboards a fresh instance with a
generated test account, adds the HomeManager integration through its config
flow and puts `light.e2e_lamp` in an area called "Salón". Refuses non-local
URLs and already-onboarded instances.

Usage (with the Python environment that runs HA, which has aiohttp):
    python tests/e2e/prepare_local_ha.py <URL of the local test instance> path/to/TEST_CREDENTIALS.local.json
The credentials file stays next to the disposable instance; never commit it.
"""

from __future__ import annotations

import asyncio
import json
import secrets
import sys
from urllib.parse import urlparse

import aiohttp


async def main(base: str, output: str) -> None:
    if urlparse(base).hostname not in {"127.0.0.1", "localhost", "::1"}:
        sys.exit("Only a local disposable instance is allowed.")
    client_id = base.rstrip("/") + "/"
    async with aiohttp.ClientSession() as http:
        steps = await (await http.get(f"{base}/api/onboarding")).json()
        if any(step["done"] for step in steps):
            sys.exit("This instance is already onboarded; use a fresh, disposable configuration directory.")
        password = secrets.token_urlsafe(18)
        response = await http.post(
            f"{base}/api/onboarding/users",
            json={"client_id": client_id, "name": "E2E Admin", "username": "e2e-admin", "password": password, "language": "es"},
        )
        code = (await response.json())["auth_code"]
        tokens = await (await http.post(f"{base}/auth/token", data={"grant_type": "authorization_code", "code": code, "client_id": client_id})).json()
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}
        # Written first: a failure in a later step must not lose the only credentials.
        with open(output, "w", encoding="utf-8") as file:
            json.dump({"note": "Disposable local HA test instance only", "username": "e2e-admin", "password": password, "tokens": tokens, "hassUrl": base, "clientId": client_id}, file, indent=2)
        for step, payload in (("core_config", {}), ("analytics", {}), ("integration", {"client_id": client_id, "redirect_uri": client_id + "?auth_callback=1"})):
            await http.post(f"{base}/api/onboarding/{step}", json=payload, headers=headers)
        flow = await (await http.post(f"{base}/api/config/config_entries/flow", json={"handler": "homemanager"}, headers=headers)).json()
        result = await (await http.post(f"{base}/api/config/config_entries/flow/{flow['flow_id']}", json={}, headers=headers)).json()
        assert result.get("type") == "create_entry", result
        async with http.ws_connect(f"{base}/api/websocket") as ws:
            await ws.receive_json()
            await ws.send_json({"type": "auth", "access_token": tokens["access_token"]})
            assert (await ws.receive_json())["type"] == "auth_ok"

            async def call(message_id: int, message: dict) -> dict:
                await ws.send_json({"id": message_id, **message})
                while True:
                    reply = await ws.receive_json()
                    if reply.get("id") == message_id:
                        if not reply.get("success"):
                            sys.exit(f"{message['type']} failed: {reply.get('error')}")
                        return reply["result"]

            # Onboarding in Spanish already creates "Salón"; reuse it when present.
            areas = await call(1, {"type": "config/area_registry/list"})
            area = next((item for item in areas if item["name"] == "Salón"), None) or await call(3, {"type": "config/area_registry/create", "name": "Salón"})
            await call(2, {"type": "config/entity_registry/update", "entity_id": "light.e2e_lamp", "area_id": area["area_id"]})
    print(f"Instance ready: HomeManager configured, light.e2e_lamp in area 'Salón'. Credentials in {output}.")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2]))
