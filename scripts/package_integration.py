"""Build .work/release/homemanager.zip for a HACS integration release (zip_release).

The archive contains the files of custom_components/homemanager at its root,
including the frontend bundle produced by `npm run build`. Run after the build;
it never publishes anything.
"""

from pathlib import Path
import sys
import zipfile

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "custom_components" / "homemanager"
# Outside dist/ and the publication scan: a release asset is reviewed when attached.
TARGET = ROOT / ".work" / "release" / "homemanager.zip"

bundle = SOURCE / "frontend" / "homemanager.js"
if not bundle.is_file():
    sys.exit("Missing frontend bundle: run `npm run build` first.")
TARGET.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(TARGET, "w", zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(SOURCE.rglob("*")):
        if path.is_file() and "__pycache__" not in path.parts:
            archive.write(path, path.relative_to(SOURCE).as_posix())
print(f"Wrote {TARGET.relative_to(ROOT)} ({TARGET.stat().st_size} bytes)")
