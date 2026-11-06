# PicUplift

Four free, browser-local image tools: HEIC → JPG, HEIC → PNG, WebP → PNG, and JPG/PNG/WebP compression. English and Chinese tool interfaces. No image uploads, accounts, advertisements, or external fonts. Conversion libraries are bundled locally. Tagged online pages use Google Analytics for visits and interactions; analytics never receives image contents.

## 本地使用

1. 下载并解压完整文件夹。
2. 保留七个 HTML、assets、licenses 和 LICENSE.txt 的相对位置。
3. 在电脑新版 Chrome 或 Edge 中双击 index.html。
4. 选工具 → 选择或拖入多张图片 → 调设置 → 开始转换 → 单张下载或下载 ZIP。

无需 npm install，不需要构建或本地服务器。手机优先访问上线后的网址。

## GitHub Pages

把本文件夹里的全部内容上传到仓库最外层，然后：

**Settings → Pages → Source: Deploy from a branch → Branch: main → Folder: / (root) → Save**

**Branch 不要留 None，否则不会触发部署。** 等 Actions 部署完成后，访问 GitHub 显示的网址。所有页面和资源都使用相对路径，支持仓库子目录。

## Defaults and boundaries

- HEIC: 90% JPG quality, original dimensions; bundled libheif WebAssembly decoder in a local Blob worker.
- HEIC → PNG: original dimensions by default; lossless PNG encoding, no quality slider. The output can be larger, and the decoder/canvas can change color or HDR rendering.
- WebP → PNG: real dimension slider; transparency retained; no ineffective quality slider.
- Compression: 80% quality, original dimensions; automatic JPG → JPG, PNG → WebP, WebP → WebP. PNG can be selected manually, with quality disabled.
- Static output only. Animated WebP/PNG uses frame zero; multi-image HEIC uses the primary image. Original files remain untouched. Converted outputs do not copy camera metadata; color/HDR appearance can differ.
- No artificial file-size or conversion-count caps. Real memory, decoder, browser and classic ZIP capacity still apply. Failures are shown per file; large archives can be downloaded individually or in smaller batches.
- UI language switches do not translate files. Changing settings or adding files invalidates previous outputs.
- Analytics: pages with the existing GA4 tag collect visits and enhanced-measurement interactions when served over HTTP(S). Tool usage events add only fixed tool/source/status values, never filenames, file sizes, dimensions, image bytes, blob URLs, or raw errors. Local file:// use does not send these events; missing or blocked analytics does not stop conversion. Download events measure attempts, not proof that a browser saved the file.
- Coverage note: this baseline's Windows tutorial has no GA4 initializer; its visits are not reliably measured by the current page. The tool pages and Mac tutorial include the tag. No claim that every page is tracked is intended.

See [third-party notices](licenses/NOTICE.md) and [application license](LICENSE.txt). Keep supplied license/source materials when redistributing.
