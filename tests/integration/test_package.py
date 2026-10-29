"""Audit the actual ZIP boundary, including deterministic output and refusal."""

import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import zipfile

import pytest

spec = importlib.util.spec_from_file_location("homemanager_package", Path(__file__).parents[2] / "scripts/package_integration.py")
packager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packager)


@pytest.fixture
def source(tmp_path):
    root = tmp_path / "component"
    for name in packager.ALLOWED:
        file = root / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(b"/* synthetic */")
    (root / "manifest.json").write_text(json.dumps({"requirements": []}), encoding="utf-8")
    return root


def test_archive_is_reproducible_allowlisted_and_checksummed(source, tmp_path):
    first, second = tmp_path / "first.zip", tmp_path / "second.zip"
    packager.package(source, first)
    packager.package(source, second)
    assert first.read_bytes() == second.read_bytes()
    assert first.with_suffix(".zip.sha256").read_text().split()[0] == hashlib.sha256(first.read_bytes()).hexdigest()
    with zipfile.ZipFile(first) as archive:
        assert set(archive.namelist()) == packager.ALLOWED
        for name in archive.namelist():
            assert archive.read(name) == (source / name).read_bytes()


def test_unexpected_private_file_is_refused_before_packaging(source, tmp_path):
    (source / "private-export.json").write_text("synthetic", encoding="utf-8")
    with pytest.raises(ValueError, match="unexpected"):
        packager.package(source, tmp_path / "output.zip")
    assert not (tmp_path / "output.zip").exists()


def test_sensitive_allowed_file_is_refused_without_logging_contents(source, tmp_path):
    (source / "frontend/homemanager.js").write_bytes(b"ghp_" + b"x" * 40)
    with pytest.raises(ValueError, match="sensitive"):
        packager.package(source, tmp_path / "output.zip")


def test_symlink_cannot_escape_package_source(source, tmp_path):
    target = tmp_path / "outside.txt"
    target.write_text("synthetic", encoding="utf-8")
    try:
        (source / "linked.txt").symlink_to(target)
    except OSError:
        pytest.skip("symlink creation requires a Windows privilege")
    with pytest.raises(ValueError, match="symlinks"):
        packager.package(source, tmp_path / "output.zip")


def test_release_requires_all_verification_and_never_publishes_automatically():
    import yaml
    root = Path(__file__).parents[2]
    workflow = yaml.load((root / ".github/workflows/release.yml").read_text(encoding="utf-8-sig"), Loader=yaml.BaseLoader)
    assert set(workflow["on"]) == {"workflow_dispatch"}
    assert workflow["jobs"]["verify"]["uses"] == "./.github/workflows/ci.yml"
    assert set(workflow["jobs"]["draft"]["needs"]) == {"resolve", "verify"}
    source_check = workflow["jobs"]["resolve"]["steps"][-1]["run"]
    assert "merge-base --is-ancestor" in source_check
    assert 'refs/tags/$TAG' in source_check
    assert 'test "$SHA" = "$WORKFLOW_SHA"' in source_check
    write_steps = workflow["jobs"]["draft"]["steps"]
    assert not any("checkout" in step.get("uses", "") for step in write_steps)
    commands = "\n".join(step.get("run", "") for step in write_steps)
    assert "--draft" in commands and "--verify-tag" in commands
    assert "--clobber" not in commands
    assert "npm " not in commands and "pip " not in commands


def test_public_scanner_cannot_skip_tracked_files_in_ignored_directories(tmp_path):
    repo = tmp_path / "public"
    (repo / "scripts").mkdir(parents=True)
    shutil.copyfile(Path(__file__).parents[2] / "scripts/check-public-boundary.mjs", repo / "scripts/check-public-boundary.mjs")
    shutil.copyfile(Path(__file__).parents[2] / "scripts/public-assets.mjs", repo / "scripts/public-assets.mjs")
    (repo / "docs").mkdir()
    (repo / "docs/public-assets.json").write_text('{"schemaVersion":1,"assets":[]}', encoding="utf-8")
    subprocess.run(["git", "init", "-q"], cwd=repo, check=True, capture_output=True)
    (repo / ".gitignore").write_text(".cache/\n", encoding="utf-8")
    (repo / ".cache").mkdir()
    sensitive = b"ghp_" + b"x" * 40
    (repo / ".cache/token.txt").write_bytes(sensitive)
    subprocess.run(["git", "add", "-f", ".cache/token.txt"], cwd=repo, check=True, capture_output=True)
    result = subprocess.run(["node", "scripts/check-public-boundary.mjs"], cwd=repo, capture_output=True)
    assert result.returncode == 1
    assert b"GitHub credential" in result.stderr
    assert sensitive not in result.stdout + result.stderr
    subprocess.run(["git", "rm", "--cached", "-f", ".cache/token.txt"], cwd=repo, check=True, capture_output=True)
    result = subprocess.run(["node", "scripts/check-public-boundary.mjs"], cwd=repo, capture_output=True)
    assert result.returncode == 0
