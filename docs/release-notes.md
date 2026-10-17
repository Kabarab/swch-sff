# SFF for SWCH 1.0.1

Fixes macOS .NET archive installation: preserves the compound TAR.GZ extension, recognizes nested TAR data and refuses to mark tools installed when their required executable is missing. Adds native .NET/DDMod/rclone fixture checks on Windows x64 and macOS ARM64.

Install **mod.zip** through SWCH > Mods > ZIP installation and development. Requires the updated **Mod SDK 1.1.0** and bundled Node.js 24. Users do not install npm dependencies or rebuild SWCH.

Includes a standalone SFF tab, Steam library/card action, persistent jobs, Lua/manifest imports and drag/drop, CDN downloads and resume, provider/history/build workflows, optional game tools, LetUpdate, DLC staging, Workshop, verified multi-folder saves, Google Drive and rclone, RU/EN/PT and responsive RTL layouts. Coverage and source provenance are documented in the repository.

**ColdClient x64 notice:** the original executable from the pinned SFF repository is a separate optional download. Defender quarantined that upstream file as **Trojan:Win32/Kepavll!rfn** on the development machine. The mod prominently displays this fact and the setup/launch instructions. Hash matching establishes provenance, not safety. The mod does not disable protection or restore quarantine. A blocked loader produces an explicit error; Regular mode remains separate. No optional native executable is embedded in this ZIP.

Validation: official SDK check/pack/validate-zip, extracted-ZIP SDK runtime, automated parsing/download/backup/recovery fixtures, and all eleven UI views in Chrome including mobile/RTL. Real Windows .NET 10.0.13, DDMod startup and rclone local backup round trip were tested. User-owned OAuth/provider sessions, live games and the actual SWCH desktop UI are not claimed as tested. No local macOS host was available; platform CI tests are separate from live game acceptance.

Windows-only game tools are unavailable on macOS ARM64. Portable features remain available. Automated browser/Tor history fallbacks and the standalone Qt chrome are not reproduced; saved HTML/manual manifest input and SWCH navigation/lifecycle provide their documented alternatives. This is not a certification of every historical SFF behavior.

Catalog metadata validation is **not a security audit**. Published ZIPs are immutable per version; updates use a new semver version and tag.
