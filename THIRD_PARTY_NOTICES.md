# Third-party notices

SFF for SWCH is a modified JavaScript port of functionality from SteaMidra/SFF, Copyright (C) 2025–2026 Midrag and contributors, licensed GPL-3.0-or-later. Port and integration Copyright (C) 2026 Kabarab. This project is independent of Steam/Valve and is not the original SteaMidra executable.

Upstream source: https://github.com/Midrags/SFF/tree/fa44fc96b609c4cbe553e7e1e6ffd946de55b76f. The editable port sources, tests and build scripts are distributed in https://github.com/Kabarab/swch-sff at the corresponding release tag.

The package contains ordinary JavaScript dependencies and an unmodified 7-Zip WASM distribution. Each keeps its own license; their source files and license files remain in `node_modules`. `package-lock.json` pins versions and npm integrity hashes.

- `steam-user` 5.3.0 and its dependencies: https://github.com/DoctorMcKay/node-steam-user — MIT; see individual dependency licenses.
- `fflate` 0.8.2: https://github.com/101arrowz/fflate — MIT.
- `yaml` 2.8.1: https://github.com/eemeli/yaml — ISC.
- `7z-wasm` 1.2.0: https://github.com/use-strict/7z-wasm — GNU LGPL 2.1-or-later plus the unRAR restriction for the 7-Zip/WASM parts; see `node_modules/7z-wasm/License.txt`. Build scripts/patches: the upstream v1.2.0 source; underlying 7-Zip 24.09 sources: https://www.7-zip.org/a/7z2409-src.tar.xz. This component runs as a separate archive worker. It is replaceable by modifying the worker adapter. No native `.node` addon is included.

Optional native tools are downloaded only after an explicit installation action. They are not relicensed as part of this port. Their fixed sources, versions and checksums are in `data/tools.lock.json`; upstream notices are retained under `licenses/sff-tools`.

- DepotDownloaderMod: GPL-2.0; https://github.com/SteamAutoCracks/DepotDownloaderMod.
- gbe_fork/Goldberg: LGPL-3.0; https://github.com/Detanup01/gbe_fork.
- Steamless: CC BY-NC-ND 4.0; https://github.com/atom0s/Steamless. This mod does not modify the distributed Steamless binaries.
- SteamAutoCrack: MIT, with independent licenses for its bundled components; https://github.com/SteamAutoCracks/Steam-auto-crack.
- rclone: MIT; https://github.com/rclone/rclone.
- .NET runtime: MIT and third-party notices included in its official runtime archives; https://github.com/dotnet/runtime.
- LumaCore, ColdLoader and DLC tools keep their upstream terms. Inspect the linked original projects and accompanying notices before using or redistributing those separate tools.

No upstream maintainer OAuth client configuration, built-in Steam Web API key, provider build token or private credential is copied into the mod.
