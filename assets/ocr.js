/* Local, English-only OCR. Image bytes and recognized text remain in the browser. */
(() => {
  'use strict';
  if (document.body.dataset.tool !== 'ocr') return;
  const $ = id => document.getElementById(id);
  const ui = Object.fromEntries(['private','drop-zone','browse','file-input','start','cancel','clear','notice','check','list','zip'].map(id => [id, $(`ocr-${id}`)]));
  if (Object.values(ui).some(node => !node)) return;
  ui.private.setAttribute('data-clarity-mask', 'True');
  let items = [], serial = 0, active = null, busy = false, packing = false, scriptPromise;
  let notice = '', loadingProgress = 0;
  const lang = () => document.documentElement.lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  const t = key => PicCopy.pages.ocr[lang()][key];
  const vendor = new URL('assets/vendor/tesseract/', document.baseURI).href.replace(/\/$/, '');
  const make = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  function noticeText() { return notice ? `${t(notice)}${notice === 'ocrLoading' ? ` ${loadingProgress}%` : ''}` : ''; }
  function notify(key) { notice = key; ui.notice.textContent = noticeText(); }
  function track(name, status) {
    const allowed = { pic_files_selected: [], pic_conversion_start: [], pic_conversion_result: ['success','partial','failed','cancelled'], pic_download_click: ['image','zip'] };
    if (!(name in allowed) || (allowed[name].length ? !allowed[name].includes(status) : status !== undefined)) return;
    try { if (location.protocol !== 'file:' && typeof window.gtag === 'function') { const params = { send_to: 'G-41GRYMECDD', tool: 'image-to-text', source: 'user' }; if (status !== undefined) params.status = status; window.gtag('event', name, params); } } catch (_) { /* Optional analytics. */ }
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  const txt = item => new Blob([item.text], { type: 'text/plain;charset=utf-8' });
  function render() {
    ui.list.replaceChildren();
    for (const item of items) {
      const row = make('article', 'ocr-result');
      const name = make('h3', 'ocr-result-name', item.file.name); row.append(name);
      const status = make('p', 'ocr-result-status');
      status.textContent = item.error ? t(item.error) : item.state === 'reading' ? `${t('ocrReading')} ${item.progress}%` : t(item.state === 'done' ? 'ocrDone' : 'ocrWaiting');
      row.append(status);
      if (item.state === 'reading') {
        const bar = make('progress', 'ocr-progress'); bar.max = 100; bar.value = item.progress; bar.setAttribute('aria-label', t('ocrProgressLabel')); row.append(bar);
      }
      if (item.state === 'done') {
        const box = make('textarea', 'ocr-text'); box.readOnly = true; box.value = item.text; box.setAttribute('aria-label', t('ocrTextLabel')); row.append(box);
        const actions = make('div', 'ocr-result-actions');
        const copy = make('button', 'secondary-button', t('ocrCopy')); copy.type = 'button';
        copy.addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(item.text); copy.textContent = t('ocrCopied'); }
          catch (_) { notify('ocrCopyError'); box.focus(); box.select(); }
        });
        const save = make('button', 'secondary-button', t('ocrDownload')); save.type = 'button';
        save.addEventListener('click', () => { download(txt(item), item.outputName); track('pic_download_click', 'image'); });
        actions.append(copy, save); row.append(actions);
      }
      ui.list.append(row);
    }
    ui.start.disabled = busy || packing || !items.length; ui.cancel.hidden = !busy;
    ui.browse.disabled = busy || packing; ui['file-input'].disabled = busy || packing; ui.clear.disabled = busy || packing;
    ui.zip.disabled = busy || packing || !items.some(item => item.state === 'done');
    ui.notice.textContent = noticeText();
  }
  function select(files) {
    if (busy || packing || !files.length) return;
    const used = new Set();
    items = Array.from(files, file => ({ file, outputName: PicCore.uniqueName(file.name, 'txt', used), state: 'waiting', progress: 0, text: '', error: '' }));
    ui['file-input'].value = ''; notify(''); render(); track('pic_files_selected');
  }
  ui.browse.addEventListener('click', () => ui['file-input'].click());
  ui['file-input'].addEventListener('change', e => select(e.target.files));
  for (const type of ['dragenter', 'dragover']) ui['drop-zone'].addEventListener(type, e => { e.preventDefault(); });
  ui['drop-zone'].addEventListener('drop', e => { e.preventDefault(); select(e.dataTransfer.files); });
  ui.clear.addEventListener('click', () => { if (!busy) { items = []; notify(''); render(); } });
  $('language-toggle')?.addEventListener('click', () => queueMicrotask(render));
  function loadScript() {
    if (window.Tesseract) return Promise.resolve();
    if (!scriptPromise) scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = `${vendor}/tesseract.min.js`;
      script.onload = resolve; script.onerror = () => { script.remove(); scriptPromise = null; reject(new Error('load')); }; document.head.append(script);
    });
    return scriptPromise;
  }
  function cancelRace(run, promise) { return Promise.race([promise, run.cancelled]); }
  function stop(run) {
    if (!run || run.stopped) return;
    run.stopped = true; run.nativeWorker?.terminate(); run.worker?.terminate(); run.rejectCancel(new Error('cancelled'));
  }
  ui.cancel.addEventListener('click', () => {
    if (!active) return;
    const run = active; active = null; ++serial; stop(run); busy = false;
    for (const item of items) if (item.state === 'reading') item.state = 'waiting';
    notify('ocrCancelled'); render(); track('pic_conversion_result', 'cancelled');
  });
  ui.start.addEventListener('click', async () => {
    if (busy || !items.length) { if (!items.length) notify('ocrChoose'); return; }
    const run = { id: ++serial, stopped: false, nativeWorker: null, worker: null };
    run.cancelled = new Promise((_, reject) => { run.rejectCancel = reject; });
    active = run; busy = true;
    items.forEach(item => { item.state = 'waiting'; item.error = ''; item.text = ''; item.progress = 0; });
    loadingProgress = 0; notify('ocrLoading'); render(); track('pic_conversion_start');
    try {
      await cancelRace(run, loadScript());
      if (run.stopped) return;
      // Tesseract v7 exposes its worker only after initialization. Capture the
      // synchronously constructed native Worker so cancel can stop model loading.
      const NativeWorker = window.Worker;
      let initialization;
      try {
        window.Worker = class extends NativeWorker { constructor(...args) { super(...args); run.nativeWorker = this; } };
        initialization = Tesseract.createWorker('eng', 1, {
          workerPath: `${vendor}/worker.min.js`, corePath: vendor, langPath: vendor,
          workerBlobURL: false, cacheMethod: 'none',
          logger: message => {
            if (active !== run || run.stopped) return;
            if (!run.item && typeof message.progress === 'number') {
              loadingProgress = Math.max(0, Math.min(100, Math.round(message.progress * 100))); ui.notice.textContent = noticeText();
            }
            if (message.status === 'recognizing text' && run.item) {
              run.item.progress = Math.max(0, Math.min(100, Math.round(message.progress * 100))); render();
            }
          }, errorHandler: () => {}
        });
      } finally { window.Worker = NativeWorker; }
      // Avoid an indefinite pending startup on failed local asset requests.
      let timer; const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 120000); });
      try { run.worker = await cancelRace(run, Promise.race([initialization, timeout])); } finally { clearTimeout(timer); }
      if (active !== run || run.stopped) return;
      notify('ocrRecognizing');
      for (const item of items) {
        if (run.stopped) break;
        run.item = item; item.state = 'reading'; item.progress = 0; render();
        try {
          const header = new Uint8Array(await cancelRace(run, item.file.slice(0, 65536).arrayBuffer()));
          if (!['jpeg', 'png', 'webp'].includes(PicCore.sniff(header))) { item.error = 'ocrWrongFormat'; item.state = 'error'; continue; }
          const result = await cancelRace(run, run.worker.recognize(item.file));
          if (active !== run || run.stopped) break;
          item.text = result.data.text || ''; item.state = 'done'; item.progress = 100;
        } catch (error) {
          if (run.stopped) break;
          item.error = 'ocrFileError'; item.state = 'error';
        } finally { if (active === run) render(); }
      }
      if (active === run) {
        const count = items.filter(item => item.state === 'done').length;
        notify('ocrComplete'); track('pic_conversion_result', count === items.length ? 'success' : count ? 'partial' : 'failed');
      }
    } catch (_) {
      if (active === run && !run.stopped) { notify('ocrError'); track('pic_conversion_result', 'failed'); }
    } finally {
      run.nativeWorker?.terminate(); if (run.worker) await run.worker.terminate();
      if (active === run) { active = null; busy = false; render(); }
    }
  });
  ui.zip.addEventListener('click', async () => {
    if (busy || packing) return;
    const done = items.filter(item => item.state === 'done'); if (!done.length) return;
    if (!PicCore.canZip(done.map(item => new TextEncoder().encode(item.text).byteLength))) { notify('ocrZipLimit'); return; }
    packing = true; render();
    try { const zip = new JSZip(); done.forEach(item => zip.file(item.outputName, item.text)); const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true }); download(blob, 'picuplift-text.zip'); track('pic_download_click', 'zip'); }
    catch (_) { notify('ocrZipError'); } finally { packing = false; render(); }
  });
  render();
})();
