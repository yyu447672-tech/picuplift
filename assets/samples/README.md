# Local sample images / 本地示例

These are original, procedurally drawn PicUplift landscape samples, not user photographs. They are covered by the project's MIT license.

| Tool | Original file | Bytes | Dimensions |
| --- | --- | ---: | --- |
| HEIC to JPG | picuplift-sample.heic | 5,599 | 640 × 400 |
| WebP to PNG | picuplift-sample.webp | 2,564 | 680 × 440 |
| Compression | picuplift-sample.jpg | 53,067 | 640 × 400 |

Each matching .js file contains the same bytes encoded as base64. A fixed local script is loaded when the sample button is clicked, then converted into a browser File. This avoids fetch/XHR and supports direct file:// use. Retain both the original files and the scripts.

示例是程序绘制的风景图，不含用户照片。HEIC 是由 JPG 经 macOS 编码器生成的真实 HEIC，已在浏览器 WASM 解码器中实际转换；它不能代表所有 iPhone、HDR、多图或特殊 HEIC 变体。WebP 包含透明边缘，用于检查 PNG 透明输出。
