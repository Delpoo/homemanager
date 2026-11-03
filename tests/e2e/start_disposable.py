"""Create and start a fresh loopback-only HA on an ephemeral CI runner."""
import shutil
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen
from urllib.parse import urlunsplit

root = Path(sys.argv[1]).resolve()
if root.exists():
    raise SystemExit("Use a new disposable directory")
root.mkdir(parents=True)
component = sys.argv[2] if len(sys.argv) > 2 else "custom_components/homemanager"
shutil.copytree(component, root / "custom_components/homemanager", ignore=shutil.ignore_patterns("__pycache__"))
(root / "configuration.yaml").write_text('''homeassistant:
  name: HomeManager disposable test
  time_zone: UTC
  country: US
  unit_system: metric
  language: es
http:
  server_host: 127.0.0.1
  server_port: 18139
frontend:
config:
lovelace:
  mode: storage
onboarding:
api:
template:
  - light:
      - name: E2E lamp
        unique_id: e2e_lamp
        turn_on:
          - delay: 0
        turn_off:
          - delay: 0
        set_level:
          - delay: 0
      - name: E2E spot
        unique_id: e2e_spot
        turn_on:
          - delay: 0
        turn_off:
          - delay: 0
''', encoding="utf-8")
with (root / "process.log").open("wb") as output:
    process = subprocess.Popen([sys.executable, "-m", "homeassistant", "-c", str(root)], stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
for attempt in range(180):
    if process.poll() is not None:
        raise SystemExit("Disposable HA stopped before becoming ready")
    try:
        with urlopen(urlunsplit(("http", "127.0.0.1:18139", "/api/onboarding", "", "")), timeout=1) as response:
            if response.status == 200:
                break
    except OSError:
        time.sleep(1)
else:
    raise SystemExit("Disposable HA did not become ready")
