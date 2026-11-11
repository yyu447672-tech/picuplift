/* PicUplift — handwritten PNG-in-ICO container encoder. No dependencies. */
(() => {
  'use strict';
  function buildIco(entries) {
    if (!Array.isArray(entries) || !entries.length || entries.length > 65535) {
      throw new TypeError('ICO requires between 1 and 65535 images');
    }
    let offset = 6 + 16 * entries.length;
    for (const entry of entries) {
      if (!entry || !Number.isInteger(entry.width) || entry.width < 1 || entry.width > 256 || entry.height !== entry.width) {
        throw new TypeError('ICO images must be square, with integer dimensions from 1 to 256');
      }
      if (!(entry.pngBytes instanceof Uint8Array) || !entry.pngBytes.byteLength) {
        throw new TypeError('ICO image data must be a nonempty Uint8Array');
      }
      offset += entry.pngBytes.byteLength;
      if (offset > 0xffffffff) throw new RangeError('ICO data exceeds the 32-bit container limit');
    }
    const directory = new Uint8Array(6 + 16 * entries.length);
    const view = new DataView(directory.buffer);
    view.setUint16(2, 1, true);
    view.setUint16(4, entries.length, true);
    offset = directory.byteLength;
    entries.forEach((entry, index) => {
      const start = 6 + 16 * index;
      directory[start] = entry.width === 256 ? 0 : entry.width;
      directory[start + 1] = entry.height === 256 ? 0 : entry.height;
      view.setUint16(start + 4, 1, true);
      view.setUint16(start + 6, 32, true);
      view.setUint32(start + 8, entry.pngBytes.byteLength, true);
      view.setUint32(start + 12, offset, true);
      offset += entry.pngBytes.byteLength;
    });
    return new Blob([directory, ...entries.map(entry => entry.pngBytes)], { type: 'image/x-icon' });
  }
  globalThis.PicIco = { buildIco };
})();
