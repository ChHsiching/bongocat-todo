#!/usr/bin/env python3
"""Generate a .SRCINFO file from a PKGBUILD.

AUR requires .SRCINFO alongside PKGBUILD. Ubuntu CI runners don't have
makepkg, so this script parses the PKGBUILD's bash syntax with regex and
emits the .SRCINFO format (key = value, one per line).

Handles:
  - Scalar variables: pkgver=1.3.1
  - Array variables: depends=(webkit2gtk-4.1 gtk3 ...)
  - Architecture-specific arrays: source_x86_64=(...), sha256sums_aarch64=(...)

Usage:
  python scripts/gen-srcinfo.py packaging/aur/bongo-cat-todo/PKGBUILD > .SRCINFO
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


def parse_pkgbuild(text: str) -> dict[str, list[str] | str]:
    """Parse PKGBUILD variables using regex. Returns {var_name: value}.

    Scalars are stored as str; arrays (including arch-specific) as list[str].
    """
    vars_: dict[str, list[str] | str] = {}

    # Match array assignments: name=(values)  or  name = (values)
    # Values may be quoted ('foo') or unquoted, separated by whitespace.
    array_re = re.compile(
        r'^(\w+)\s*=\s*\(([^)]*)\)', re.MULTILINE
    )
    # Match scalar assignments: name=value or name = value
    # Must NOT match arrays (no opening paren).
    scalar_re = re.compile(
        r'^(\w+)\s*=\s*([^(\n].*?)$', re.MULTILINE
    )

    consumed_lines: set[int] = set()

    for m in array_re.finditer(text):
        name = m.group(1)
        raw = m.group(2)
        # Split by whitespace, strip quotes
        items = [v.strip("'\"") for v in raw.split() if v.strip()]
        vars_[name] = items
        # Mark lines covered by this match
        for i in range(text.count('\n', 0, m.start()),
                       text.count('\n', 0, m.end()) + 1):
            consumed_lines.add(i)

    for m in scalar_re.finditer(text):
        name = m.group(1)
        if name in vars_:
            continue  # already parsed as array
        line_idx = text.count('\n', 0, m.start())
        if line_idx in consumed_lines:
            continue
        raw = m.group(2).strip()
        # Strip surrounding quotes
        if (raw.startswith("'") and raw.endswith("'")) or \
           (raw.startswith('"') and raw.endswith('"')):
            raw = raw[1:-1]
        # Skip comments, function defs, etc.
        if name.startswith('_') or not name.replace('_', '').isalnum():
            continue
        vars_[name] = raw

    return vars_


def emit_srcinfo(vars_: dict[str, list[str] | str]) -> str:
    """Emit .SRCINFO format from parsed variables."""
    lines: list[str] = []

    # pkgbase is always first
    pkgname = vars_.get('pkgname', '')
    if isinstance(pkgname, list):
        pkgname = pkgname[0] if pkgname else ''
    # pkgbase = pkgname without -bin/-git suffix for split packages,
    # but for single packages pkgbase == pkgname
    pkgbase = pkgname
    if pkgbase.endswith('-bin') or pkgbase.endswith('-git'):
        pkgbase = re.sub(r'-(bin|git)$', '', pkgbase)

    lines.append(f'pkgbase = {pkgbase}')

    # Scalar fields (in conventional order)
    scalar_order = [
        'pkgdesc', 'url', 'install', 'changelog',
        'epoch', 'license', 'groups',
    ]
    for key in scalar_order:
        val = vars_.get(key)
        if val is None:
            continue
        if isinstance(val, list):
            for v in val:
                lines.append(f'\t{key} = {v}')
        else:
            lines.append(f'\t{key} = {val}')

    # arch
    arch = vars_.get('arch')
    if isinstance(arch, list):
        for a in arch:
            lines.append(f'\tarch = {a}')

    # pkgver, pkgrel
    for key in ('pkgver', 'pkgrel'):
        val = vars_.get(key)
        if val is not None and not isinstance(val, list):
            lines.append(f'\t{key} = {val}')

    # Array fields (depends, makedepends, etc.)
    array_fields = [
        'depends', 'makedepends', 'checkdepends', 'optdepends',
        'provides', 'conflicts', 'replaces', 'options',
        'backup', 'validpgpkeys',
    ]
    for key in array_fields:
        val = vars_.get(key)
        if isinstance(val, list):
            for v in val:
                lines.append(f'\t{key} = {v}')

    # source, sha256sums, md5sums, etc. (including arch-specific)
    for key in sorted(vars_.keys()):
        if key in ('source', 'sha256sums', 'sha512sums', 'md5sums', 'b2sums',
                   'noextract', 'validpgpkeys') or \
           re.match(r'(source|sha256sums|sha512sums|md5sums|b2sums)_', key):
            if key in array_fields:
                continue  # already handled
            val = vars_[key]
            if isinstance(val, list):
                for v in val:
                    lines.append(f'\t{key} = {v}')

    # pkgname (for single-package, pkgname = pkgbase)
    lines.append('')
    lines.append(f'pkgname = {pkgname}')

    return '\n'.join(lines) + '\n'


def main() -> int:
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <PKGBUILD>", file=sys.stderr)
        return 1

    pb = Path(sys.argv[1]).read_text(encoding='utf-8')
    vars_ = parse_pkgbuild(pb)
    srcinfo = emit_srcinfo(vars_)
    sys.stdout.write(srcinfo)
    return 0


if __name__ == '__main__':
    sys.exit(main())
