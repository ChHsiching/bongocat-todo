# Packaging

This directory holds the **source-of-truth** packaging recipes for the fork's
non-bundle distribution channels (Homebrew Cask + AUR). The CI workflow
`.github/workflows/update-packaging.yml` reads these templates on each published
release, rewrites version + checksums, and pushes the result to:

- `ChHsiching/homebrew-tap` → `Casks/bongo-cat-todo.rb`
- AUR `bongo-cat-todo` → `PKGBUILD` (source build)
- AUR `bongo-cat-todo-bin` → `PKGBUILD` (prebuilt .deb)

## Layout

```
packaging/
├── README.md                       # this file
├── aur/
│   ├── bongo-cat-todo/PKGBUILD     # source compile (cargo + pnpm + tauri build)
│   └── bongo-cat-todo-bin/PKGBUILD # prebuilt .deb extract
└── homebrew/
    └── bongo-cat-todo.rb           # Cask (dmg), arch-aware (on_arm / on_intel)
```

## Conventions

### Versioning

`pkgver` / `cask version` are the **single source of truth** in
`package.json`. CI reads `version` from `package.json` (matches the `v*` tag
that triggered the release) and substitutes it into every recipe. Never edit
the version in these files manually unless you're testing locally.

### Checksums

All `sha256sums` / `sha256` entries are **placeholders** (64 zero-hex chars).
CI computes the real SHA256 from the actual GitHub Release assets at publish
time and rewrites them. This keeps the templates stable across releases.

### Two AUR packages

Per AUR convention we ship two packages:

| Package | Strategy | Use when |
|---------|----------|----------|
| `bongo-cat-todo` | Compiles from GitHub source tarball (`pnpm tauri build`) | You want to audit the build or run a custom toolchain |
| `bongo-cat-todo-bin` | Unpacks the official `.deb` from GitHub Releases | You want fast install, trust the release artifacts |

Both `conflicts` + `provides` `bongo-cat-todo`, so `pacman` refuses to install
both simultaneously.

### Homebrew Cask

GUI apps ship as a **Cask** (not a Formula). The Cask is arch-aware: on Apple
Silicon it pulls `BongoCat.Todo_<ver>_aarch64.dmg`, on Intel
`BongoCat.Todo_<ver>_x64.dmg`. The `.app` bundle name is `BongoCat Todo.app`
(from `productName` in `tauri.conf.json`).

## Local testing

These recipes are not exercised by the regular test suite. To validate
locally:

```bash
# PKGBUILD syntax (requires bash + namcap optional)
bash -n packaging/aur/bongo-cat-todo/PKGBUILD
bash -n packaging/aur/bongo-cat-todo-bin/PKGBUILD

# Cask style (if you have brew installed locally)
brew style packaging/homebrew/bongo-cat-todo.rb
```

Full AUR build verification (`makepkg -si`) requires an Arch environment and
is expected to be done by the maintainer or in CI.
