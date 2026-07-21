# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Package managers

- JS/TS: `pnpm` only, workspace-wide (`pnpm@10.4.1` pinned in root `package.json`). Do not use npm/yarn.
- Python (build/CI scripts): `uv` — e.g. `uv run scripts/pre_build.py`.
- Rust: `cargo`, via the workspace at the repo root (`Cargo.toml`, member: `desktop/src-tauri`).

## Commands

Root-level (applies across `desktop/` and `website/`):

```console
pnpm format              # prettier --write .
pnpm format:check         # prettier --check .
pnpm check-types          # tsc --noEmit for both desktop/ and website/
pnpm check:i18n           # uv run scripts/check_i18n.py — validates i18n/translations/*/desktop.json keys are in sync
```

Desktop app (`desktop/`):

```console
cd desktop
pnpm install
uv run ../scripts/pre_build.py           # downloads the Sona runner sidecar binary + platform deps, needed once before first build/dev
pnpm exec tauri dev                      # run the full app (Rust + frontend)
pnpm exec tauri build                    # production build
pnpm dev                                 # frontend only (vite) — Tauri IPC (window.__TAURI_INTERNALS__) is unavailable, so invoke() calls will hang/reject; only useful for pure-UI iteration
pnpm i18n:generate                       # recompile Paraglide messages after editing i18n/translations/*/desktop.json — required, generated files under src/paraglide are not hand-edited
pnpm lint                                # eslint .
pnpm test                                # vitest run
pnpm exec vitest run path/to/file.test.ts -t "test name"   # run a single test
```

Rust backend (`desktop/src-tauri/`):

```console
cargo fmt
cargo clippy
RUST_LOG=trace cargo test -- --nocapture
cargo test <test_name> -- --nocapture      # run a single test
```

One-step dev/build (equivalent to the pre_build + tauri dev/build combo above):

```console
uv run scripts/pre_build.py --dev     # or --build
```

Building Sona (the transcription runner sidecar) locally instead of using the prebuilt download — see `docs/building.md` for the full platform-specific steps (MSYS2 setup on Windows, `diarize-rs`/whisper.cpp lib downloads, copying the binary into `desktop/src-tauri/binaries/` and `target/debug/sona` for `tauri dev` to pick it up).

Website (`website/`) uses the same `dev`/`build`/`test`/`i18n:generate` script shape as `desktop/`.

## Architecture

### Component split

- **`desktop/`** — the Tauri app. Rust backend in `desktop/src-tauri/src/`, React/TypeScript frontend in `desktop/src/`. Handles UI, file management, settings, analytics, and spawns/talks to the Sona runner over local HTTP.
- **Sona runner** — a separate Rust + whisper.cpp process (its own repo, `github.com/thewh1teagle/sona`, referenced here via `.sona-version`) that does the actual transcription: model loading, streaming, and in-process diarization (`diarize-rs`). It's bundled as a `sona` sidecar binary, not built from this repo in normal dev flow — `scripts/pre_build.py` downloads the prebuilt binary matching `.sona-version` into `desktop/src-tauri/binaries/`. To fix a transcription runtime bug, the fix usually belongs in the **Sona** repo, then bump `.sona-version` here — not in `desktop/`.
- **FFmpeg** is bundled alongside Sona on macOS/Windows; its path is passed to Sona via `SONA_FFMPEG_PATH`.
- **`website/`** — the marketing/download site (Vite + React), independent of the desktop app's build.

### Rust backend (`desktop/src-tauri/src/`)

- Tauri commands are grouped under `cmd/` by domain (`app.rs`, `audio.rs`, `download.rs`, `files.rs`, `permissions.rs`, `sona_cmd.rs`, `transcribe.rs`, `ui.rs`, `ytdlp.rs`) and registered in `main.rs`'s `invoke_handler` list — new commands must be added there to be callable from the frontend.
- `sona/` (Rust module, distinct from the external Sona *repo*) is the client-side process/device management for talking to the Sona sidecar (`process.rs`, `devices.rs`).
- Persistent app state (preferences, pairing data, etc.) is read/written via `tauri-plugin-store` JSON stores (see `config.rs` for store filenames/keys, e.g. `display_lock.rs`'s use of `DISPLAY_LOCK_STORE_FILENAME`).
- `display_lock.rs` implements a kiosk-style "pin this install to one physical display" feature: it fingerprints the connected monitor's EDID and gates re-pairing/unpairing behind an Argon2-hashed admin password stored in the same store file. It's an operational safeguard, not tamper-proof DRM (the pairing record is a local JSON file removable by anyone with file access).

### Frontend (`desktop/src/`)

- Routing/entry: `main.tsx` → `root.tsx` → `app.tsx`. `root.tsx` also branches into secondary Tauri windows (e.g. `windows/dictation-indicator-window.tsx`) based on a `?window=` query param — all windows share the same web bundle.
- **Page + view-model convention**: each top-level page folder under `src/pages/` (`home/`, `batch/`, `settings/`, `setup/`) has a `view-model.ts`/`.tsx` that owns state and Tauri `invoke()` calls, and a `page.tsx` (plus `sections/*.tsx` for `settings/`) that is presentation-only and receives the view-model as a `vm` prop. Follow this split when adding features rather than putting logic directly in components.
- `~/` is a path alias for `desktop/src/` (see `tsconfig.json`); imports use it instead of relative paths across directories.
- i18n uses Paraglide (`@inlang/paraglide-js`): source strings live in `i18n/translations/<locale>/desktop.json` (repo root), compiled into per-message files under `desktop/src/paraglide/messages/` via `pnpm i18n:generate`. Never hand-edit the generated `paraglide/` output; edit the JSON and regenerate. `scripts/check_i18n.py` (`pnpm check:i18n`) checks all locale files have matching keys.
- Toasts use `sonner` (`import { toast } from 'sonner'`).

### Code style

- Rust: `rustfmt.toml` sets `max_width = 130`, block indent, reordered imports — run `cargo fmt` before committing.
- JS/TS: Prettier config uses tabs, no semicolons, single quotes, `printWidth: 160` — run `pnpm format`.
- ESLint allows unused vars/args prefixed with `_`; `no-explicit-any` is a warning, not an error.

## Repo-specific conventions (from `AGENTS.md`)

- Plan/validation scripts, when used, live at `plans/<name>/<name>_NNN.py` (a self-contained `uv` script) with a matching `plans/<name>/<name>_NNN.md`.
- Custom skills live in `.skills/`.
