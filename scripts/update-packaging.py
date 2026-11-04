#!/usr/bin/env python3
"""Rewrite packaging recipes (AUR PKGBUILDs + Homebrew Cask) for a release.

Pure string-rewriting script: SHA256 values are supplied via env vars by the
calling CI workflow (which fetches them from the GitHub release API in one
batch, much cheaper than re-downloading every asset here).

Reads env vars (each is a 64-char lowercase hex sha256):
  SHA_TARBALL      - source tarball (codeload .../v<ver>.tar.gz)
  SHA_DEB_AMD64    - BongoCat.Todo_<ver>_amd64.deb
  SHA_DEB_ARM64    - BongoCat.Todo_<ver>_arm64.deb
  SHA_DMG_AARCH64  - BongoCat.Todo_<ver>_aarch64.dmg
  SHA_DMG_X64      - BongoCat.Todo_<ver>_x64.dmg

Usage:
  python scripts/update-packaging.py \
      --version 1.3.0 \
      --source-pkgbuild packaging/aur/bongo-cat-todo/PKGBUILD \
      --bin-pkgbuild    packaging/aur/bongo-cat-todo-bin/PKGBUILD \
      --cask            packaging/homebrew/bongo-cat-todo.rb
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

PLACEHOLDER = "0" * 64


def require_sha(env_key: str) -> str:
    val = os.environ.get(env_key, "").strip().lower()
    if not val or val == PLACEHOLDER or not re.fullmatch(r"[0-9a-f]{64}", val):
        raise SystemExit(
            f"missing or invalid {env_key} (expected 64-char hex sha256)"
        )
    return val


def set_version(text: str, version: str) -> str:
    return re.sub(r"^pkgver=.*$", f"pkgver={version}", text, flags=re.M)


def rewrite_source_pkgbuild(text: str, version: str, tarball_sha: str) -> str:
    text = set_version(text, version)
    return re.sub(
        r"(sha256sums=\(')[0-9a-f]{64}('\))",
        rf"\g<1>{tarball_sha}\g<2>",
        text,
    )


def rewrite_bin_pkgbuild(
    text: str, version: str, amd64_sha: str, arm64_sha: str
) -> str:
    text = set_version(text, version)
    text = re.sub(
        r"(sha256sums_x86_64=\(')[0-9a-f]{64}('\))",
        rf"\g<1>{amd64_sha}\g<2>",
        text,
    )
    text = re.sub(
        r"(sha256sums_aarch64=\(')[0-9a-f]{64}('\))",
        rf"\g<1>{arm64_sha}\g<2>",
        text,
    )
    return text


def rewrite_cask(text: str, version: str, aarch64_sha: str, x64_sha: str) -> str:
    text = re.sub(
        r'(^\s*version\s+")\d+\.\d+\.\d+(")',
        rf"\g<1>{version}\g<2>",
        text,
        flags=re.M,
    )

    def replace_first_sha(block: str, sha: str) -> str:
        return re.sub(
            r'(sha256 ")[0-9a-f]{64}(")',
            rf"\g<1>{sha}\g<2>",
            block,
            count=1,
        )

    m_arm = re.search(r"\bon_arm do\b", text)
    m_intel = re.search(r"\bon_intel do\b", text)
    if not m_arm or not m_intel or m_arm.start() >= m_intel.start():
        raise SystemExit("Cask template missing on_arm/on_intel blocks in order")
    head = text[: m_arm.start()]
    arm_block = text[m_arm.start() : m_intel.start()]
    intel_block = text[m_intel.start() :]
    return (
        head
        + replace_first_sha(arm_block, aarch64_sha)
        + replace_first_sha(intel_block, x64_sha)
    )


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--version", required=True)
    p.add_argument("--source-pkgbuild", type=Path)
    p.add_argument("--bin-pkgbuild", type=Path)
    p.add_argument("--cask", type=Path)
    args = p.parse_args()

    ver = args.version.lstrip("v")

    tarball_sha = require_sha("SHA_TARBALL")
    amd64_sha = require_sha("SHA_DEB_AMD64")
    arm64_sha = require_sha("SHA_DEB_ARM64")
    aarch64_sha = require_sha("SHA_DMG_AARCH64")
    x64_sha = require_sha("SHA_DMG_X64")

    if args.source_pkgbuild:
        txt = rewrite_source_pkgbuild(
            args.source_pkgbuild.read_text(encoding="utf-8"), ver, tarball_sha
        )
        args.source_pkgbuild.write_text(txt, encoding="utf-8")
        print(f"updated {args.source_pkgbuild}", file=sys.stderr)
    if args.bin_pkgbuild:
        txt = rewrite_bin_pkgbuild(
            args.bin_pkgbuild.read_text(encoding="utf-8"),
            ver,
            amd64_sha,
            arm64_sha,
        )
        args.bin_pkgbuild.write_text(txt, encoding="utf-8")
        print(f"updated {args.bin_pkgbuild}", file=sys.stderr)
    if args.cask:
        txt = rewrite_cask(
            args.cask.read_text(encoding="utf-8"), ver, aarch64_sha, x64_sha
        )
        args.cask.write_text(txt, encoding="utf-8")
        print(f"updated {args.cask}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
