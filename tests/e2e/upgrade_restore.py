"""Cold full-config backup, actual beta.1 upgrade, and rollback on loopback CI."""
import asyncio
import io
import json
from pathlib import Path
import runpy
import shutil
import subprocess
import sys
import tarfile
import time
from urllib.request import urlopen
from urllib.parse import urlunsplit

import aiohttp

BASE = urlunsplit(("http", "127.0.0.1:18139", "", "", ""))
ROOT = Path(".work/disposable-ha").resolve()
OLD = Path(".work/beta1-source").resolve()
BACKUP = Path(".work/beta1-full-backup").resolve()
assert not any(p.exists() for p in (ROOT, OLD, BACKUP)), "Fresh runner directories required"
subprocess.run(["git", "fetch", "origin", "tag", "v0.11.0-beta.1"], check=True)
archive = subprocess.check_output(["git", "archive", "v0.11.0-beta.1", "src", "custom_components", "schemas"])
OLD.mkdir()
with tarfile.open(fileobj=io.BytesIO(archive)) as bundle:
    bundle.extractall(OLD, filter="data")
component = OLD / "custom_components/homemanager"
assert json.loads((component / "manifest.json").read_text())["version"] == "0.11.0-beta.1"
subprocess.run([str(Path("node_modules/.bin/esbuild").resolve()), str(OLD / "src/card/index.ts"), "--bundle", "--format=esm", "--target=es2022", '--define:__HOMEMANAGER_VERSION__="0.11.0-beta.1"', "--outfile=" + str(component / "frontend/homemanager.js")], check=True)
sys.argv = ["start_disposable.py", str(ROOT), str(component)]
process = runpy.run_path("tests/e2e/start_disposable.py")["process"]

def stop():
    process.terminate()
    process.wait(timeout=45)

def restart():
    global process
    with (ROOT / "process.log").open("ab") as log:
        process = subprocess.Popen([sys.executable, "-m", "homeassistant", "-c", str(ROOT)], stdout=log, stderr=subprocess.STDOUT)
    for _ in range(180):
        assert process.poll() is None, "HA stopped"
        try:
            with urlopen(BASE + "/api/", timeout=1):
                return
        except Exception as error:
            # An unauthenticated 401 also establishes that HTTP is listening.
            if getattr(error, "code", None) == 401:
                return
            time.sleep(1)
    raise RuntimeError("Restart timed out")

subprocess.run([sys.executable, "tests/e2e/prepare_local_ha.py", BASE, str(ROOT / "TEST_CREDENTIALS.local.json")], check=True)
credentials = json.loads((ROOT / "TEST_CREDENTIALS.local.json").read_text())

async def call(message):
    async with aiohttp.ClientSession() as http:
        async with http.ws_connect(BASE.replace("http:", "ws:") + "/api/websocket") as ws:
            await ws.receive_json()
            await ws.send_json({"type": "auth", "access_token": credentials["tokens"]["access_token"]})
            assert (await ws.receive_json())["type"] == "auth_ok"
            await ws.send_json({"id": 1, **message})
            while True:
                result = await ws.receive_json()
                if result.get("id") == 1:
                    assert result.get("success"), result.get("error")
                    return result.get("result")

def request(message):
    return asyncio.run(call(message))

def ready():
    for _ in range(90):
        try:
            return request({"type": "homemanager/homes"})
        except (AssertionError, aiohttp.ClientError):
            time.sleep(1)
    raise RuntimeError("Integration not ready")

def preserves(before, after):
    if isinstance(before, dict):
        for key, value in before.items():
            assert key in after, key
            preserves(value, after[key])
    elif isinstance(before, list):
        assert len(before) == len(after)
        for old, new in zip(before, after):
            preserves(old, new)
    else:
        assert before == after, "Stored values changed"

try:
    ready()
    config = {"schemaVersion": 2, "rooms": [{"id": "office", "label": "Office"}], "catalog": {"schemaVersion": 2, "devices": []}, "architecture": {"format": "svg", "content": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><rect id="room-office" width="100" height="80"/></svg>'}, "actions": {}, "panels": {}, "stateSources": {}}
    config["catalog"]["devices"] = [{"id": "lamp", "roomId": "office", "kind": "light", "position": {"x": 0.25, "y": 0.5}, "mobility": "editable", "display": {"label": "Fictional lamp", "icon": "mdi:lamp"}, "bindings": {"entityId": "light.e2e_lamp", "primaryAction": "toggle", "advancedPopupId": None}, "state": {"value": "unknown", "confidence": "unknown"}}]
    config["actions"] = {"toggle": {"domain": "light", "service": "toggle", "target": {"entity_id": "light.e2e_lamp"}}}
    request({"type": "homemanager/home/save", "home_id": "upgrade", "expected_revision": None, "configuration": config})
    request({"type": "homemanager/rf/remote/save", "remote_id": "fictional", "remote": {"name": "Fictional", "transmitter": "test_tx"}})
    request({"type": "homemanager/rf/button/save", "remote_id": "fictional", "button": {"name": "On"}, "code": "101101011001011001110101"})
    home = request({"type": "homemanager/home/get", "home_id": "upgrade"})
    rf = request({"type": "homemanager/rf/library"})
    stop()
    shutil.copytree(ROOT, BACKUP)
    shutil.rmtree(ROOT / "custom_components/homemanager")
    shutil.copytree("custom_components/homemanager", ROOT / "custom_components/homemanager", ignore=shutil.ignore_patterns("__pycache__"))
    restart()
    ready()
    preserves(home, request({"type": "homemanager/home/get", "home_id": "upgrade"}))
    preserves(rf, request({"type": "homemanager/rf/library"}))
    upgraded = {**config, "nowPanels": {"home": [{"id": "reading", "type": "reading", "readings": ["sensor.fictional"]}]}}
    request({"type": "homemanager/home/save", "home_id": "upgrade", "expected_revision": home["revision"], "configuration": upgraded})
    stop()
    restart()
    ready()
    assert request({"type": "homemanager/home/get", "home_id": "upgrade"})["configuration"] == upgraded
    print("ok: beta.1 upgraded, RF library preserved, beta.2 saved and survived restart", flush=True)
    subprocess.run(["node", "tests/e2e/redesign.e2e.mjs"], check=True, env={**__import__("os").environ, "HM_E2E_CREDENTIALS": str(ROOT / "TEST_CREDENTIALS.local.json")})
    stop()
    # Retain the upgraded state independently; restore only this known test root.
    ROOT.rename(ROOT.with_name("beta2-before-rollback"))
    shutil.copytree(BACKUP, ROOT)
    restart()
    ready()
    assert request({"type": "homemanager/home/get", "home_id": "upgrade"}) == home
    assert request({"type": "homemanager/rf/library"}) == rf
    assert json.loads((ROOT / "custom_components/homemanager/manifest.json").read_text())["version"] == "0.11.0-beta.1"
    print("ok: full cold backup restored beta.1 code, home, RF library and authenticated access", flush=True)
finally:
    if process.poll() is None:
        stop()
