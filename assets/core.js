/* PicUplift — local image processing. No requests or persistent file storage. */
(() => {
  'use strict';
  const ascii = (bytes, start, size) => String.fromCharCode(...bytes.slice(start, start + size));
  function sniff(bytes) {
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpeg';
    if (ascii(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') return 'png';
    if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
    if (ascii(bytes, 4, 4) === 'ftyp') {
      const brands = [ascii(bytes, 8, 4)];
      const boxSize = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
      for (let i = 16; i + 4 <= Math.min(bytes.length, boxSize); i += 4) brands.push(ascii(bytes, i, 4));
      if (brands.some(brand => ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs'].includes(brand))) return 'heic';
    }
    return null;
  }
  function outputType(tool, source, choice = 'auto') {
    if (tool === 'heic') return 'image/jpeg';
    if (tool === 'heicPng') return 'image/png';
    if (tool === 'webp') return 'image/png';
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
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
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
  async function convert(file, tool, settings, signal) {
    const header = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
    const sourceFormat = sniff(header);
    const allowed = (tool === 'heic' || tool === 'heicPng') ? ['heic'] : tool === 'webp' ? ['webp'] : ['jpeg', 'png', 'webp'];
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
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        source = bitmap; sourceWidth = bitmap.width; sourceHeight = bitmap.height;
      }
      if (signal?.aborted) throw codedError('CANCELLED');
      const { width, height } = dimensions(sourceWidth, sourceHeight, settings.scale);
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw codedError('MEMORY');
      const type = outputType(tool, sourceFormat, settings.format);
      if (type === 'image/jpeg') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height); }
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
      context.drawImage(source, 0, 0, width, height);
      const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(codedError('ENCODE')), type, settings.quality / 100));
      if (blob.type !== type) throw codedError('ENCODE_UNSUPPORTED');
      if (signal?.aborted) throw codedError('CANCELLED');
      return { blob, width, height, sourceWidth, sourceHeight, sourceFormat, frameOnly };
    } catch (error) {
      if (error.code) throw error;
      throw codedError(error instanceof RangeError ? 'MEMORY' : 'DECODE');
    } finally {
      bitmap?.close();
      canvas.width = canvas.height = 1;
      if (heicCanvas) heicCanvas.width = heicCanvas.height = 1;
    }
  }
  globalThis.PicCore = Object.freeze({ sniff, outputType, dimensions, uniqueName, isAnimated, sizeChange, canZip, convert });
})();
