# PicUplift

Free, browser-local image tools: HEIC → JPG, WebP → PNG, and JPG/PNG/WebP compression. English and Chinese interfaces. No uploads, accounts, advertisements, analytics, external fonts, or runtime CDN dependencies.

## 本地使用

1. 下载并解压完整文件夹。
2. 保留四个 HTML、assets、licenses 和 LICENSE.txt 的相对位置。
3. 在电脑新版 Chrome 或 Edge 中双击 index.html。
4. 选工具 → 选择或拖入多张图片 → 调设置 → 开始转换 → 单张下载或下载 ZIP。

无需 npm install，不需要构建或本地服务器。手机优先访问上线后的网址。

## GitHub Pages

把本文件夹里的全部内容上传到仓库最外层，然后：

**Settings → Pages → Source: Deploy from a branch → Branch: main → Folder: / (root) → Save**

**Branch 不要留 None，否则不会触发部署。** 等 Actions 部署完成后，访问 GitHub 显示的网址。所有页面和资源都使用相对路径，支持仓库子目录。

## Defaults and boundaries

- HEIC: 90% JPG quality, original dimensions; bundled libheif WebAssembly decoder in a local Blob worker.
- WebP → PNG: real dimension slider; transparency retained; no ineffective quality slider.
- Compression: 80% quality, original dimensions; automatic JPG → JPG, PNG → WebP, WebP → WebP. PNG can be selected manually, with quality disabled.
- Static output only. Animated WebP/PNG uses frame zero; multi-image HEIC uses the primary image. Original files remain untouched. Converted outputs do not copy camera metadata; color/HDR appearance can differ.
- No artificial file-size or conversion-count caps. Real memory, decoder, browser and classic ZIP capacity still apply. Failures are shown per file; large archives can be downloaded individually or in smaller batches.
- UI language switches do not translate files. Changing settings or adding files invalidates previous outputs.

See [third-party notices](licenses/NOTICE.md) and [application license](LICENSE.txt). Keep supplied license/source materials when redistributing.
