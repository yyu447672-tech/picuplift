/* Fixed local assets only. Classic scripts also work over file:// with CSP connect-src 'none'. */
(() => {
  'use strict';
  const base = new URL('.', document.currentScript.src);
  const pending = new Map();
  const samples = Object.freeze({ heic: 'samples/heic.js', webp: 'samples/webp.js', compress: 'samples/compress.js', webpJpg: 'samples/webp-jpg.js', svg: 'samples/svg.js', pngJpg: 'samples/png-jpg.js', jpgPng: 'samples/jpg-png.js', toWebp: 'samples/to-webp.js' });
  const error = code => Object.assign(new Error(code), { code });
  function load(path) {
    const url = new URL(path, base).href;
    if (pending.has(url)) return pending.get(url);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url; script.async = true;
      script.onload = () => resolve();
      script.onerror = () => { pending.delete(url); script.remove?.(); reject(error('LOCAL_ASSET')); };
      document.head.append(script);
    });
    pending.set(url, promise);
    return promise;
  }
  function withSignal(promise, signal) {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(error('CANCELLED'));
    return new Promise((resolve, reject) => {
      const abort = () => reject(error('CANCELLED'));
      signal.addEventListener('abort', abort, { once: true });
      promise.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, reason => { signal.removeEventListener('abort', abort); reject(reason); });
    });
  }
  async function sample(tool) {
    if (!Object.hasOwn(samples, tool)) throw error('UNKNOWN_SAMPLE');
    await load(samples[tool]);
    const data = globalThis.PicSamples?.[tool];
    if (!data) throw error('LOCAL_ASSET');
    return new File([Uint8Array.from(atob(data.data), char => char.charCodeAt(0))], data.name, { type: data.type, lastModified: 0 });
  }
  async function heic(signal) {
    if (signal?.aborted) throw error('CANCELLED');
    if (!globalThis.PIC_HEIF_SOURCE) {
      try { await withSignal(load('vendor/heif-worker-source-1.23.5.js'), signal); }
      catch (reason) { throw reason.code === 'CANCELLED' ? reason : error('HEIC_UNAVAILABLE'); }
    }
    if (!globalThis.PIC_HEIF_SOURCE) throw error('HEIC_UNAVAILABLE');
  }
  globalThis.PicLocalAssets = Object.freeze({ sample, heic });
})();

