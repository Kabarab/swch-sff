# Corresponding source and licenses

`7zip-24.09-source.tar.gz` contains the unmodified 7-Zip 24.09 source from the official `ip7z/7zip` tag. `7z-wasm-v1.2.0-source.zip` contains the corresponding WASM adapter, patches, Docker and build scripts from `use-strict/7z-wasm` tag v1.2.0. To rebuild the replaceable archive component, extract the WASM source, install Docker and follow its README (`./build` on Unix or `build` on Windows CMD). The build scripts fetch 7-Zip 24.09; if the original download is unavailable, use the bundled matching source tree. Retain its LGPL and unRAR notices. The unmodified distribution in `node_modules/7z-wasm` includes license and object code; the archive worker loads it in a separate worker thread.

Sources: https://github.com/ip7z/7zip/tree/24.09 and https://github.com/use-strict/7z-wasm/tree/v1.2.0. `upstream/` preserves SFF's tool license notices. Optional executables are not embedded in this ZIP and retain their own terms.
