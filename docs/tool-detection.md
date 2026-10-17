# Blocked upstream tool

On 2026-10-17 Windows Defender detected the original SFF `third_party/gbe_fork/steamclient_loader_x64.exe` as **Trojan:Win32/Kepavll!rfn** and quarantined the build cache file. Pinned upstream Git blob: `2b46e3f15c2e106e3648e7724178a2f837cdaddf`. This observation does not establish whether the detection is a false positive.

At the user's request the original, unmodified file remains available as the **separate optional `coldclient-x64` tool**, downloaded only after its detection notice is shown and explicitly accepted. It is not bundled with the regular Goldberg DLL tools. Its SHA-256 was verified against the fixed SFF source before quarantine; the build preserves that digest without reacquiring or executing the file. A matching hash establishes provenance, not safety. No optional native executable is embedded in `mod.zip`.

## How to use the original tool

1. Windows x64 only. In SFF > Tools install `goldberg`; for a 64-bit ColdClient game also review the separate `coldclient-x64` notice. Steamless is required only if you select unpacking.
2. In Fix game, select the game's App ID, game folder, main EXE and ColdClient Simple or Advanced. The mod checks the executable architecture, writes `ColdClientLoader.ini`, copies the original loader and corresponding client DLLs, and creates backups.
3. Launch the prepared game using `steamclient_loader_x64.exe` in its game folder. The selected EXE is recorded in `ColdClientLoader.ini`. A successful configuration job means files were prepared; it does not prove the game launched or is compatible.
4. If Defender quarantines the loader, ColdClient x64 remains unavailable and the mod reports the missing/blocked file. Regular Goldberg DLL mode and the other mod features remain available. Review the detection with Microsoft via https://www.microsoft.com/en-us/wdsi/filesubmission; a false positive has not been established here.

Do not disable protection, restore quarantine, rename the executable or add exclusions to work around this detection. The mod does not change Windows security settings. No passing Defender result or live ColdClient x64 launch is claimed.
