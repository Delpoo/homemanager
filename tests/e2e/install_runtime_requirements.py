"""Install real HA service-description imports, beyond the pytest harness.

HA imports base entity components when serializing get_services. Their runtime
requirements are not all dependencies of the minimal pytest installation.
Read the installed release's manifests so versions stay aligned with that HA.
"""
import ast
import json
from pathlib import Path
import subprocess
import sys

import homeassistant

root = Path(homeassistant.__file__).parent
source = ast.parse((root / "helpers/service.py").read_text(encoding="utf-8"))
base = next(node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == "_base_components")
pending = [alias.name for node in ast.walk(base) if isinstance(node, ast.ImportFrom) and node.module == "homeassistant.components" for alias in node.names]
# Onboarding creates these default config flows even on a minimal installation.
pending.extend(["google_translate", "met"])
seen = set()
requirements = set()
while pending:
    domain = pending.pop()
    if domain in seen:
        continue
    seen.add(domain)
    path = root / "components" / domain / "manifest.json"
    if not path.is_file():
        continue
    manifest = json.loads(path.read_text(encoding="utf-8"))
    requirements.update(manifest.get("requirements", []))
    pending.extend(manifest.get("dependencies", []))
assert requirements, "No HA runtime requirements found"
subprocess.run([sys.executable, "-m", "pip", "install", *sorted(requirements)], check=True)
