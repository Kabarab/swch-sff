# SFF for SWCH

JavaScript port of SFF workflows into a SWCH tab, with persistent jobs, Steam library integration, Lua/manifests, optional game tools, Workshop and verified save backups. GPL-3.0-or-later. Mod ID `kabarab.sff`, version `1.0.1`.

**Requires SWCH with Mod SDK 1.1.0 or newer and its bundled Node.js 24 runtime.** This port uses the updated official SDK at `bdd8640947dea4b2724aaa5c2a464a62797d3cd7`; it cannot run on the original SDK 1.0. No Rust changes or SWCH rebuild is required when that SDK is already installed. It registers a tab, one game card action, internal methods and job types during activation. Steam remains SWCH's built-in launcher: this mod declares no additional launcher capabilities.

## Install

Download the stable release asset named `mod.zip`. In SWCH open **Mods > ZIP installation and development** and install it. Enable the mod, open **SFF**, select Steam and working folders in Settings, then install only the optional tools you need on the Tools page. Users do **not** run `npm install` or install an SDK package. Lua files are treated as data; they are never evaluated as JavaScript or Lua.

Windows x64 supports the game modification tools, ColdClient x64 uses a separate original upstream tool with a prominent Defender detection notice and setup instructions; it requires a separate explicit download. See [the recorded detection](docs/tool-detection.md). macOS ARM64 supports the portable library, metadata, Lua/manifest data operations, native CDN downloads, compatible DepotDownloaderMod/.NET, Workshop, saves and cloud operations. It does not provide macOS ownership injection, Windows DLL tools or LumaCore. See [feature coverage](docs/feature-matrix.md) and [test status](docs/testing.md) before use. This is a new port, not a claim that every Qt/SFF behavior has been reproduced or tested.

## Permissions and settings

Mod code executes with your user permissions. Selecting folders authorizes this mod to read/write there; known Steam libraries and SDK-managed data/cache/temp/tools folders are also used. Game/config replacements create SHA-256-verified preimage backups in SDK data. Revert refuses to overwrite files subsequently changed by another program. Keep sufficient free space for staging and backups. Close Steam before changing its configuration. Use only content and credentials you are authorized to access.

Settings: interface language (RU/EN/PT), direction including RTL, theme, Steam/library/backup folders, concurrency and optional player media. Settings and indexes use SDK settings/storage; credentials and Google/rclone configuration use SDK secrets. Large data stays in the chosen working folders. Exported settings omit secrets. rclone requires a temporary local config file while running; it is removed on shutdown and stale copies are removed on activation.

Network access occurs for requested Steam metadata/downloads, provider operations, optional tool installs, Ludusavi recipes and configured cloud services. Steam cover images load from Steam's public CDN. No telemetry is added. Provider contribution requires a separate preview and confirmation; it never runs automatically. Provider credentials are user supplied; no upstream private credentials are bundled.

Google Drive requires **your own Desktop OAuth client** with the Drive API enabled. Enter its client ID and optional client secret, choose Connect and complete Google's browser authorization yourself. Scope is `drive.file`; tokens remain in SDK secrets. rclone uses the installed, hash-pinned tool and its interactive provider configuration. Live OAuth/provider access has not been verified without user credentials.

## Source layout

`src/backend.mjs` exports `default async activate(swch)`. Other `src/*.mjs` implement Steam, downloads, optional tools, providers, game changes, saves, Drive and rclone. `ui/` is bundled into one standalone HTML iframe document. `data/tools.lock.json` pins optional downloads. `scripts/` builds and verifies the install payload. Generated `sff-mod/manifest.json` is at the install folder/ZIP root; relative entry points are `backend.mjs` and `index.html`. Runtime resources use module-relative URLs. stdout is reserved for SWCH JSON-RPC; diagnostics use `swch.log`.

## Developer setup, test and package

Install **Node.js 24 LTS** and Git. From this repository root:

```sh
node scripts/fetch-sdk.mjs
node mod-sdk/cli.mjs init sff-mod --template tab --id kabarab.sff
npm ci --ignore-scripts --omit=optional --no-audit --no-fund
node --test tests/*.test.mjs
node scripts/build.mjs
node mod-sdk/cli.mjs check sff-mod
node mod-sdk/cli.mjs pack sff-mod dist/mod.zip
node mod-sdk/cli.mjs validate-zip dist/mod.zip
node scripts/release-check.mjs
node scripts/package-smoke.mjs
```

For the complete local verification (including browser fixtures), run `node scripts/verify.mjs` after setup. It writes exact command results and the ZIP hash to `artifacts/verification.json`. On Windows it uses the installed Chrome; elsewhere install the test browser with `npx playwright install chromium`. The separate `node scripts/native-smoke.mjs` performs Windows x64 or macOS ARM64 .NET/DDMod and rclone local-backup tests with explicitly downloaded locked tools; it never runs ColdClient.

Run `init` only on a fresh checkout before the generated folder exists. Build recreates that generated folder. Build dependencies are for developers only; the ZIP includes the JavaScript dependencies and WASM worker. No native `.node` addons, credentials, `.env` files or dependencies on other mods are included. Optional native tools are separate explicit downloads, verified before execution.

On the development Windows machine, Node 24 is `G:\SWCH\runtime\node.exe`. PowerShell can select it for this shell:

```powershell
$env:Path = 'G:\SWCH\runtime;' + $env:Path
node --version
```

For SWCH local testing, connect the **absolute `sff-mod` folder** in **Mods > ZIP installation and development**, enable it and click **Reload** after each rebuild. Resolve it with `Resolve-Path ./sff-mod` (PowerShell) or `realpath sff-mod` (Unix).

Use the checklist in `docs/testing.md`: enable/disable/restart, persistence, cancellation, failed operations and each operation on its supported OS. Automated fixture tests do not establish live login, game launch or cloud-provider success. The macOS host has not been available for local testing.

## Publishing and updates

The release workflow is adapted from the actual SDK's `mod-sdk/templates/release.yml`. The intended public personal repository is **Kabarab/swch-sff**; organizations are unsupported by the catalog. Create/push that repository, run CI and finish host acceptance testing before releasing:

```sh
git init -b main
git add .
git commit -m "Implement SFF for SWCH"
git remote add origin https://github.com/Kabarab/swch-sff.git
git push -u origin main
git tag v1.0.1
git push origin v1.0.1
```

Set `package.json` to `X.Y.Z`; build writes the matching manifest version. Push `vX.Y.Z`. The workflow validates the package and creates a **stable GitHub Release** containing **`mod.zip`**. It refuses to replace an existing release asset. As repository owner, submit the **Publish a SWCH mod** issue form in [Kabarab/swch](https://github.com/Kabarab/swch/issues/new?template=publish-mod.yml) with repository `Kabarab/swch-sff`. The catalog checks personal ownership and package metadata without executing the mod; later stable releases are checked every six hours. **Catalog validation is not a security audit.** Never replace an already published version's ZIP: increase the version and create a new tag/release. Installed mod bindings to games persist across updates.

Optional tool versions are locked in source, not silently updated. Updating those locks requires verifying upstream bytes/hashes and publishing a new mod version. Development-only `prepare-tools.mjs` and `prepare-archives.mjs` regenerate locks; ordinary builds and end users do not run them. Source attribution and licenses are in `THIRD_PARTY_NOTICES.md` and `licenses/`.
