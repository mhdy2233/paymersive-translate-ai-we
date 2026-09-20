/* Runs in the isolated content-script world. API credentials never enter the page. */
(() => {
  let candidate, active;
  const originals=new WeakMap();
  document.addEventListener('contextmenu',event=>{
    candidate=event.composedPath().find(node=>node instanceof HTMLImageElement);
  },true);
  chrome.runtime.onMessage.addListener(message=>{
    if(!message?.inkSelectImage)return;
    const img=candidate?.isConnected ? candidate : [...document.images].find(i=>i.currentSrc===message.inkSelectImage || i.src===message.inkSelectImage);
    if(img)open(img);
  });

  async function open(img) {
    active?.close();
    const host=document.createElement('div');host.id='ink-image-editor';
    const root=host.attachShadow({mode:'open'});
    root.innerHTML=`<style>
      :host{all:initial;position:fixed;inset:0;z-index:2147483647;font:14px/1.5 system-ui,"Microsoft YaHei",sans-serif;color:#e8edf2;color-scheme:dark}
      *{box-sizing:border-box}button,select,textarea,input{font:inherit;color:inherit}button,select,input{border:1px solid #495461;border-radius:6px;background:#28323c;padding:7px 11px}input{width:72px}button{cursor:pointer}button:disabled{opacity:.4;cursor:default}button.primary{background:#d43c73;border-color:#d43c73}button:hover:enabled{filter:brightness(1.15)}
      .shell{position:absolute;inset:0;display:flex;flex-direction:column;background:#10171e}header{display:flex;align-items:center;gap:10px;padding:12px 18px;border-bottom:1px solid #34404b}h2{font-size:17px;margin:0 auto 0 0}.tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 18px}label{display:flex;align-items:center;gap:7px;font-size:13px}.main{flex:1;min-height:0;display:flex}.viewport{flex:1;overflow:auto;padding:20px;background:#080d11;position:relative}.stage{position:relative;display:inline-block;vertical-align:top;line-height:0;touch-action:none}canvas{display:block}svg{position:absolute;inset:0;width:100%;height:100%;cursor:crosshair;touch-action:none}rect{fill:#f2559620;stroke:#ff72ad;stroke-width:2;vector-effect:non-scaling-stroke}rect.selected{stroke:#ffe9f2;fill:#ff72ad30}rect.handle{fill:#fff;stroke:#d43c73;cursor:nwse-resize}text{fill:#fff;stroke:#30111d;stroke-width:2;paint-order:stroke;font:16px sans-serif;pointer-events:none}aside{width:290px;overflow:auto;padding:14px;border-left:1px solid #34404b}aside p{color:#9caebd;margin:0 0 12px}.row{border:1px solid #3a4855;border-radius:6px;margin-bottom:12px;padding:10px}.row>div{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}.row button{padding:2px 8px}.row textarea{width:100%;min-height:88px;resize:vertical;padding:8px;background:#111a22;border:1px solid #495461;border-radius:4px}.row small{color:#aab8c5;display:block;white-space:pre-wrap;margin:6px 0}footer{display:flex;align-items:center;gap:12px;padding:12px 18px;border-top:1px solid #34404b}#status{flex:1;margin:0;color:#adbdc9}.error{color:#ff899b!important}.zoom{margin-left:auto;display:flex;align-items:center;gap:8px}#cancel[hidden]{display:none}@media(max-width:800px){aside{width:220px}.tools{gap:6px}label{font-size:12px}header,footer{padding:10px}footer{flex-wrap:wrap}}
      input[type=checkbox]{width:auto;accent-color:#d43c73}.row .row-actions{display:flex;gap:5px}.row label{display:block;margin:8px 0 3px;color:#aab8c5}.row textarea.original{min-height:66px}footer{flex-wrap:wrap}
    </style><div class="shell" role="dialog" aria-modal="true" aria-label="框选翻译">
      <header><h2>框选翻译</h2><button id="undo">撤销回填</button><button id="restore">恢复原图</button><button id="close" aria-label="关闭框选翻译">关闭</button></header>
      <div class="tools">
        <label>模型 <select id="mode"><option value="balanced">均衡</option><option value="npu">NPU 优先</option><option value="accurate">多视图</option><option value="wechat">微信 OCR</option><option value="manga">Manga OCR</option></select></label>
        <label>译为 <select id="target"><option value="zh-CN">简体中文</option><option value="zh-TW">繁體中文</option><option value="en">English</option><option value="ja">日本語</option><option value="ko">한국어</option></select></label>
        <label>回填 <select id="repair"><option value="auto">漫画修复</option><option value="solid">纯色覆盖</option></select></label>
        <label>选字 <select id="mask"><option value="auto">自动</option><option value="dark">深色字</option><option value="light">浅色字</option></select></label>
        <label>排版 <select id="direction"><option value="auto">自动</option><option value="horizontal">横排</option><option value="vertical">竖排</option></select></label>
        <label>字号 <input id="fontSize" type="number" min="0" max="160" value="0" title="0 为自动"></label>
        <label><input id="autoApply" type="checkbox">一键翻译回填</label>
        <button id="clear">清空框选</button><div class="zoom"><button id="minus">−</button><span id="zoom">100%</span><button id="plus">＋</button></div>
      </div>
      <div class="main"><div class="viewport"><div class="stage"><canvas id="canvas"></canvas><svg id="overlay"></svg></div></div><aside><p>拖框选择文字，可移动、缩放或删除。</p><div id="rows"></div></aside></div>
      <footer><p id="status" role="status" aria-live="polite">读取图片…</p><button id="cancel" hidden>取消</button><button id="recognize" disabled>识别选区</button><button id="translate" class="primary" disabled>翻译选区</button><button id="preview" disabled>预览</button><button id="apply" class="primary" disabled>回填图片</button></footer>
    </div>`;
    document.documentElement.append(host);
    const $=id=>root.getElementById(id),canvas=$('canvas'),svg=$('overlay');
    const record=originals.get(img) || {src:img.getAttribute('src'),srcset:img.getAttribute('srcset'),
      sources:[...(img.closest('picture')?.querySelectorAll('source') || [])].map(e=>[e,e.getAttribute('srcset')]),
      url:img.currentSrc || img.src,history:[],current:null};
    originals.set(img,record);
    let alive=true,busy=false,cancelled=false,source='',rendered='',regions=[],boxes=[],patches=null,selected=-1,zoom=1,drag,currentRequest;
    const previousFocus=document.activeElement;
    function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
    const recognized=()=>regions.length>0 && regions.every((_,i)=>boxes[i]?.originalText?.trim());
    const translated=()=>recognized() && regions.every((_,i)=>boxes[i]?.translatedText?.trim());
    function controls(){
      for(const id of ['mode','target','repair','mask','direction','fontSize','clear','undo','restore','autoApply'])$(id).disabled=busy;
      $('recognize').disabled=busy || !source || !regions.length;
      $('translate').disabled=busy || !source || !regions.length || (!$('autoApply').checked && !recognized());
      $('translate').textContent=$('autoApply').checked?'翻译并回填':'翻译选区';
      $('preview').disabled=$('apply').disabled=busy || !translated();
      $('undo').disabled=busy || !record.history.length;
      $('restore').disabled=busy || !record.current;
      $('cancel').hidden=!busy;
      root.querySelectorAll('textarea,.row button').forEach(e=>e.disabled=busy);
    }
    async function call(method,data){
      const id=crypto.randomUUID();currentRequest=id;
      try{
        const reply=await chrome.runtime.sendMessage({inkEditor:{method,data,id}});
        if(!alive)throw new Error('已关闭');
        if(cancelled)throw new Error('已取消');
        if(reply?.error || !reply)throw new Error(reply?.error || '插件未响应');
        return reply.value;
      }finally{if(currentRequest===id)currentRequest=null;}
    }
    function close(){alive=false;if(currentRequest)chrome.runtime.sendMessage({inkEditor:{method:'cancel',id:currentRequest}}).catch(()=>{});host.remove();document.removeEventListener('keydown',key,true);if(active?.host===host)active=null;previousFocus?.focus?.();}
    active={host,close};$('close').onclick=close;
    $('autoApply').onchange=async()=>{
      const wanted=$('autoApply').checked;controls();
      try{
        const reply=await chrome.runtime.sendMessage({inkEditor:{method:'preferences',data:{autoApply:wanted}}});
        if(reply?.error || !reply)throw new Error(reply?.error || '设置保存失败');
      }catch(error){if(alive){$('autoApply').checked=!wanted;controls();status(error.message,true);}}
    };
    function key(e){
      if(e.key==='Escape'){e.stopPropagation();close();return;}
      if(e.key==='Tab'){
        const focusable=[...root.querySelectorAll('button,select,textarea,input')].filter(e=>!e.disabled && !e.hidden);
        const at=focusable.indexOf(root.activeElement),next=(at+(e.shiftKey?-1:1)+focusable.length)%focusable.length;
        e.preventDefault();e.stopPropagation();focusable[next]?.focus();
      }
      if(e.key==='Delete' && root.activeElement?.tagName!=='TEXTAREA' && !busy && selected>=0){e.preventDefault();regions.splice(selected,1);selected=-1;invalidate();}
    }
    document.addEventListener('keydown',key,true);
    function restoreAttrs(){
      for(const [key,value] of [['src',record.src],['srcset',record.srcset]])value===null?img.removeAttribute(key):img.setAttribute(key,value);
      for(const [e,value] of record.sources)if(e.isConnected)value===null?e.removeAttribute('srcset'):e.setAttribute('srcset',value);
    }
    function replaceImage(data){
      if(!img.isConnected)throw new Error('原图片已离开页面，请重新打开框选');
      img.removeAttribute('srcset');for(const [e] of record.sources)e.removeAttribute('srcset');img.src=data;
    }
    function finishBatch(data,message){
      source=data;rendered='';regions=[];boxes=[];patches=null;selected=-1;drag=null;
      rows();paint();status(message);controls();
    }
    $('undo').onclick=()=>perform(async()=>{
      if(!record.history.length)return;
      const data=record.history[record.history.length-1];await draw(data || record.originalData);
      if(!alive || cancelled)throw new Error('已取消');
      if(data===null)restoreAttrs();else replaceImage(data);
      record.history.pop();record.current=data;
      finishBatch(data || record.originalData,'已撤销，可继续框选');
    });
    $('restore').onclick=()=>perform(async()=>{
      await draw(record.originalData);if(!alive || cancelled)throw new Error('已取消');
      restoreAttrs();record.current=null;record.history=[];
      finishBatch(record.originalData,'已恢复原图，可继续框选');
    });
    $('cancel').onclick=()=>{cancelled=true;status('取消中…');if(currentRequest)chrome.runtime.sendMessage({inkEditor:{method:'cancel',id:currentRequest}}).catch(()=>{});};
    async function draw(data){
      const picture=new Image();picture.src=data;await picture.decode();if(!alive)return;
      if(picture.naturalWidth*picture.naturalHeight>40_000_000)throw new Error('图片超过 4000 万像素');
      canvas.width=picture.naturalWidth;canvas.height=picture.naturalHeight;canvas.getContext('2d').drawImage(picture,0,0);
      svg.setAttribute('viewBox',`0 0 ${canvas.width} ${canvas.height}`);resize();
    }
    function resize(){canvas.style.width=Math.round(canvas.width*zoom)+'px';canvas.style.height=Math.round(canvas.height*zoom)+'px';$('zoom').textContent=Math.round(zoom*100)+'%';paint();}
    $('plus').onclick=()=>{zoom=Math.min(4,zoom*1.25);resize();};$('minus').onclick=()=>{zoom=Math.max(.1,zoom/1.25);resize();};
    function paint(){
      svg.replaceChildren();
      const make=(tag,attrs)=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);svg.append(e);return e;};
      regions.forEach((r,i)=>{
        make('rect',{x:r.x,y:r.y,width:r.width,height:r.height,'data-index':i,class:i===selected?'selected':''});
        make('text',{x:r.x+4/zoom,y:r.y+18/zoom,'font-size':16/zoom}).textContent=String(i+1);
        if(i===selected)for(const [corner,x,y] of [['tl',r.x,r.y],['tr',r.x+r.width,r.y],['bl',r.x,r.y+r.height],['br',r.x+r.width,r.y+r.height]])make('rect',{x:x-4/zoom,y:y-4/zoom,width:8/zoom,height:8/zoom,'data-index':i,'data-corner':corner,class:'handle'});
      });
    }
    function rows(){
      $('rows').replaceChildren();
      regions.forEach((r,i)=>{
        const row=document.createElement('div');row.className='row';
        const head=document.createElement('div'),label=document.createElement('span'),remove=document.createElement('button'),recognize=document.createElement('button'),actions=document.createElement('span');
        label.textContent=`${i+1} · ${Math.round(r.width)} × ${Math.round(r.height)}`;remove.textContent='删除';
        recognize.textContent=boxes[i]?'重识别':'识别';recognize.dataset.recognize=String(i);recognize.onclick=()=>perform(()=>recognizeRegions([i]));
        remove.dataset.remove=String(i);remove.onclick=()=>{regions.splice(i,1);selected=-1;invalidate();};actions.className='row-actions';actions.append(recognize,remove);head.append(label,actions);row.append(head);
        if(boxes[i]){
          const originalLabel=document.createElement('label'),original=document.createElement('textarea');
          originalLabel.textContent='原文';original.className='original';original.value=boxes[i].originalText;original.setAttribute('aria-label',`第 ${i+1} 框原文`);
          original.oninput=()=>{boxes[i].originalText=original.value;boxes[i].translatedText='';row.querySelector('textarea.translation').value='';rendered='';patches=null;status('原文已修改，请重新翻译');controls();};
          const translationLabel=document.createElement('label'),input=document.createElement('textarea');translationLabel.textContent='译文';input.className='translation';input.value=boxes[i].translatedText || '';input.setAttribute('aria-label',`第 ${i+1} 框译文`);input.placeholder='翻译后显示';
          input.oninput=()=>{boxes[i].translatedText=input.value;rendered='';status('译文已修改');controls();};row.append(originalLabel,original,translationLabel,input);
        }
        $('rows').append(row);
      });
      controls();
    }
    function invalidate(reset=false){
      const previous=new Map(boxes.filter(Boolean).map(b=>[b.regionId,b]));
      boxes=regions.map(r=>{const b=previous.get(r.id);return !reset && b && b.bounding.every((v,i)=>v===[r.x,r.y,r.width,r.height][i])?b:null;});
      patches=null;rendered='';if(source)draw(source).catch(e=>status(e.message,true));rows();paint();status(regions.length?`已选 ${regions.length} 框`:'拖框选择文字');
    }
    $('clear').onclick=()=>{regions=[];selected=-1;invalidate();};
    $('mode').onchange=()=>invalidate(true);
    $('target').onchange=()=>{boxes.forEach(b=>{if(b)b.translatedText='';});rendered='';rows();status('目标语言已修改，请重新翻译');};
    for(const id of ['repair','mask','direction','fontSize'])$(id).onchange=()=>{rendered='';if(id==='repair' || id==='mask')patches=null;status('选项已修改，请更新预览');controls();};
    const point=e=>{const b=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(canvas.width,(e.clientX-b.left)/b.width*canvas.width)),y:Math.max(0,Math.min(canvas.height,(e.clientY-b.top)/b.height*canvas.height))};};
    svg.onpointerdown=e=>{
      if(busy || !source || e.button!==0)return;e.preventDefault();const p=point(e),index=e.target.getAttribute('data-index');
      if(index!==null){selected=Number(index);drag={start:p,index:selected,old:{...regions[selected]},corner:e.target.getAttribute('data-corner')};}
      else{if(regions.length>=200){status('最多选择 200 框',true);return;}selected=regions.length;regions.push({id:crypto.randomUUID(),x:p.x,y:p.y,width:0,height:0});drag={start:p,index:selected,new:true};}
      svg.setPointerCapture(e.pointerId);paint();
    };
    svg.onpointermove=e=>{
      if(!drag)return;const p=point(e),r=regions[drag.index],o=drag.old;
      if(drag.new){r.x=Math.min(p.x,drag.start.x);r.y=Math.min(p.y,drag.start.y);r.width=Math.abs(p.x-drag.start.x);r.height=Math.abs(p.y-drag.start.y);}
      else if(drag.corner){const anchor={x:drag.corner.endsWith('l')?o.x+o.width:o.x,y:drag.corner.startsWith('t')?o.y+o.height:o.y};r.x=Math.min(p.x,anchor.x);r.y=Math.min(p.y,anchor.y);r.width=Math.abs(p.x-anchor.x);r.height=Math.abs(p.y-anchor.y);}
      else{r.x=Math.max(0,Math.min(canvas.width-r.width,o.x+p.x-drag.start.x));r.y=Math.max(0,Math.min(canvas.height-r.height,o.y+p.y-drag.start.y));}
      paint();
    };
    svg.onpointerup=e=>{
      if(!drag)return;const d=drag,r=regions[d.index];drag=null;svg.releasePointerCapture(e.pointerId);
      const right=Math.round(r.x+r.width),bottom=Math.round(r.y+r.height);r.x=Math.round(r.x);r.y=Math.round(r.y);r.width=right-r.x;r.height=bottom-r.y;
      const overlap=regions.some((o,i)=>i!==d.index && r.x<o.x+o.width && r.x+r.width>o.x && r.y<o.y+o.height && r.y+r.height>o.y);
      if(r.width<2 || r.height<2 || overlap){if(d.new)regions.splice(d.index,1);else regions[d.index]=d.old;selected=-1;paint();rows();status(overlap?'框选不能重叠':'请拖出文字范围',true);return;}
      invalidate();
    };
    svg.onpointercancel=()=>{if(drag){if(drag.new)regions.splice(drag.index,1);else regions[drag.index]=drag.old;drag=null;paint();rows();}};
    async function preview(){
      status($('repair').value==='auto' && !patches?'修复背景（CPU）…':'排版中…');
      const data={image:source,boxes,direction:$('direction').value,repairMode:$('repair').value,maskMode:$('mask').value,fontSize:Number($('fontSize').value)};
      const result=patches && $('repair').value==='auto' ? await call('typeset',{...data,patches}) : await call('render',data);
      rendered=result.image;if(result.patches)patches=result.patches;
      await draw(rendered);status('预览已生成');
    }
    async function perform(task){
      if(busy)return;busy=true;cancelled=false;controls();
      try{await task();}catch(error){if(alive)status(error.message,true);}finally{if(alive){busy=false;controls();}}
    }
    async function recognizeRegions(indices){
      rendered='';patches=null;status('识别选区…');
      const result=await call('ocr',{image:source,regions:indices.map(i=>regions[i]),mode:$('mode').value});
      if(result.boxesWithText.length!==indices.length)throw new Error('部分选区未识别出文字，请调整框选');
      indices.forEach((i,n)=>{boxes[i]={...result.boxesWithText[n],regionId:regions[i].id,translatedText:''};});
      rows();await draw(source);status('识别完成');
    }
    function apply(){
      if(!alive || cancelled || !rendered)throw new Error('回填结果未就绪');
      const data=rendered;
      replaceImage(data);record.history.push(record.current);if(record.history.length>20)record.history.shift();record.current=data;
      finishBatch(data,'已回填，可继续框选');
    }
    $('recognize').onclick=()=>perform(()=>recognizeRegions(regions.map((_,i)=>i)));
    $('translate').onclick=()=>perform(async()=>{
      if($('autoApply').checked && !recognized())await recognizeRegions(regions.map((_,i)=>i).filter(i=>!boxes[i]?.originalText?.trim()));
      if(!recognized())throw new Error('请先识别选区');
      rendered='';status('翻译中…');
      const result=await call('translate',{boxes,targetLanguage:$('target').value});
      boxes=result.boxes;rows();status('翻译完成');
      if($('autoApply').checked){await preview();apply();}
    });
    $('preview').onclick=()=>perform(preview);
    $('apply').onclick=()=>perform(async()=>{if(!translated())throw new Error('请先翻译选区');if(!rendered)await preview();apply();});
    try{
      const cfg=await call('config');$('mode').value=cfg.mode;$('repair').value=cfg.repairMode;$('direction').value=cfg.textDirection;$('autoApply').checked=cfg.autoApply===true;
      if(![...$('target').options].some(o=>o.value===cfg.targetLanguage))$('target').add(new Option(cfg.targetLanguage,cfg.targetLanguage));
      $('target').value=cfg.targetLanguage;
      record.originalData ||= await call('image',{url:record.url});
      source=record.current || record.originalData;await draw(source);
      zoom=Math.min(1,(root.querySelector('.viewport').clientWidth-40)/canvas.width);resize();status('拖框选择文字');controls();$('close').focus();
    }catch(error){if(alive)status(error.message,true);}
  }
})();
