/* PicUplift — local image processing. No requests or persistent file storage. */
(() => {
  'use strict';
  const ascii = (bytes, start, size) => String.fromCharCode(...bytes.slice(start, start + size));
  function sniff(bytes) {
    if (['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6))) return 'gif';
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpeg';
    if (ascii(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') return 'png';
    if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
    if (ascii(bytes, 4, 4) === 'ftyp') {
      const brands = [ascii(bytes, 8, 4)];
      const boxSize = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
      for (let i = 16; i + 4 <= Math.min(bytes.length, boxSize); i += 4) brands.push(ascii(bytes, i, 4));
      if (brands.some(brand => ['avif', 'avis'].includes(brand))) return 'avif';
      if (brands.some(brand => ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs'].includes(brand))) return 'heic';
    }
    return null;
  }
  function outputType(tool, source, choice = 'auto') {
    if (tool === 'gifToJpg') return 'image/jpeg';
    if (['gifToPng', 'avifToPng'].includes(tool)) return 'image/png';
    if (tool === 'jpgToGif') return 'image/gif';
    if (tool === 'heic' || tool === 'webpJpg' || tool === 'avif' || tool === 'pngJpg') return 'image/jpeg';
    if (tool === 'heicPng') return 'image/png';
    if (tool === 'webp' || tool === 'webpBulk' || tool === 'jpgPng') return 'image/png';
    if (tool === 'toWebp') return 'image/webp';
    if (tool === 'toIco' || tool === 'svgToIco') return 'image/x-icon';
    if (choice !== 'auto') return `image/${choice}`;
    return source === 'jpeg' ? 'image/jpeg' : 'image/webp';
  }
  function dimensions(width, height, percent = 100) {
    if (!(width > 0 && height > 0)) throw new Error('DECODE');
    const scale = Math.min(100, Math.max(10, Number(percent) || 100)) / 100;
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  }
  function uniqueName(name, extension, used) {
    let stem = String(name).replace(/\.[^.]*$/, '').replace(/[\\/\x00-\x1f\x7f<>:"|?*]/g, '_').replace(/^\.+/, '').trim();
    stem = stem.slice(0, 160) || 'image';
    let result = `${stem}.${extension}`, n = 1;
    while (used.has(result.toLowerCase())) result = `${stem} (${++n}).${extension}`;
    used.add(result.toLowerCase());
    return result;
  }
  function isAnimated(bytes, format) {
    if (format === 'gif') {
    let i = 13;
    if (bytes[10] & 0x80) i += 3 * (2 ** ((bytes[10] & 0x07) + 1)); // 跳过全局颜色表
    let frames = 0;
    const skipSubBlocks = () => { while (i < bytes.length) { const size = bytes[i++]; if (size === 0) break; i += size; } };
    while (i < bytes.length) {
      const marker = bytes[i];
      if (marker === 0x2C) { // 图像描述符：10 字节 + 可选局部颜色表 + LZW 数据
        frames++;
        if (frames > 1) return true;
        const packed = bytes[i + 9];
        i += 10;
        if (packed & 0x80) i += 3 * (2 ** ((packed & 0x07) + 1));
        i++; // LZW 最小编码长度
        skipSubBlocks();
      } else if (marker === 0x21) { // 扩展块：label + 子块
        i += 2;
        skipSubBlocks();
      } else if (marker === 0x3B) { // Trailer
        return false;
      } else {
        return frames > 1;
      }
    }
    return frames > 1;
  }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (format === 'avif' && ascii(bytes, 4, 4) === 'ftyp') {
      const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
      for (let i = 8; i + 4 <= Math.min(size, bytes.length); i += 4) {
        if (i !== 12 && ascii(bytes, i, 4) === 'avis') return true;
      }
    }
    if (format === 'webp') {
      for (let i = 12; i + 8 <= bytes.length;) {
        const name = ascii(bytes, i, 4), size = view.getUint32(i + 4, true);
        if (name === 'ANIM' || (name === 'VP8X' && (bytes[i + 8] & 2))) return true;
        i += 8 + size + (size % 2);
      }
    }
    if (format === 'png') {
      for (let i = 8; i + 8 <= bytes.length;) {
        const size = view.getUint32(i), name = ascii(bytes, i + 4, 4);
        if (name === 'acTL') return true;
        if (name === 'IDAT') return false;
        i += size + 12;
      }
    }
    return false;
  }
  const sizeChange = (before, after) => before > 0 ? Math.round((1 - after / before) * 100) : null;
  // Conservative allowance for both headers, UTF-8/Unicode name extras and the
  // data descriptor. Output names have at most 160 UTF-16 stem units + suffix.
  const canZip = sizes => sizes.length < 65535 && sizes.every(size => size < 0xffffffff) && sizes.reduce((sum, size) => sum + size + 4096, 22) < 0xffffffff;
  const codedError = code => Object.assign(new Error(code), { code });

  // Target mode has a 40% quality floor and at most seven encodes per size.
  const targetType = (source, choice) => source === 'png' || choice !== 'webp' ? 'image/jpeg' : 'image/webp';
  async function searchTarget(encode, targetBytes, signal) {
    let smallest, encodes = 0;
    const attempt = async (quality, scale) => {
      if (signal?.aborted) throw codedError('CANCELLED');
      const result = await encode(quality, scale);
      if (signal?.aborted) throw codedError('CANCELLED');
      encodes++;
      if (!smallest || result.blob.size < smallest.blob.size) smallest = result;
      return result;
    };
    for (const scale of [100, 90, 80, 70, 60, 50]) {
      const high = await attempt(100, scale);
      if (high.blob.size <= targetBytes) return { ...high, reached: true, encodes };
      let best = await attempt(40, scale);
      if (best.blob.size > targetBytes) continue;
      let low = 40, upper = 100;
      for (let count = 2; count < 7 && upper - low > 1; count++) {
        const quality = Math.floor((low + upper) / 2);
        const candidate = await attempt(quality, scale);
        if (candidate.blob.size <= targetBytes) { best = candidate; low = quality; }
        else upper = quality;
      }
      return { ...best, reached: true, encodes };
    }
    return { ...smallest, reached: false, encodes };
  }

  // Executed only inside a temporary Blob worker, following the local WASM bundle.
  function heicWorkerMain() {
    self.onmessage = async ({ data: buffer }) => {
      try {
        const module = await libheif({ print() {}, printErr() {} });
        const decoder = new module.HeifDecoder();
        const images = decoder.decode(new Uint8Array(buffer));
        if (!images?.length) throw new Error('HEIC_DECODE');
        const image = images.find(item => item.is_primary()) || images[0];
        const width = image.get_width(), height = image.get_height();
        const rgba = { width, height, data: new Uint8ClampedArray(width * height * 4) };
        try {
          await new Promise((resolve, reject) => image.display(rgba, result => result ? resolve() : reject(new Error('HEIC_DECODE'))));
          self.postMessage({ width, height, pixels: rgba.data.buffer, frames: images.length, wasm: true }, [rgba.data.buffer]);
        } finally { images.forEach(item => item.free()); }
      } catch (_) { self.postMessage({ error: 'HEIC_DECODE' }); }
    };
  }
  async function decodeHeic(file, signal) {
    if (!globalThis.PIC_HEIF_SOURCE || typeof WebAssembly === 'undefined') throw codedError('HEIC_UNAVAILABLE');
    const buffer = await file.arrayBuffer();
    if (signal?.aborted) throw codedError('CANCELLED');
    const workerUrl = URL.createObjectURL(new Blob([globalThis.PIC_HEIF_SOURCE, '\n(', heicWorkerMain.toString(), ')();'], { type: 'text/javascript' }));
    let worker;
    try {
      worker = new Worker(workerUrl);
      return await new Promise((resolve, reject) => {
        const abort = () => { worker.terminate(); reject(codedError('CANCELLED')); };
        signal?.addEventListener('abort', abort, { once: true });
        worker.onmessage = ({ data }) => {
          signal?.removeEventListener('abort', abort);
          if (data.error) reject(codedError(data.error)); else resolve(data);
        };
        worker.onerror = event => {
          event.preventDefault();
          signal?.removeEventListener('abort', abort);
          reject(codedError('HEIC_DECODE'));
        };
        worker.postMessage(buffer, [buffer]);
      });
    } finally { worker?.terminate(); URL.revokeObjectURL(workerUrl); }
  }
  async function packIco(settings, signal, render) {
    const sizes = [...new Set(settings.sizes || [])].sort((a, b) => a - b);
    if (!sizes.length || sizes.some(n => ![16, 32, 48, 64, 128, 256].includes(n))) throw codedError('ENCODE');
    const entries = [], canvas = document.createElement('canvas');
    try {
      for (const size of sizes) {
        if (signal?.aborted) throw codedError('CANCELLED');
        canvas.width = canvas.height = size;
        const context = canvas.getContext('2d');
        if (!context) throw codedError('MEMORY');
        context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
        await render(context, size);
        if (signal?.aborted) throw codedError('CANCELLED');
        const png = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(codedError('ENCODE')), 'image/png'));
        entries.push({ width: size, height: size, pngBytes: new Uint8Array(await png.arrayBuffer()) });
      }
      if (signal?.aborted) throw codedError('CANCELLED');
      return { blob: globalThis.PicIco.buildIco(entries), width: sizes.at(-1), height: sizes.at(-1) };
    } finally { canvas.width = canvas.height = 1; }
  }
  async function svgIco(file, settings, signal) {
    if (signal?.aborted) throw codedError('CANCELLED');
    const source = globalThis.PicSvg.inspect(await file.text());
    const output = await packIco(settings, signal, async (context, size) => {
      const scale = Math.min(size / source.width, size / source.height);
      const width = Math.max(1, Math.round(source.width * scale)), height = Math.max(1, Math.round(source.height * scale));
      const result = await globalThis.PicSvg.convert(file, { svgWidth: width, svgHeight: height, svgBackground: 'transparent' }, signal);
      const bitmap = await createImageBitmap(result.blob);
      try { context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height); }
      finally { bitmap.close(); }
    });
    return { ...output, sourceWidth: source.width, sourceHeight: source.height, sourceFormat: 'svg', frameOnly: false, fallback: source.fallback };
  }
  async function convert(file, tool, settings, signal) {
    if (tool === 'svgToIco') return svgIco(file, settings, signal);
    if (tool === 'svg') return globalThis.PicSvg.convert(file, settings, signal);
    const header = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
    const sourceFormat = sniff(header);
    const allowed = ['gifToJpg', 'gifToPng'].includes(tool) ? ['gif'] : tool === 'avifToPng' ? ['avif'] : (tool === 'heic' || tool === 'heicPng') ? ['heic'] : (tool === 'webp' || tool === 'webpJpg' || tool === 'webpBulk') ? ['webp'] : tool === 'avif' ? ['avif'] : tool === 'pngJpg' ? ['png'] : tool === 'jpgPng' ? ['jpeg'] : tool === 'toWebp' ? ['png', 'jpeg'] : tool === 'toIco' ? ['png', 'jpeg', 'webp'] : ['jpeg', 'png', 'webp'];
    if (!allowed.includes(sourceFormat)) throw codedError('WRONG_FORMAT');
    if (signal?.aborted) throw codedError('CANCELLED');
    let source, bitmap, sourceWidth, sourceHeight, frameOnly = isAnimated(header, sourceFormat);
    let heicCanvas;
    const canvas = document.createElement('canvas');
    try {
      if (sourceFormat === 'heic') {
        const decoded = await decodeHeic(file, signal);
        sourceWidth = decoded.width; sourceHeight = decoded.height;
        frameOnly = decoded.frames > 1;
        heicCanvas = document.createElement('canvas');
        heicCanvas.width = sourceWidth; heicCanvas.height = sourceHeight;
        const context = heicCanvas.getContext('2d');
        if (!context) throw codedError('MEMORY');
        context.putImageData(new ImageData(new Uint8ClampedArray(decoded.pixels), sourceWidth, sourceHeight), 0, 0);
        source = heicCanvas;
      } else {
        // createImageBitmap uses the first frame of an animated source, and
        // applies EXIF orientation by default. Never capture a moving <img>.
        try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
        catch (error) { if (sourceFormat === 'avif' && !(error instanceof RangeError)) throw codedError('AVIF_DECODE'); throw error; }
        source = bitmap; sourceWidth = bitmap.width; sourceHeight = bitmap.height;
      }
      if (signal?.aborted) throw codedError('CANCELLED');
      if (tool === 'toIco') {
        const edge = Math.min(sourceWidth, sourceHeight);
        const output = await packIco(settings, signal, (context, size) => { context.drawImage(source, (sourceWidth - edge) / 2, (sourceHeight - edge) / 2, edge, edge, 0, 0, size, size); });
        return { ...output, sourceWidth, sourceHeight, sourceFormat, frameOnly };
      }
      const targetMode = tool === 'compress' && settings.mode === 'target';
      const type = targetMode ? targetType(sourceFormat, settings.format) : outputType(tool, sourceFormat, settings.format);
      const encode = async (quality, scale = 100) => {
        const base = dimensions(sourceWidth, sourceHeight, settings.scale);
        const width = Math.max(1, Math.round(base.width * scale / 100)), height = Math.max(1, Math.round(base.height * scale / 100));
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw codedError('MEMORY');
        if (type === 'image/jpeg') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height); }
        context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
        context.drawImage(source, 0, 0, width, height);
        const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(codedError('ENCODE')), type, quality / 100));
        if (blob.type !== type) throw codedError('ENCODE_UNSUPPORTED');
        if (signal?.aborted) throw codedError('CANCELLED');
        return { blob, width, height, quality, scale };
      };
      const targetKB = Math.min(5000, Math.max(10, Math.round(Number(settings.targetKB) || 200)));
      const output = targetMode ? await searchTarget(encode, targetKB * 1024, signal) : await encode(settings.quality);
      return { ...output, sourceWidth, sourceHeight, sourceFormat, frameOnly, ...(targetMode ? { targetKB } : {}) };
    } catch (error) {
      if (error.code) throw error;
      throw codedError(error instanceof RangeError ? 'MEMORY' : 'DECODE');
    } finally {
      bitmap?.close();
      canvas.width = canvas.height = 1;
      if (heicCanvas) heicCanvas.width = heicCanvas.height = 1;
    }
  }
  async function convertGif(files, settings, signal, onProgress) {
    if (!files.length || files.length > 30) throw codedError('ENCODE');
    if (!globalThis.gifencExports?.GIFEncoder) throw codedError('ENCODE');
    for (const file of files) {
      const header = new Uint8Array(await file.slice(0, 6).arrayBuffer());
      if (sniff(header) !== 'jpeg') throw codedError('WRONG_FORMAT'); // 任一非 JPG → 整批失败
    }
    const delay = Math.min(2000, Math.max(100, Number(settings.delay) || 500));
    const { GIFEncoder, quantize, applyPalette } = globalThis.gifencExports;
    const gif = GIFEncoder();
    const canvas = document.createElement('canvas');
    let width, height, firstWidth, firstHeight;
    const sourceBytes = files.reduce((sum, file) => sum + file.size, 0);
    try {
      for (let index = 0; index < files.length; index++) {
        if (signal?.aborted) throw codedError('CANCELLED');
        const bitmap = await createImageBitmap(files[index], { imageOrientation: 'from-image' });
        try {
          if (index === 0) {
            firstWidth = bitmap.width; firstHeight = bitmap.height;
            const base = dimensions(bitmap.width, bitmap.height, settings.scale);
            width = base.width; height = base.height;
            if (Math.max(width, height) > 1200) { const k = 1200 / Math.max(width, height); width = Math.max(1, Math.round(width * k)); height = Math.max(1, Math.round(height * k)); }
            canvas.width = width; canvas.height = height;
          }
          const context = canvas.getContext('2d');
          if (!context) throw codedError('MEMORY');
          context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
          if (index === 0) context.drawImage(bitmap, 0, 0, width, height);
          else { // 后续帧按 cover 裁切对齐到首帧尺寸，不拉伸
            const scale = Math.max(width / bitmap.width, height / bitmap.height);
            const dw = bitmap.width * scale, dh = bitmap.height * scale;
            context.drawImage(bitmap, (width - dw) / 2, (height - dh) / 2, dw, dh);
          }
          const rgba = context.getImageData(0, 0, width, height).data;
          const palette = quantize(rgba, 256, { format: 'rgba4444', oneBitAlpha: true, clearAlpha: true, clearAlphaThreshold: 0 });
          const frameIndex = applyPalette(rgba, palette, 'rgba4444');
          const transparentIndex = palette.findIndex(c => c.length === 4 && c[3] === 0);
          gif.writeFrame(frameIndex, width, height, { palette, transparent: transparentIndex >= 0, transparentIndex: Math.max(0, transparentIndex), delay, ...(index === 0 ? { repeat: 0 } : {}) });
        } finally { bitmap.close(); }
        if (signal?.aborted) throw codedError('CANCELLED');
        onProgress?.(index + 1, files.length);
        // Yield so a user cancel can be handled between synchronous encoding frames.
        await new Promise(resolve => setTimeout(resolve, 0));
        if (signal?.aborted) throw codedError('CANCELLED');
      }
      gif.finish();
      const blob = new Blob([gif.bytes()], { type: 'image/gif' });
      return { blob, width, height, frames: files.length, delay, sourceBytes, sourceWidth: firstWidth, sourceHeight: firstHeight, sourceFormat: 'jpeg', frameOnly: false };
    } catch (error) {
      if (error.code) throw error;
      throw codedError(error instanceof RangeError ? 'MEMORY' : 'DECODE');
    } finally { canvas.width = canvas.height = 1; }
  }

  globalThis.PicCore = Object.freeze({ sniff, outputType, dimensions, uniqueName, isAnimated, sizeChange, canZip, searchTarget, targetType, convert, convertGif });
})();

