"""Build .work/release/homemanager.zip for a HACS integration release (zip_release).

The archive contains the files of custom_components/homemanager at its root,
including the frontend bundle produced by `npm run build`. Run after the build;
it never publishes anything.
"""

from pathlib import Path
import hashlib
import json
import re
import sys
import zipfile

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "custom_components" / "homemanager"
# Outside dist/ and the publication scan: a release asset is reviewed when attached.
TARGET = ROOT / ".work" / "release" / "homemanager.zip"

ALLOWED = frozenset({
    "__init__.py", "config_flow.py", "const.py", "errors.py", "manifest.json",
    "model.py", "storage_policy.py", "store.py", "strings.json", "svg.py",
    "validation.py", "websocket.py", "translations/en.json", "translations/es.json",
    "frontend/homemanager.js",
})
SENSITIVE = re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b|\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b")


def package(source: Path = SOURCE, target: Path = TARGET) -> None:
    files: dict[str, bytes] = {}
    for path in source.rglob("*"):
        if path.is_symlink():
            raise ValueError("symlinks are forbidden in release inputs")
        if "__pycache__" in path.parts or not path.is_file():
            continue
        name = path.relative_to(source).as_posix()
        if name not in ALLOWED:
            raise ValueError("unexpected file in release inputs; review the package allowlist")
        body = path.read_bytes()
        if len(body) > 2_000_000 or SENSITIVE.search(body):
            raise ValueError("oversized or sensitive release input; content is not logged")
        files[name] = body
    if set(files) != ALLOWED:
        raise ValueError("missing release input; build the frontend first")
    manifest = json.loads(files["manifest.json"])
    if manifest["requirements"] != []:
        raise ValueError("new runtime dependencies require an explicit package review")
    target.parent.mkdir(parents=True, exist_ok=True)
    # Fixed order, timestamp and permissions make independent builds comparable.
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, body in sorted(files.items()):
            entry = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, body, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    with zipfile.ZipFile(target) as archive:
        if set(archive.namelist()) != ALLOWED or any(archive.read(name) != files[name] for name in files):
            raise ValueError("release archive verification failed")
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    target.with_suffix(target.suffix + ".sha256").write_text(f"{digest}  {target.name}\n", encoding="utf-8")


if __name__ == "__main__":
    try:
        package()
    except (ValueError, OSError) as error:
        sys.exit(f"Package refused: {error}")
    print(f"Wrote and verified {TARGET.relative_to(ROOT)} ({TARGET.stat().st_size} bytes)")
