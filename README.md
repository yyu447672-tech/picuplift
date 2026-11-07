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

## 2026-11-07：WebP → JPG 与第四篇指南

本轮基线：main `4eba0599bb976c294063a8e59924c05e7c092c8e`。新增 webp-to-jpg.html 与 how-to-convert-webp-to-jpg.html，网站共14页。已有12页的Title/Description/H1/Canonical、GA初始化/CSP哈希、旧文章和robots不变；首页Guides只追加第四项。

WebP→JPG默认质量90、原尺寸100%，质量范围10–100；透明区域填白。80–90只是照片质量与体积的起点建议，不保证目标KB或无可见损失。只接受实际WebP内容；输出扩展名.jpg、MIME image/jpeg。动图取第一帧；颜色可能变化，原文件不改。可用真实照片示例、单张下载或成功结果ZIP；如果输出更大可另存原WebP。

新工具沿用完整文件夹双击打开的方式，也可从线上网站使用。所有脚本和图片在本地，无npm安装或构建步骤。示例猫照片为CC0，出处见 licenses/webp-jpg-sample-NOTICE.md，不在运行时外联下载。网页语言切换不改文件名、输入或图片。

| 文件 | 本轮改动与原因 |
|---|---|
| webp-to-jpg.html | 新JPG工具、质量/白底提示、示例、双语FAQ、OG和独立GA哈希。 |
| how-to-convert-webp-to-jpg.html | 第四篇双语指南、内链、5条FAQ及对应结构化数据。 |
| assets/core.js | 最小追加WebP→JPG输出和WebP输入校验，复用既有白底画布。 |
| assets/app.js | 新模式初始化/事件/完成引导、按页读取文案与alt；保留原模式。 |
| assets/local-assets.js | 只追加新WebP照片样例映射。 |
| assets/content.js | 只新增pages.webpJpg和pages.guideWebpJpg；旧键和值零删除零修改。 |
| assets/examples/webp-to-jpg-example-before.webp | 实际不透明WebP照片，关键词文件名。 |
| assets/examples/webp-to-jpg-example-after.jpg | 通过新工具以90%质量生成的真实JPG。 |
| assets/samples/picuplift-webp-jpg-sample.webp | 与before图片相同的原始示例字节。 |
| assets/samples/webp-jpg.js | 相同示例的本地脚本包装，支持file://。 |
| licenses/webp-jpg-sample-NOTICE.md | CC0样例照片的来源和许可说明。 |
| index.html | Guides仅追加第四项，通过新文章的页内字典读取中英文。 |
| sitemap.xml | 原12项不改，追加工具和文章两项至14。 |
| llms.txt | 原文字不改，追加新工具和文章各一行。 |
| README.md | 追加本节说明。 |

站点包和替换包二选一，解压后上传内容到仓库根目录；不上传ZIP本身。报告、截图、测试资料单独交付，不上传站点仓库。包内保留本地图片、脚本和licenses的相对路径。
