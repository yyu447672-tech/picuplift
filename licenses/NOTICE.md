# PicUplift open-source notices

PicUplift processes images locally. Image conversion libraries are bundled locally; the tools do not load remote conversion libraries, fonts, or advertisements. Google Analytics is loaded separately to measure visits and interactions, never image content. The following third-party components are distributed locally; retain this directory when redistributing the project.

## libheif-js 1.23.5 / libheif / libde265

- Wrapper: [catdad-experiments/libheif-js](https://github.com/catdad-experiments/libheif-js), published package 1.23.5, source commit `d8ec4bc3bc5bf8055975577bccbbc7e1d7313c2d`.
- Build: [libheif-emscripten v1.23.5](https://github.com/catdad-experiments/libheif-emscripten/tree/v1.23.5).
- libheif source used by that build: [strukturag/libheif, commit 413e2a87e6a70b3eccc3a3adc5801179dd2d9e00](https://github.com/strukturag/libheif/tree/413e2a87e6a70b3eccc3a3adc5801179dd2d9e00).
- HEVC decoder: [libde265 1.0.15](https://github.com/strukturag/libde265/releases/tag/v1.0.15), the default version in that libheif build script.
- Licenses: see `libheif-js-LGPL-3.0.txt`, `libheif-LICENSE.txt`, `libde265-LICENSE.txt`, and the corresponding source archives in this directory. Preserve each source package’s own notices and licenses.

The unmodified prebundled WebAssembly build from npm is wrapped as a JavaScript string in `../assets/vendor/heif-worker-source-1.23.5.js`. That wrapper enables Blob workers over file:// without fetching a separate WASM file. The decoder code and embedded WASM bytes are unchanged. Each HEIC file uses a temporary worker that is terminated after conversion.

The matching wrapper, build, libheif, and libde265 sources are supplied as `.tar.gz` archives in this directory. Upstream `scripts/install.js`, `.github/workflows/emscripten.yml`, and `build-emscripten.sh` describe the original build. These are source materials, not steps that end users need to run.

To replace the HEIC component, obtain a compatible `libheif-wasm/libheif-bundle.js` providing the `libheif` factory, preserve its license, and regenerate the wrapper as:

```python
import json
from pathlib import Path
source = Path('libheif-bundle.js').read_text()
Path('heif-worker-source-1.23.5.js').write_text(
    'globalThis.PIC_HEIF_SOURCE = ' + json.dumps(source) + ';\n'
)
```

Replace the corresponding local vendor file and verify decoding again. PicUplift does not impose restrictions on replacing or debugging this component under its applicable license terms.

## JSZip 3.10.1

- Source: [Stuk/jszip](https://github.com/Stuk/jszip/tree/v3.10.1).
- Distribution: `../assets/vendor/jszip-3.10.1.min.js`, unmodified npm release file.
- Used under the MIT option of the dual MIT / GPLv3 license. See `jszip-LICENSE.md` and the copyright notice in the distributed file.
- ZIPs store already encoded image bytes without recompressing them. Classic ZIP capacity is checked before generation; very large archives should be downloaded as individual files or smaller batches.

## PicUplift application files

The original PicUplift HTML, CSS, JavaScript and documentation are provided under the MIT license in `../LICENSE.txt`. Third-party code retains the licenses above. Test images are not included in the website distribution.

## Local PDF tools

The three PDF tools additionally bundle pdf-lib and Mozilla PDF.js. See [PDF dependency notices](pdf-tools-NOTICE.md) for pinned versions, source links, licenses and third-party font/WASM notices.
