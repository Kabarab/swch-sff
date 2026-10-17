# Feature coverage

Implementation is a Node.js port based on SFF commit `fa44fc96b609c4cbe553e7e1e6ffd946de55b76f`. It uses actual SDK 1.1 contracts and real operations, with no simulated success path. This matrix describes implemented families; full upstream parity is **not yet certified**.

| Feature | Windows x64 | macOS ARM64 | Conditions / limitations |
| --- | --- | --- | --- |
| SWCH tab/card action, settings, persistent jobs, cancellation | Implemented | Implemented | Updated SDK 1.1 required |
| Steam library/ACF/VDF/public local accounts | Implemented | Implemented | No password or Steam session import |
| Steam launch/install/validate/uninstall/Workshop navigation | URI dispatch | URI dispatch | Success means request dispatched; Steam controls completion |
| Catalog, Hubcap search, Lua providers and local cache | Implemented | Implemented | Requested network operations; provider credentials as needed |
| Lua/manifest file/folder/ZIP/7z/RAR and drag/drop import, depot keys, pins, migration | Implemented | Data operations | No Lua evaluation; no macOS ownership injection; archive/iframe uploads up to 256 MiB per file, larger extracted folders via native picker |
| Native CDN download, chunk and file SHA-1 validation, resume | Implemented | Compatible depots | Authorized AES keys/manifests required; no authenticated Steam ownership bypass API |
| DepotDownloaderMod | Implemented | .NET-compatible | Explicit DDMod/.NET installation; ARM64 live test pending |
| Manifest cascade, GitHub mirror history, SteamDB HTML import, Build ID downloads | Implemented | Implemented | HTTPS sources, provider keys as needed; blocked sites report errors; no browser/Tor bypass |
| Game configs, DLC/achievement/stat schema conversion, controller mappings, global GSE identity | Implemented | Portable data | User Steam Web API key for schema; global GSE folder selected explicitly |
| DLC-only Lua/manifest staging and ACF metadata repair | Implemented | Data operations | Clearly labelled metadata changes; does not claim content download/validation |
| Goldberg, Steamless, ColdClient, ColdLoader, SteamAutoCrack | Implemented | Unavailable | Explicit fixed tools, file backups; ColdClient x64 uses a separate original tool with the prominent Defender notice; live game acceptance pending |
| SmokeAPI/CreamAPI/Uplay R1/R2 | Implemented | Unavailable | Appropriate original API DLLs required |
| LumaCore release/debug install/deactivate, pattern cache, LetUpdate helpers and Steam update/online-fix options | Implemented | Lua data only | Close Steam for config changes; restores previous files; tool versions pinned to the mod release |
| Curated game fixes and Online-Fix search | Implemented | Windows fixes unavailable | User selection; provider availability may vary |
| Workshop item/collection downloads and update | Implemented | Compatible content | Direct URL or DDMod; no automatic GSE mods.json injection |
| Ludusavi/custom/Steam userdata save detection | Implemented | Implemented | Recipe download requested explicitly; file filters retained |
| Multi-folder verified backup, inspect, restore, safety revert | Implemented | Implemented | Exact file hashes; refuses later conflicting edits |
| Google Drive PKCE + upload/download | Implemented | Implemented | Own Desktop client; live OAuth test pending |
| rclone provider wizard/import/remotes/copy/cancel | Implemented | Implemented | Actual local-remote round trip tested on Windows; live cloud test pending |
| RU/EN/PT, responsive layout, RTL, themes and profile media | Implemented | Implemented | Scoped to mod iframe |
| Standalone SFF window/tray/updater | SWCH lifecycle | SWCH lifecycle | Host supplies navigation/lifecycle; optional tool updates follow mod releases |
| GBE token generator | Removed upstream | Removed upstream | Not implemented: source reports this feature removed |
| Workshop auto-import and old Workshop browser slots | Removed upstream | Removed upstream | Public Workshop downloads/navigation above are an additional implementation |

The standalone Qt window, tray, updater and old dialog APIs are replaced by SWCH navigation/lifecycle and this mod's interface. Linux setup is outside the declared platforms. Browser/Tor automation and all historical SFF translations/settings are not reproduced; unavailable remote history has an explicit saved-HTML/manual-manifest fallback. Provider/game compatibility and the pending live acceptance tests must not be described as already verified. This package is a runnable port with documented coverage, not a certification of every historical upstream behavior.
