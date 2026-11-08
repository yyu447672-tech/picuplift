/* PicUplift local PDF tools. No document content or names enter analytics. */
(function (root) {
  'use strict';
  const LIMITS = Object.freeze({ pixels:16000000, dimension:8192, file:50*1024*1024, bytes:256*1024*1024, pages:150, markdown:250000 });
  const fail = code => { throw new Error(code); };
  function guardCanvas(width, height) {
    if (![width,height].every(n => Number.isFinite(n) && n > 0 && n <= LIMITS.dimension) || width*height > LIMITS.pixels) fail('LIMIT');
    return true;
  }
  function detectFile(bytes) {
    if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) return 'png';
    if (bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return 'jpeg';
    if (new TextDecoder('latin1').decode(bytes.slice(0,1024)).includes('%PDF-')) return 'pdf';
    return 'unknown';
  }
  function inspectImage(bytes) {
    const kind=detectFile(bytes); let width, height;
    if (kind==='png' && bytes.length>=29) {
      const n=i=>bytes[i]*16777216+bytes[i+1]*65536+bytes[i+2]*256+bytes[i+3];
      width=n(16); height=n(20);
    } else if (kind==='jpeg') {
      let i=2;
      while(i+8<bytes.length) {
        if (bytes[i++]!==255) continue;
        let marker=bytes[i++]; while(marker===255) marker=bytes[i++];
        if (marker===0xda || marker===0xd9) break;
        if (marker===0x01 || marker>=0xd0 && marker<=0xd7) continue;
        const len=bytes[i]*256+bytes[i+1]; if (len<2 || i+len>bytes.length) break;
        if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
          height=bytes[i+3]*256+bytes[i+4]; width=bytes[i+5]*256+bytes[i+6]; break;
        }
        i+=len;
      }
    }
    if (!width || !height) fail('FORMAT');
    guardCanvas(width,height); return {kind,width,height};
  }
  // This parser produces text-only blocks. It has no HTML, URL, image or fetch sink.
  const inline = text => text.replace(/!\[([^\]]*)\]\([^)]*\)/g,'[$1]').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/\[([^\]]+)\]\[[^\]]*\]/g,'$1').replace(/(\*\*|__|~~)(.*?)\1/g,'$2').replace(/`([^`]+)`/g,'$1');
  function parseMarkdown(text) {
    if (text.length>LIMITS.markdown) fail('LIMIT');
    if (!text.trim()) fail('EMPTY');
    const lines=text.replace(/\r\n?/g,'\n').split('\n'), blocks=[];
    let para=[];
    const flush=()=>{if(para.length){blocks.push({type:'paragraph',text:inline(para.join(' '))});para=[];}};
    for(let i=0;i<lines.length;i++) {
      const line=lines[i];
      if (!line.trim()) {flush();continue;}
      const fence=line.match(/^\s*(`{3,}|~{3,})/);
      if(fence) {
        flush(); const code=[]; const end=new RegExp('^\\s*'+fence[1][0]+'{'+fence[1].length+',}\\s*$');
        while(++i<lines.length&&!end.test(lines[i])) code.push(lines[i]);
        blocks.push({type:'code',text:code.join('\n')});continue;
      }
      if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i+1]||'')) {
        flush();const rows=[line];i++;
        while(i+1<lines.length && lines[i+1].includes('|') && lines[i+1].trim()) rows.push(lines[++i]);
        for(const row of rows) blocks.push({type:'table',text:row.replace(/^\s*\||\|\s*$/g,'').split('|').map(s=>inline(s.trim())).join(' | ')});
        continue;
      }
      const heading=line.match(/^\s{0,3}(#{1,6})\s+(.*)/), list=line.match(/^\s*(?:[-+*]|\d+[.)])\s+(.*)/);
      if(heading){flush();blocks.push({type:'h'+heading[1].length,text:inline(heading[2].replace(/\s+#+\s*$/,''))});}
      else if (/!\[[^\]]*\]\([^)]*\)/.test(line)) {
        flush();const plain=inline(line.replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1')).trim();blocks.push({type:'image',text:plain});
      } else if(list){flush();blocks.push({type:'list',text:'• '+inline(list[1])});}
      else if (/^\s*>/.test(line)){flush();blocks.push({type:'quote',text:inline(line.replace(/^\s*>\s?/,''))});}
      else if (/^\s*\[[^\]]+\]:\s*\S+/.test(line)){flush();}
      else para.push(line);
    }
    flush(); return blocks;
  }
  function layoutMarkdown(blocks, options={}) {
    const width=options.width||794,height=options.height||1123,margin=options.margin||64;
    const measure=options.measure||((s,size)=>Array.from(s).length*size*.6);
    const pages=[[]]; let y=margin;
    for(const block of blocks) {
      let size=16, bold=false, mono=false;
      if(/^h[1-6]$/.test(block.type)){size=[30,26,22,20,18,17][Number(block.type[1])-1];bold=true;}
      if(block.type==='code'||block.type==='table'){size=13;mono=true;}
      if(block.type==='image') size=13;
      const leading=size*1.6, contentWidth=width-margin*2;
      const write=text=>{
        if(y+leading>height-margin) { if(pages.length>=LIMITS.pages) fail('LIMIT');pages.push([]);y=margin; }
        pages[pages.length-1].push({text,x:margin,y:y+size,size,bold,mono,type:block.type});y+=leading;
      };
      for(const raw of block.text.split('\n')) {
        let run='';
        for(const char of Array.from(raw)) {
          if(run && measure(run+char,size,bold,mono)>contentWidth){write(run);run='';}
          run+=char;
        }
        write(run);
      }
      y+=size*.65;
    }
    return pages;
  }
  const TOOLS=['convert-image-to-pdf','convert-pdf-to-image','convert-markdown-to-pdf'];
  function analyticsPayload(name,tool,status,protocol) {
    const events={pic_files_selected:[],pic_conversion_start:[],pic_conversion_result:['success','partial','failed','cancelled'],pic_download_click:['image','original','zip']};
    if (!['http:','https:'].includes(protocol)||!TOOLS.includes(tool)||!Object.hasOwn(events,name)) return null;
    if(events[name].length?!events[name].includes(status):status!==undefined) return null;
    const payload={send_to:'G-41GRYMECDD',tool,source:'user'};
    if(status!==undefined) payload.status=status;return payload;
  }
  function createJobGuard() {
    let generation=0;
    return Object.freeze({begin:()=>++generation,invalidate:()=>{generation++;},current:job=>job===generation,check:job=>{if(job!==generation)fail('CANCELLED');}});
  }
  async function appendImagePage(doc,bytes,imageWidth,imageHeight) {
    guardCanvas(imageWidth,imageHeight);
    const embedded=await doc.embedPng(bytes),landscape=imageWidth>imageHeight;
    const width=landscape?841.89:595.28,height=landscape?595.28:841.89,margin=24;
    const scale=Math.min((width-margin*2)/imageWidth,(height-margin*2)/imageHeight);
    const page=doc.addPage();page.setSize(width,height);page.drawImage(embedded,{x:(width-imageWidth*scale)/2,y:(height-imageHeight*scale)/2,width:imageWidth*scale,height:imageHeight*scale});
    return page;
  }
  root.PicPDF=Object.freeze({LIMITS,guardCanvas,detectFile,inspectImage,parseMarkdown,layoutMarkdown,analyticsPayload,appendImagePage,createJobGuard});
  if(typeof document==='undefined') return;
  const tool=document.body.dataset.tool;
  if(!TOOLS.includes(tool)) return;
  const $=id=>document.getElementById(id), copy=root.PicCopy, page=copy.pages[tool];
  const isMarkdown=tool==='convert-markdown-to-pdf', isImages=tool==='convert-image-to-pdf', isPDF=tool==='convert-pdf-to-image';
  let lang=new URLSearchParams(location.search).get('lang')==='zh'?'zh':'en';
  let files=[],rows=[],outputs=[],busy=false,packing=false,aborted=false,task=null,renderTask=null;
  let noticeKey='pdfReady',noticeSuffix='',noticeError=false, inputGeneration=0;
  const tempURLs=new Set(), outputURLs=new Set(), jobs=createJobGuard(); let libPromise,pdfjsPromise;
  const t=key=>copy.common[lang][key]??copy.common.en[key]??key;
  const p=key=>page[lang][key]??page.en[key];
  const element=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
  function track(name,status) {try{const params=analyticsPayload(name,tool,status,location.protocol);if(params&&typeof root.gtag==='function')root.gtag('event',name,params);}catch(_) {}}
  function check(job){jobs.check(job);if(aborted)fail('CANCELLED');}
  const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
  function say(key,error=false,suffix='') {noticeKey=key;noticeSuffix=suffix;noticeError=error;$('notice').textContent=t(key)+(suffix?' '+suffix:'');$('notice').classList.toggle('error',error);}
  const size=bytes=>bytes<1024?`${bytes} B`:bytes<1024*1024?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1048576).toFixed(1)} MB`;
  function errorKey(error) {
    if(error?.name==='PasswordException'||error?.message==='PASSWORD')return 'pdfPassword';
    return ({LIMIT:'pdfLimit',FORMAT:'pdfInvalid',EMPTY:'pdfEmpty',LOCAL_HTTP:'pdfHttp',DEPENDENCY:'pdfDependency',CANCELLED:'pdfCancelled'}[error?.message]||'pdfFailed');
  }
  function releaseOutputs(){outputURLs.forEach(url=>URL.revokeObjectURL(url));outputURLs.clear();outputs=[];}
  function reset(){releaseOutputs();rows=files.map(file=>({name:file.name,status:'queued',detail:size(file.size)}));$('progress').hidden=true;render();}
  function controls(){
    $('browse').disabled=busy||packing;$('file-input').disabled=busy||packing;$('settings').disabled=busy||packing;
    $('clear').disabled=busy||packing||(!files.length&&!$('markdown-input')?.value&&!outputs.length);
    $('start').disabled=busy||packing||(isMarkdown?!$('markdown-input').value.trim():!files.length)||(isPDF&&location.protocol==='file:');
    $('cancel').hidden=!busy;$('cancel').disabled=aborted;$('drop-zone').classList.toggle('is-disabled',busy||packing);
    if($('markdown-input'))$('markdown-input').disabled=busy||packing;
    if($('zip')){$('zip').disabled=busy||packing||!outputs.length;$('zip').textContent=t(packing?'zipBusy':'zip');}
  }
  function render(){
    $('file-count').textContent=String(outputs.length||files.length);$('empty').hidden=!!rows.length||!!outputs.length;
    const list=$('file-list');list.replaceChildren();
    for(const item of rows){
      const row=element('li',undefined,'file-row'),head=element('div',undefined,'file-head'),title=element('div',undefined,'file-title');
      title.append(element('strong',item.name),element('span',item.detail));head.append(title,element('span',t(item.status),'file-status '+item.status));row.append(head);
      if(item.error)row.append(element('p',t(item.error),'row-error'));
      list.append(row);
    }
    for(const output of outputs){
      const row=element('li',undefined,'file-row'),head=element('div',undefined,'file-head');
      if(output.mime.startsWith('image/')){const thumb=element('div',undefined,'thumbnail'),img=element('img');img.src=output.url;img.alt=`${t('pdfPage')} ${output.page}`;img.loading='lazy';thumb.append(img);head.append(thumb);}
      const title=element('div',undefined,'file-title');title.append(element('strong',output.name),element('span',`${output.pages?output.pages+' '+t('pdfPages')+' · ':''}${size(output.blob.size)}`));head.append(title,element('span',t('done'),'file-status done'));row.append(head);
      const action=element('button',t('download'),'row-button');action.type='button';action.disabled=busy||packing;action.addEventListener('click',()=>{if(!busy&&!packing){download(output.blob,output.name);track('pic_download_click','image');}});row.append(action);list.append(row);
    }
    controls();
  }
  function localize(){
    document.documentElement.lang=lang==='zh'?'zh-CN':'en';
    document.querySelectorAll('[data-copy]').forEach(node=>node.textContent=t(node.dataset.copy));
    document.querySelectorAll('[data-page]').forEach(node=>node.textContent=p(node.dataset.page));
    document.querySelectorAll('[data-copy-label]').forEach(node=>node.setAttribute('aria-label',t(node.dataset.copyLabel)));
    document.querySelectorAll('[data-copy-placeholder]').forEach(node=>node.setAttribute('placeholder',t(node.dataset.copyPlaceholder)));
    document.querySelectorAll('[data-step-title]').forEach(node=>node.textContent=p('steps')[Number(node.dataset.stepTitle)][0]);
    document.querySelectorAll('[data-step-body]').forEach(node=>node.textContent=p('steps')[Number(node.dataset.stepBody)][1]);
    document.querySelectorAll('[data-faq-q]').forEach(node=>node.textContent=p('faq')[Number(node.dataset.faqQ)][0]);
    document.querySelectorAll('[data-faq-a]').forEach(node=>node.textContent=p('faq')[Number(node.dataset.faqA)][1]);
    const toggle=$('language-toggle');toggle.textContent=lang==='en'?'中文':'EN';toggle.lang=lang==='en'?'zh-CN':'en';toggle.setAttribute('aria-label',t('pdfLanguage'));
    document.querySelectorAll('a[href]').forEach(link=>{
      const url=new URL(link.getAttribute('href'),location.href);
      if(Object.values(copy.pages).some(entry=>url.pathname.endsWith('/'+entry.file))){
        if(lang==='zh')url.searchParams.set('lang','zh');else url.searchParams.delete('lang');
        link.setAttribute('href','./'+url.pathname.split('/').pop()+url.search+url.hash);
      }
    });
    say(noticeKey,noticeError,noticeSuffix);render();if(isMarkdown)preview();
  }
  $('language-toggle').addEventListener('click',()=>{lang=lang==='en'?'zh':'en';localize();});
  function loadLib(){
    if(root.PDFLib)return Promise.resolve(root.PDFLib);
    if(!libPromise)libPromise=new Promise((resolve,reject)=>{
      const script=element('script');script.src='./assets/vendor/pdf-lib-1.17.1.min.js';script.onload=()=>root.PDFLib?resolve(root.PDFLib):reject(new Error('DEPENDENCY'));script.onerror=()=>reject(new Error('DEPENDENCY'));document.head.append(script);
    }).catch(error=>{libPromise=null;throw error;});return libPromise;
  }
  async function loadPDFJS(){
    if(location.protocol==='file:')fail('LOCAL_HTTP');
    if(!pdfjsPromise)pdfjsPromise=import('./vendor/pdfjs-6.5.438/pdf.mjs').then(lib=>{lib.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs-6.5.438/pdf.worker.mjs',document.currentScript?.src||new URL('assets/pdf-tools.js',location.href)).href;return lib;}).catch(()=>{pdfjsPromise=null;fail('DEPENDENCY');});
    return pdfjsPromise;
  }
  async function addFiles(selected){
    if(busy||packing||!selected.length)return;
    const request=++inputGeneration;
    if(isMarkdown){
      if(selected.length!==1){say('pdfSingle',true);return;}
      const file=selected[0];
      try{if(file.size>LIMITS.markdown*4)fail('LIMIT');const text=await file.text();if(request!==inputGeneration)return;parseMarkdown(text);$('markdown-input').value=text;files=[file];reset();preview();track('pic_files_selected');say('pdfAdded');}catch(e){if(request===inputGeneration)say(errorKey(e),true);}
    } else {
      if(isPDF&&selected.length!==1){say('pdfSingle',true);return;}
      if(isImages && files.length+selected.length>LIMITS.pages){say('pdfLimit',true);return;}
      files=isImages?files.concat(selected):selected;reset();track('pic_files_selected');say('pdfAdded');
    }
    $('file-input').value='';controls();
  }
  $('browse').addEventListener('click',()=>$('file-input').click());
  $('file-input').addEventListener('change',event=>addFiles(Array.from(event.target.files)));
  ['dragenter','dragover'].forEach(name=>$('drop-zone').addEventListener(name,event=>{event.preventDefault();if(!busy&&!packing)$('drop-zone').classList.add('is-dragging');}));
  ['dragleave','drop'].forEach(name=>$('drop-zone').addEventListener(name,event=>{event.preventDefault();$('drop-zone').classList.remove('is-dragging');if(name==='drop')addFiles(Array.from(event.dataTransfer.files));}));
  root.addEventListener('dragover',event=>event.preventDefault());root.addEventListener('drop',event=>event.preventDefault());
  $('clear').addEventListener('click',()=>{if(busy||packing)return;inputGeneration++;files=[];if(isMarkdown){$('markdown-input').value='';preview();}reset();say('pdfCleared');});
  $('settings').addEventListener('input',()=>{if(busy||packing)return;reset();say('changed');});
  if(isMarkdown)$('markdown-input').addEventListener('input',()=>{inputGeneration++;files=[];reset();preview();say('pdfEdited');});
  function preview(){
    const area=$('markdown-preview');area.replaceChildren();const text=$('markdown-input').value;if(!text.trim()){area.hidden=true;return;}
    try{
      const blocks=parseMarkdown(text);for(const block of blocks){
        const tag=/^h[1-6]$/.test(block.type)?block.type:block.type==='code'?'pre':block.type==='quote'?'blockquote':'p';
        const node=element(tag,block.type==='image'?`${t('pdfImageOmitted')} ${block.text}`:block.text);if(block.type==='table')node.className='markdown-table';area.append(node);
      }area.hidden=false;
    }catch(e){area.hidden=true;say(errorKey(e),true);}
  }
  function download(blob,name){const url=URL.createObjectURL(blob);tempURLs.add(url);const a=element('a');a.href=url;a.download=name;a.hidden=true;document.body.append(a);a.click();a.remove();setTimeout(()=>{URL.revokeObjectURL(url);tempURLs.delete(url);},30000);}
  function addOutput(blob,name,extra={}){
    if(outputs.reduce((sum,o)=>sum+o.blob.size,0)+blob.size>LIMITS.bytes)fail('LIMIT');
    const url=URL.createObjectURL(blob);outputURLs.add(url);outputs.push({blob,name,url,mime:blob.type,...extra});
  }
  async function readFile(file,job){if(!file.size)fail('EMPTY');if(file.size>LIMITS.file)fail('LIMIT');const bytes=new Uint8Array(await file.arrayBuffer());check(job);return bytes;}
  async function canvasBlob(canvas,mime,quality,job){const blob=await new Promise(resolve=>canvas.toBlob(resolve,mime||'image/png',quality??.9));check(job);if(!blob||blob.type!==(mime||'image/png'))fail('ENCODE');return blob;}
  async function decodeImage(file,bytes,job){
    inspectImage(bytes);let image,url;
    try{
      if(typeof createImageBitmap==='function')image=await createImageBitmap(file,{imageOrientation:'from-image'});
      else {url=URL.createObjectURL(file);image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('FORMAT'));img.src=url;});}
      check(job);const width=image.width,height=image.height;guardCanvas(width,height);const canvas=element('canvas');canvas.width=width;canvas.height=height;
      try{const ctx=canvas.getContext('2d');if(!ctx)fail('LIMIT');ctx.drawImage(image,0,0);const blob=await canvasBlob(canvas,undefined,undefined,job);return {bytes:new Uint8Array(await blob.arrayBuffer()),width,height};}finally{canvas.width=canvas.height=0;}
    }finally{image?.close?.();if(url)URL.revokeObjectURL(url);}
  }
  async function imagePDF(job){
    const lib=await loadLib();check(job);const doc=await lib.PDFDocument.create();check(job);let count=0, inputBytes=0;
    for(let i=0;i<files.length;i++){
      check(job);const row=rows[i];row.status='processing';render();await pause();check(job);
      try{
        const image=await decodeImage(files[i],await readFile(files[i],job),job);check(job);
        inputBytes+=image.bytes.length;if(inputBytes>LIMITS.bytes)fail('LIMIT');
        await appendImagePage(doc,image.bytes,image.width,image.height);check(job);count++;row.status='done';
      }catch(e){check(job);row.status='failed';row.error=errorKey(e);}
      $('progress').value=i+1;render();await pause();
    }
    check(job);if(!count)fail('FORMAT');
    const bytes=await doc.save();check(job);addOutput(new Blob([bytes],{type:'application/pdf'}),'picuplift-images.pdf',{pages:count});
    return rows.some(row=>row.status==='failed')?'partial':'success';
  }
  async function pdfImages(job){
    const bytes=await readFile(files[0],job);if(detectFile(bytes)!=='pdf')fail('FORMAT');
    const lib=await loadPDFJS();check(job);const base=new URL('./assets/vendor/pdfjs-6.5.438/',location.href).href;
    const loadingTask=lib.getDocument({data:bytes,cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/',useWorkerFetch:true,isEvalSupported:false,enableXfa:false,stopAtErrors:true,maxImageSize:LIMITS.pixels,canvasMaxAreaInBytes:LIMITS.pixels*4,isOffscreenCanvasSupported:false});
    task=loadingTask;let password=false;loadingTask.onPassword=()=>{password=true;void loadingTask.destroy().catch(()=>{});};
    let doc;
    try{
      try{doc=await loadingTask.promise;}catch(e){if(password)fail('PASSWORD');throw e;}
      check(job);if(doc.numPages>LIMITS.pages)fail('LIMIT');rows[0].status='processing';render();$('progress').max=doc.numPages;
      const format=$('output-format').value,mime=format==='jpeg'?'image/jpeg':'image/png',scale=Number($('render-scale').value);
      for(let number=1;number<=doc.numPages;number++){
        check(job);const page=await doc.getPage(number);check(job);const viewport=page.getViewport({scale}),width=Math.ceil(viewport.width),height=Math.ceil(viewport.height);guardCanvas(width,height);
        const canvas=element('canvas');canvas.width=width;canvas.height=height;
        try{
          const context=canvas.getContext('2d');if(!context)fail('LIMIT');
          const currentRender=page.render({canvasContext:context,viewport,background:'rgb(255,255,255)'});renderTask=currentRender;await currentRender.promise;if(renderTask===currentRender)renderTask=null;check(job);
          const blob=await canvasBlob(canvas,mime,.9,job);addOutput(blob,`page-${String(number).padStart(3,'0')}.${format==='jpeg'?'jpg':'png'}`,{page:number});
        }finally{if(jobs.current(job))renderTask=null;canvas.width=canvas.height=0;page.cleanup();}
        $('progress').value=number;render();await pause();
      }
      check(job);rows[0].status='done';return 'success';
    }finally{await loadingTask.destroy().catch(()=>{});if(task===loadingTask)task=null;}
  }
  const systemFont='-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
  function canvasFont(size,bold,mono){return `${bold?'600':'400'} ${size}px ${mono?'ui-monospace, SFMono-Regular, Consolas, "PingFang SC", monospace':systemFont}`;}
  async function markdownPDF(job){
    const blocks=parseMarkdown($('markdown-input').value).map(block=>block.type==='image'?{...block,text:`${t('pdfImageOmitted')} ${block.text}`}:block);
    const lib=await loadLib();check(job);
    const canvas=element('canvas');canvas.width=794;canvas.height=1123;const ctx=canvas.getContext('2d');if(!ctx)fail('LIMIT');
    try{
      const pages=layoutMarkdown(blocks,{measure:(text,size,bold,mono)=>{ctx.font=canvasFont(size,bold,mono);return ctx.measureText(text).width;}});
      const doc=await lib.PDFDocument.create();check(job);$('progress').max=pages.length;rows=[{name:t('pdfDocument'),status:'processing',detail:''}];render();
      for(let i=0;i<pages.length;i++){
        check(job);ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.textBaseline='alphabetic';
        for(const line of pages[i]){
          ctx.font=canvasFont(line.size,line.bold,line.mono);ctx.fillStyle=line.type==='image'?'#596475':'#232a34';
          ctx.fillText(line.text,line.x,line.y);
        }
        const blob=await canvasBlob(canvas,undefined,undefined,job),img=await doc.embedPng(await blob.arrayBuffer());check(job);const pdfPage=doc.addPage();pdfPage.setSize(595.28,841.89);pdfPage.drawImage(img,{x:0,y:0,width:595.28,height:841.89});$('progress').value=i+1;await pause();
      }
      const bytes=await doc.save();check(job);addOutput(new Blob([bytes],{type:'application/pdf'}),'picuplift-markdown.pdf',{pages:pages.length});rows[0].status='done';return 'success';
    }finally{canvas.width=canvas.height=0;}
  }
  $('cancel').addEventListener('click',()=>{aborted=true;renderTask?.cancel();if(task)void task.destroy().catch(()=>{});controls();});
  $('start').addEventListener('click',async()=>{
    if(busy||packing||$('start').disabled)return;
    inputGeneration++;reset();busy=true;aborted=false;const job=jobs.begin();controls();say('processing');$('progress').hidden=false;$('progress').max=files.length||1;$('progress').value=0;
    track('pic_conversion_start');let result='failed';
    try{result=await(isImages?imagePDF(job):isPDF?pdfImages(job):markdownPDF(job));check(job);say(result==='partial'?'pdfPartial':'pdfComplete');}
    catch(e){if(!jobs.current(job))return;result=aborted?'cancelled':outputs.length?'partial':'failed';rows.forEach(row=>{if(row.status==='processing'||row.status==='queued'){row.status=aborted?'cancelled':'failed';row.error=aborted?undefined:errorKey(e);}});say(aborted?'pdfCancelled':errorKey(e),!aborted);}
    finally{if(jobs.current(job)){busy=false;renderTask=null;task=null;track('pic_conversion_result',result);render();}}
  });
  if($('zip'))$('zip').addEventListener('click',async()=>{
    if(busy||packing||!outputs.length)return;const job=jobs.begin();packing=true;render();say('zipBusy');
    try{const zip=new root.JSZip();outputs.forEach(o=>zip.file(o.name,o.blob));const blob=await zip.generateAsync({type:'blob',compression:'STORE'});if(!jobs.current(job))return;download(blob,'picuplift-pdf-pages.zip');track('pic_download_click','zip');say('pdfComplete');}catch(_){if(jobs.current(job))say('pdfZipFailed',true);}finally{if(jobs.current(job)){packing=false;render();}}
  });
  root.addEventListener('pagehide',()=>{aborted=true;jobs.invalidate();inputGeneration++;renderTask?.cancel();if(task)void task.destroy().catch(()=>{});releaseOutputs();tempURLs.forEach(url=>URL.revokeObjectURL(url));tempURLs.clear();});
  root.addEventListener('pageshow',event=>{if(event.persisted){busy=false;packing=false;rows=files.map(file=>({name:file.name,status:'queued',detail:size(file.size)}));render();}});
  if(isPDF&&location.protocol==='file:')noticeKey='pdfHttp';
  localize();
})(globalThis);

/* Microsoft Clarity — session recordings & heatmaps (Project zafmysk90z). */
(function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "zafmysk90z");
