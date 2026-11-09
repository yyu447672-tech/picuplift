(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const page = document.body.dataset.tool;
  // The home page keeps its own copy and SEO while sharing the HEIC engine.
  const tool = page === 'home' ? 'heic' : ['compress200kb', 'compress100kb'].includes(page) ? 'compress' : page;
  const usageTool = ['compress200kb', 'compress100kb'].includes(page) ? configFileName(page) : page === 'home' ? 'heic-to-jpg' : tool === 'webpJpg' ? 'webp-to-jpg' : tool;
  function configFileName(key) { return PicCopy.pages[key].file.replace('.html', ''); }
  const isToolPage = ['heic', 'heicPng', 'webp', 'webpJpg', 'compress', 'svg'].includes(tool);
  const isHeicTool = tool === 'heic' || tool === 'heicPng';
  const config = PicCopy.pages[page];
  let language = new URLSearchParams(location.search).get('lang') === 'zh' ? 'zh' : 'en';
  let items = [], nextId = 0, busy = false, packing = false, controller;
  let notice = { key: '', detail: '', error: false };
  let generation = 0;
  let sampleGeneration = 0, loadingSample = false, loadingSvg = false;
  const rowNodes = new Map();
  const t = key => config?.[language]?.[key] ?? PicCopy.common[language][key];
  const bytes = number => {
    if (number === undefined || number === null) return '–';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const unit = Math.min(units.length - 1, Math.floor(Math.log(Math.max(1, number)) / Math.log(1024)));
    return `${(number / 1024 ** unit).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', { maximumFractionDigits: unit ? 2 : 0 })} ${units[unit]}`;
  };
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function showNotice(key = '', detail = '', error = false) {
    notice = { key, detail, error };
    if ($('notice')) {
      $('notice').textContent = key ? `${t(key)}${detail ? ` · ${detail}` : ''}` : '';
      $('notice').classList.toggle('error', error);
    }
  }
  function localizeLinks() {
    document.querySelectorAll('a[href]').forEach(link => {
      const url = new URL(link.getAttribute('href'), location.href);
      if (Object.values(PicCopy.pages).some(page => url.pathname.endsWith(`/${page.file}`))) {
        if (language === 'zh') url.searchParams.set('lang', 'zh'); else url.searchParams.delete('lang');
        // Relative links keep both file:// and GitHub Pages repository paths valid.
        link.setAttribute('href', `./${url.pathname.split('/').pop()}${url.search}${url.hash}`);
      }
    });
  }
  function setLanguage(next) {
    language = next;
    document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
    document.querySelectorAll('[data-copy]').forEach(node => { node.textContent = t(node.dataset.copy); });
    document.querySelectorAll('[data-copy-label]').forEach(node => { node.setAttribute('aria-label', t(node.dataset.copyLabel)); });
    document.querySelectorAll('[data-copy-alt]').forEach(node => { node.setAttribute('alt', t(node.dataset.copyAlt)); });
    document.querySelectorAll('[data-page]').forEach(node => { node.textContent = config[language][node.dataset.page]; });
    document.querySelectorAll('[data-page-ref]').forEach(node => {
      const [pageKey, copyKey] = node.dataset.pageRef.split('.');
      const text = PicCopy.pages[pageKey]?.[language]?.[copyKey];
      if (typeof text === 'string') node.textContent = text;
    });
    document.querySelectorAll('[data-page-alt]').forEach(node => {
      const text = config?.[language]?.[node.dataset.pageAlt];
      if (typeof text === 'string') node.setAttribute('alt', text);
    });
    document.querySelectorAll('[data-tool-name]').forEach(node => {
      node.textContent = t({ heic: 'navHeic', heicPng: 'navHeicPng', webp: 'navWebp', compress: 'navCompress' }[node.dataset.toolName]);
    });
    document.querySelectorAll('[data-tool-short]').forEach(node => { node.textContent = PicCopy.pages[node.dataset.toolShort][language].short; });
    document.querySelectorAll('[data-step-title]').forEach(node => { node.textContent = config[language].steps[Number(node.dataset.stepTitle)][0]; });
    document.querySelectorAll('[data-step-body]').forEach(node => { node.textContent = config[language].steps[Number(node.dataset.stepBody)][1]; });
    document.querySelectorAll('[data-faq-q]').forEach(node => { node.textContent = config[language].faq[Number(node.dataset.faqQ)][0]; });
    document.querySelectorAll('[data-faq-a]').forEach(node => { node.textContent = config[language].faq[Number(node.dataset.faqA)][1]; });
    $('language-toggle').textContent = next === 'en' ? '中文' : 'English';
    $('language-toggle').lang = next === 'en' ? 'zh-CN' : 'en';
    $('language-toggle').setAttribute('aria-label', next === 'en' ? '切换到中文' : 'Switch to English');
    localizeLinks();
    if (isToolPage) {
      $('file-input').setAttribute('aria-label', t('browse'));
      $('file-list').setAttribute('aria-label', t('resultsStep'));
      $('progress').setAttribute('aria-label', t('processing'));
      renderAll();
      showNotice(notice.key, notice.detail, notice.error);
    }
  }
  $('language-toggle').addEventListener('click', () => setLanguage(language === 'en' ? 'zh' : 'en'));
  if (!isToolPage) { setLanguage(language); return; }

  const usageEvents = {
    pic_files_selected: [],
    pic_conversion_start: [],
    pic_conversion_result: ['success', 'partial', 'failed', 'cancelled'],
    pic_download_click: ['image', 'original', 'zip'],
  };
  const usageSource = batch => batch.every(item => item.isSample) ? 'sample' : batch.some(item => item.isSample) ? 'mixed' : 'user';
  function trackUsage(name, source, status) {
    // Only fixed enums reach the existing GA tag; local files never reach it.
    // Blocked or broken analytics must not interrupt local image operations.
    try {
      if (location.protocol === 'file:' || typeof window.gtag !== 'function') return;
      if (!Object.prototype.hasOwnProperty.call(usageEvents, name) || !['sample', 'user', 'mixed'].includes(source)) return;
      const statuses = usageEvents[name];
      if (statuses.length ? !statuses.includes(status) : status !== undefined) return;
      const params = { send_to: 'G-41GRYMECDD', tool: usageTool, source };
      if (status !== undefined) params.status = status;
      window.gtag('event', name, params);
    } catch (_) { /* Analytics is optional. */ }
  }

  function release(item) {
    if (item.output?.url) URL.revokeObjectURL(item.output.url);
    item.output = null;
  }
  function updateSettings() {
    const target = $('compression-mode')?.value === 'target';
    if ($('target-controls')) {
      $('target-controls').hidden = !target;
      $('quality-setting').hidden = target;
      $('target-note').hidden = !target;
      $('auto-note').hidden = target;
      for (const option of $('output-format').options) {
        if (option.value === 'auto' || option.value === 'png') option.disabled = target;
        if (option.value === 'auto') option.hidden = target;
        if (option.value === 'png') option.textContent = target ? t('targetFormat') : 'PNG';
      }
      if (target && ['auto', 'png'].includes($('output-format').value)) $('output-format').value = 'jpeg';
      document.querySelectorAll('[data-target-kb]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.targetKb) === Number($('target-kb').value))));
    }
    if ($('quality')) {
      const png = tool === 'compress' && $('output-format').value === 'png';
      $('quality').disabled = png;
      $('quality-value').textContent = png ? 'PNG' : `${$('quality').value}%`;
      $('png-quality-note').hidden = !png;
    }
    if ($('scale')) $('scale-value').textContent = `${$('scale').value}%`;
    if (tool === 'svg') $('svg-color').disabled = busy || packing || $('svg-background').value !== 'custom';
    if ($('white-note')) $('white-note').hidden = $('output-format').value !== 'jpeg';
  }
  function updateControls() {
    $('settings').disabled = busy || packing || loadingSvg;
    $('file-input').disabled = busy || packing;
    $('browse').disabled = busy || packing;
    $('sample').disabled = busy || packing || loadingSample;
    $('clear').disabled = busy || packing || !items.length;
    $('start').disabled = busy || packing || loadingSample || loadingSvg || !items.length;
    $('cancel').hidden = !busy;
    $('cancel').disabled = Boolean(controller?.signal.aborted);
    $('zip').disabled = busy || packing || loadingSample || !items.some(item => item.output);
    $('zip').textContent = t(packing ? 'zipBusy' : 'zip');
    $('drop-zone').classList.toggle('is-disabled', busy || packing);
  }
  function renderSummary() {
    const success = items.filter(item => item.output);
    const failed = items.filter(item => item.status === 'failed').length;
    $('empty').hidden = items.length > 0;
    $('batch-summary').hidden = !items.length;
    $('file-count').textContent = String(items.length);
    $('summary').textContent = `${items.length} ${t('files')} · ${success.length} ${t('ready')}${failed ? ` · ${failed} ${t('errors')}` : ''}`;
    $('total-before').textContent = success.length ? bytes(success.reduce((sum, item) => sum + item.file.size, 0)) : '–';
    $('total-after').textContent = success.length ? bytes(success.reduce((sum, item) => sum + item.output.blob.size, 0)) : '–';
    if ($('next-tools')) $('next-tools').hidden = busy || !success.length;
    updateControls();
  }
  const errorKey = code => ({ SVG_SIZE: 'errorSvgSize', SVG_EXTERNAL: 'errorSvgExternal', WRONG_FORMAT: 'errorWrong', HEIC_DECODE: 'errorHeic', HEIC_UNAVAILABLE: 'errorUnavailable', MEMORY: 'errorMemory', ENCODE: 'errorEncode', ENCODE_UNSUPPORTED: 'errorUnsupported' }[code] || 'errorDecode');
  function rowButton(text, action, item, className = 'row-button') {
    const button = element('button', text, className);
    button.type = 'button'; button.dataset.action = action; button.dataset.id = item.id;
    button.disabled = busy || packing;
    button.setAttribute('aria-label', `${text}: ${item.file.name}`);
    return button;
  }
  function renderRow(item) {
    const row = element('li', undefined, 'file-row');
    row.dataset.id = item.id; row.dataset.status = item.status;
    const head = element('div', undefined, 'file-head');
    const thumb = element('div', undefined, 'thumbnail');
    if (item.output) {
      const img = document.createElement('img'); img.src = item.output.url; img.alt = item.file.name; img.loading = 'lazy';
      thumb.append(img);
    } else thumb.append(element('span', 'IMG'));
    const title = element('div', undefined, 'file-title');
    title.append(element('strong', item.file.name));
    const detail = item.output ? `${item.output.width} × ${item.output.height} px · ${item.output.name}` : bytes(item.file.size);
    title.append(element('span', detail));
    head.append(thumb, title, element('span', t(item.status), `file-status ${item.status}`)); row.append(head);
    if (item.output) {
      const comparison = element('div', undefined, 'size-comparison');
      comparison.append(element('span', `${t('before')}: ${bytes(item.file.size)}`), element('span', '→'));
      comparison.append(element('strong', `${t('after')}: ${bytes(item.output.blob.size)}`));
      const change = PicCore.sizeChange(item.file.size, item.output.blob.size);
      const label = item.output.blob.size === item.file.size ? t('same') : `${change === 0 ? '<1' : Math.abs(change)}% ${t(item.output.blob.size < item.file.size ? 'saved' : 'grew')}`;
      comparison.append(element('span', label, `size-change ${change < 0 ? 'grew' : ''}`)); row.append(comparison);
      if (item.output.targetKB) {
        const output = item.output;
        const values = { target: `${output.targetKB} KB`, size: `${(output.blob.size / 1024).toFixed(2)} KB`, quality: output.quality, w: output.width, h: output.height };
        const message = output.reached ? `${t('targetReached')} · ${t('targetSizeLabel')}: ${values.target} · ${values.size} · ${values.quality}% · ${values.w}×${values.h} px` : t('targetMissed').replace(/\{(\w+)\}/g, (_, key) => values[key]);
        row.append(element('p', message, output.reached ? 'row-note target-result' : 'row-error target-result'));
      }
      if (item.output.fallback) row.append(element('p', t('fallback'), 'row-note'));
      if (item.output.frameOnly) row.append(element('p', t('frameNote'), 'row-note'));
      if (item.output.blob.size > item.file.size) row.append(element('p', t('largerNote'), 'row-note'));
    } else if (item.status === 'failed') row.append(element('p', t(errorKey(item.error)), 'row-error'));
    const actions = element('div', undefined, 'row-actions');
    if (item.output) {
      actions.append(rowButton(t('download'), 'download', item));
      if (item.output.blob.size > item.file.size) actions.append(rowButton(t('original'), 'original', item));
    }
    actions.append(rowButton(t('remove'), 'remove', item, 'text-button'));
    row.append(actions);
    const old = rowNodes.get(item.id);
    if (old?.isConnected) old.replaceWith(row); else $('file-list').append(row);
    rowNodes.set(item.id, row);
  }
  function renderAll() {
    $('file-list').replaceChildren(); rowNodes.clear();
    items.forEach(renderRow); updateSettings(); renderSummary();
  }
  function invalidate(key) {
    for (const item of items) { release(item); item.status = 'queued'; item.error = null; }
    renderAll(); showNotice(key);
    $('progress').hidden = true;
  }
  let svgBase = { width: 512, height: 512 };
  let svgSelection = 0;
  async function svgDefaults(file) {
    const request = ++svgSelection;
    loadingSvg = true;
    try {
      const size = PicSvg.inspect(await file.text());
      if (request !== svgSelection || busy) return;
      svgBase = size;
      $('svg-width').value = size.width; $('svg-height').value = size.height;
      $('svg-default').dataset.copy = size.fallback ? 'fallback' : 'sizeDefault';
      $('svg-default').textContent = t($('svg-default').dataset.copy);
    } catch (_) { /* Invalid files receive a per-file error during conversion. */ }
    finally { if (request === svgSelection) { loadingSvg = false; updateControls(); } }
  }
  if (tool === 'svg') document.querySelectorAll('[data-svg-scale]').forEach(button => button.addEventListener('click', () => {
    if (busy || packing) return;
    $('svg-width').value = svgBase.width * Number(button.dataset.svgScale);
    $('svg-height').value = svgBase.height * Number(button.dataset.svgScale);
    invalidate('changed');
  }));
  function addFiles(files, isSample = false) {
    if (busy || packing || !files.length) return;
    if (!isSample) { sampleGeneration++; loadingSample = false; }
    // A manual upload replaces the demo, never the other way round. Repeated
    // demo clicks replace its own row while preserving every user File object.
    items.filter(item => item.isSample).forEach(release);
    items = items.filter(item => !item.isSample);
    for (const file of files) items.push({ id: String(++nextId), file, status: 'queued', error: null, output: null, isSample });
    $('file-input').value = '';
    if (tool === 'svg') svgDefaults(items[0].file);
    invalidate('added');
    trackUsage('pic_files_selected', isSample ? 'sample' : 'user');
  }
  $('browse').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', event => addFiles(Array.from(event.target.files)));
  $('sample').addEventListener('click', async () => {
    if (busy || packing || loadingSample) return;
    const request = ++sampleGeneration;
    loadingSample = true; updateControls(); showNotice('sampleLoading');
    try {
      const file = await PicLocalAssets.sample(isHeicTool ? 'heic' : tool);
      if (request !== sampleGeneration) return;
      addFiles([file], true); showNotice('sampleAdded');
    } catch (_) { if (request === sampleGeneration) showNotice('sampleError', '', true); }
    finally { if (request === sampleGeneration) { loadingSample = false; updateControls(); } }
  });
  for (const eventName of ['dragenter', 'dragover']) $('drop-zone').addEventListener(eventName, event => {
    event.preventDefault(); if (!busy && !packing) $('drop-zone').classList.add('is-dragging');
  });
  for (const eventName of ['dragleave', 'drop']) $('drop-zone').addEventListener(eventName, event => {
    event.preventDefault(); $('drop-zone').classList.remove('is-dragging');
    if (eventName === 'drop') addFiles(Array.from(event.dataTransfer.files));
  });
  // Keep an accidental drop outside the panel from navigating away with files.
  window.addEventListener('dragover', event => event.preventDefault());
  window.addEventListener('drop', event => event.preventDefault());
  function clampTarget() {
    if (!$('target-kb')) return;
    const raw = Number($('target-kb').value);
    const value = Math.min(5000, Math.max(10, Math.round(Number.isFinite(raw) ? raw : 200)));
    $('target-kb').value = value;
    $('target-validation').textContent = raw !== value ? t('targetRange') : '';
    updateSettings();
  }
  $('target-kb')?.addEventListener('change', clampTarget);
  document.querySelectorAll('[data-target-kb]').forEach(button => button.addEventListener('click', () => {
    if (busy || packing) return;
    $('target-kb').value = button.dataset.targetKb;
    $('target-validation').textContent = '';
    invalidate('changed');
  }));
  $('settings').addEventListener('input', () => { if (!busy && !packing) invalidate('changed'); });
  $('clear').addEventListener('click', () => {
    if (busy || packing) return;
    sampleGeneration++; loadingSample = false;
    svgSelection++; loadingSvg = false;
    items.forEach(release); items = []; renderAll(); showNotice('cleared'); $('progress').hidden = true;
  });
  $('cancel').addEventListener('click', () => { controller?.abort(); updateControls(); });
  $('start').addEventListener('click', async () => {
    if (busy || packing) return;
    if (!items.length) { showNotice('noFiles', '', true); return; }
    clampTarget();
    invalidate('processing');
    const job = ++generation;
    busy = true; controller = new AbortController();
    const signal = controller.signal;
    const settings = { mode: $('compression-mode')?.value || 'quality', targetKB: Number($('target-kb')?.value || 200), quality: Number($('quality')?.value || 100), scale: Number($('scale')?.value || 100), svgWidth: $('svg-width')?.value, svgHeight: $('svg-height')?.value, svgBackground: $('svg-background')?.value, svgColor: $('svg-color')?.value, format: $('output-format')?.value || 'auto' };
    const used = new Set(); let finished = 0;
    $('progress').hidden = false; $('progress').max = items.length; $('progress').value = 0;
    renderAll();
    const source = usageSource(items);
    trackUsage('pic_conversion_start', source);
    try {
      for (const item of items) {
        if (job !== generation) return;
        if (signal.aborted) { item.status = 'cancelled'; renderRow(item); continue; }
        item.status = 'processing'; renderRow(item); showNotice('processing', `${finished + 1} / ${items.length}`);
        // Let progress paint before decoding the next local file.
        await new Promise(resolve => setTimeout(resolve, 0));
        if (job !== generation) return;
        try {
          if (isHeicTool) await PicLocalAssets.heic(signal);
          const result = await PicCore.convert(item.file, tool, settings, signal);
          if (job !== generation) return;
          const extension = result.blob.type.split('/')[1].replace('jpeg', 'jpg');
          item.output = { ...result, name: PicCore.uniqueName(item.file.name, extension, used), url: URL.createObjectURL(result.blob) };
          item.status = 'done';
        } catch (error) {
          if (job !== generation) return;
          item.status = signal.aborted ? 'cancelled' : 'failed'; item.error = error.code || 'DECODE';
        }
        finished++; $('progress').value = finished; renderRow(item); renderSummary();
      }
    } finally {
      if (job === generation) {
        const status = signal.aborted ? 'cancelled' : items.every(item => item.output) ? 'success' : items.some(item => item.output) ? 'partial' : 'failed';
        trackUsage('pic_conversion_result', source, status);
        busy = false;
        showNotice(signal.aborted ? 'stopped' : 'completed');
        controller = null; renderAll();
      }
    }
  });
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.hidden = true;
    document.body.append(anchor); anchor.click(); anchor.remove();
    // Do not revoke before the browser has consumed the download.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  $('file-list').addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button || busy || packing) return;
    const item = items.find(value => value.id === button.dataset.id);
    if (!item) return;
    if (button.dataset.action === 'download' && item.output) {
      download(item.output.blob, item.output.name);
      trackUsage('pic_download_click', usageSource([item]), 'image');
    }
    if (button.dataset.action === 'original' && item.output) {
      download(item.file, item.file.name);
      trackUsage('pic_download_click', usageSource([item]), 'original');
    }
    if (button.dataset.action === 'remove') {
      release(item); items = items.filter(value => value !== item);
      rowNodes.get(item.id)?.remove(); rowNodes.delete(item.id); renderSummary();
    }
  });
  $('zip').addEventListener('click', async () => {
    if (busy || packing || loadingSample) return;
    const success = items.filter(item => item.output);
    if (!success.length) { showNotice('noneReady', '', true); return; }
    if (!PicCore.canZip(success.map(item => item.output.blob.size))) { showNotice('zipLimit', '', true); return; }
    const job = generation;
    packing = true; renderAll(); showNotice('zipBusy');
    try {
      const zip = new JSZip();
      for (const item of success) zip.file(item.output.name, item.output.blob);
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true }, metadata => {
        if (job === generation) showNotice('zipBusy', `${Math.round(metadata.percent)}%`);
      });
      if (job !== generation) return;
      download(blob, `picuplift-${tool}.zip`);
      trackUsage('pic_download_click', usageSource(success), 'zip');
      showNotice('zipDone');
    } catch (_) { if (job === generation) showNotice('zipError', '', true); }
    finally { if (job === generation) { packing = false; renderAll(); } }
  });
  window.addEventListener('pagehide', () => {
    generation++;
    svgSelection++; loadingSvg = false;
    sampleGeneration++; loadingSample = false;
    controller?.abort(); items.forEach(release);
    // Never restore stale, revoked output URLs from the back/forward cache.
    items.forEach(item => { item.status = 'queued'; });
  });
  window.addEventListener('pageshow', event => { if (event.persisted) { busy = packing = false; controller = null; renderAll(); showNotice('changed'); } });
  setLanguage(language);
})();


/* Microsoft Clarity — session recordings & heatmaps (Project zafmysk90z). */
(function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "zafmysk90z");
