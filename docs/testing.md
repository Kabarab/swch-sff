# Testing and acceptance

## Automated

Use Node.js 24 and `node --test tests/*.test.mjs`. Tests use isolated, generated `.test-data` folders and mock provider/SDK inputs, never the user's games or credentials. They cover VDF/Lua parsing, unsafe paths, transactional replacement/conflict handling, actual WASM extraction, dependency hash verification, LumaCore preimage restoration and save selection/restore integrity. Runtime tests use the actual unmodified SDK runtime and a fixture JSON-RPC host. CLI validation uses the actual pinned official SDK.

`node scripts/build.mjs` creates `sff-mod`; `node mod-sdk/cli.mjs check sff-mod`, `pack`, `validate-zip` and `node scripts/release-check.mjs` are required. Test outcomes are recorded separately in generated `artifacts/verification.json`; do not infer success from this checklist alone.

`node scripts/native-smoke.mjs` installs only the locked .NET, DDMod and rclone tools into fixture folders and verifies their startup plus a local save-backup round trip. The CI workflow runs it on Windows x64 and macOS ARM64. It never installs or executes ColdClient. Read the native-smoke artifact and workflow result for actual outcomes; this does not exercise live games or cloud credentials.

## Host acceptance checklist (pending unless recorded as completed)

1. Windows x64: connect the absolute generated folder in SWCH Mods development, enable, open SFF, navigate all views and game-card action. Change RU/EN/PT, narrow the window, test keyboard labels, long names and RTL.
2. Save settings/custom paths, create a fixture backup, disable/enable and restart SWCH. Confirm settings, jobs, backup index and secrets survive. Ensure public state never includes secret values.
3. Cancel a download/native process, disable during a job, restart and verify recovery. Cancel OAuth, force a timeout, wrong provider key, HTTP error, corrupt archive/tool hash and changed target file. Confirm error status and useful logs, no success toast for failed work.
4. Import a fixture Lua alone and a folder/archive containing Lua plus manifests. Verify backups, Steam-stopped requirement, pin toggles and revert. Check the selected file case never reads sibling folders implicitly.
5. For an authorized small Steam depot, test native resume and full checksums. Separately test DDMod and native Steam request. Verify ACF/library refresh and distinguish URI dispatch from successful installation/launch.
6. On disposable game copies, verify every Windows-only tool/mode, DLC tool, LumaCore install/deactivate with a preexisting DLL and curated fix. Revert each operation. Do not test against valuable originals first.
7. Download one public Workshop item and a collection. Cancel/retry and update. Inspect files; verify consumer App ID mismatch fails.
8. Backup exact selected files, multiple folders and Steam saves. Edit originals; restore; revert using safety history. Corrupt the snapshot and confirm **no destination changes**. Inspect free space and failures.
9. With user-owned OAuth credentials connect/cancel/disconnect Drive; upload/download a verified backup, interrupt and retry. Configure an rclone test remote, import/delete config, list/test, copy and cancel. Check ephemeral config removal after disable/restart.
10. Repeat portable operations on **macOS ARM64**. Verify Windows controls are unavailable and unsupported tool installation fails explicitly. Test executable permissions, ARM64 .NET/DDMod/rclone and paths containing spaces/non-ASCII. No physical macOS host has been tested locally.
11. Install the final `dist/mod.zip`, repeat enable/disable/restart and persistence. No launcher is registered by this mod, so there are no separately declared launcher capabilities to test.

Release notes must disclose applicable pending acceptance items and the limitations in `feature-matrix.md`. Do not claim that untested games, provider logins or operating systems passed. Fixture tests and catalog metadata checks are not a security audit.
