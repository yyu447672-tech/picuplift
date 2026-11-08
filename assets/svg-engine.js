/* SVG remains an image, never live page markup. No fetches or external resources. */
(() => {
  'use strict';
  const error = code => Object.assign(new Error(code), { code });
  const units = { '': 1, px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6, pt: 96 / 72, pc: 16 };
  function length(value) {
    const match = String(value ?? '').trim().match(/^([+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(px|in|cm|mm|q|pt|pc)?$/i);
    if (!match) return null;
    const result = Number(match[1]) * units[(match[2] || '').toLowerCase()];
    return Number.isFinite(result) && result > 0 ? result : null;
  }
  function dimensions(attrs) {
    const box = String(attrs.viewBox ?? '').trim().split(/[\s,]+/).map(Number);
    const validBox = box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0;
    let width = length(attrs.width), height = length(attrs.height);
    if (width && !height && validBox) height = width * box[3] / box[2];
    if (height && !width && validBox) width = height * box[2] / box[3];
    if (width && height) return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)), fallback: false };
    if (validBox) return { width: Math.max(1, Math.round(box[2])), height: Math.max(1, Math.round(box[3])), fallback: false };
    return { width: 512, height: 512, fallback: true };
  }
  function checkSize(width, height) {
    if (![width, height].every(value => Number.isInteger(value) && value >= 1 && value <= 8192) || width * height > 16777216) throw error('SVG_SIZE');
    return { width, height };
  }
  function inspect(text) {
    // Declarations can load resources before tree validation. Reject them first.
    if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(text)) throw error('SVG_EXTERNAL');
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const root = doc.documentElement;
    if (doc.querySelector('parsererror') || root?.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg') throw error('WRONG_FORMAT');
    // This detached document is read only and is never appended or serialized into the page.
    for (const node of doc.querySelectorAll('*')) {
      if (['foreignObject', 'animate', 'animateTransform', 'animateMotion', 'set'].includes(node.localName)) throw error('SVG_EXTERNAL');
      for (const attr of node.attributes) {
        if (['href', 'src'].includes(attr.localName) && attr.value.trim() && !/^#[^\s]+$/.test(attr.value.trim())) throw error('SVG_EXTERNAL');
        if (/(?:url\s*\(|@import|@font-face|\\)/i.test(attr.value) && !safeCss(attr.value)) throw error('SVG_EXTERNAL');
      }
      if (node.localName === 'style' && !safeCss(node.textContent)) throw error('SVG_EXTERNAL');
    }
    return dimensions({ width: root.getAttribute('width'), height: root.getAttribute('height'), viewBox: root.getAttribute('viewBox') });
  }
  function safeCss(value) {
    if (/[\\@]/.test(value) || /\/\*/.test(value)) return false;
    return !/url\s*\(/i.test(value.replace(/url\s*\(\s*(['"]?)#[a-zA-Z0-9_.:-]+\1\s*\)/gi, ''));
  }
  async function convert(file, settings, signal) {
    if (signal?.aborted) throw error('CANCELLED');
    const text = await file.text();
    const source = inspect(text);
    const width = settings.svgWidth ? Number(settings.svgWidth) : source.width;
    const height = settings.svgHeight ? Number(settings.svgHeight) : source.height;
    checkSize(width, height);
    const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
    const image = new Image();
    image.width = width; image.height = height;
    const canvas = document.createElement('canvas');
    let abort;
    try {
      await new Promise((resolve, reject) => {
        abort = () => { image.src = ''; reject(error('CANCELLED')); };
        signal?.addEventListener('abort', abort, { once: true });
        image.onload = resolve; image.onerror = () => reject(error('DECODE'));
        if (signal?.aborted) abort(); else image.src = url;
      });
      if (signal?.aborted) throw error('CANCELLED');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw error('MEMORY');
      if (settings.svgBackground !== 'transparent') {
        const color = settings.svgBackground === 'custom' ? settings.svgColor : '#ffffff';
        if (!/^#[0-9a-f]{6}$/i.test(color)) throw error('DECODE');
        context.fillStyle = color; context.fillRect(0, 0, width, height);
      }
      context.drawImage(image, 0, 0, width, height);
      const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(error('ENCODE')), 'image/png'));
      if (blob.type !== 'image/png') throw error('ENCODE_UNSUPPORTED');
      if (signal?.aborted) throw error('CANCELLED');
      return { blob, width, height, sourceWidth: source.width, sourceHeight: source.height, sourceFormat: 'svg', frameOnly: false, fallback: source.fallback };
    } catch (reason) {
      if (reason.code) throw reason;
      throw error(reason instanceof RangeError ? 'MEMORY' : 'DECODE');
    } finally {
      signal?.removeEventListener('abort', abort);
      image.onload = image.onerror = null; image.src = '';
      URL.revokeObjectURL(url); canvas.width = canvas.height = 1;
    }
  }
  globalThis.PicSvg = Object.freeze({ dimensions, checkSize, inspect, convert });
})();
