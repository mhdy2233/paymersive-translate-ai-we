/* Local Ink OCR integration. Loaded before the vendor background bundle. */
(() => {
  let offscreenCreating;
  globalThis.inkEnsureOffscreen = async () => {
    if (offscreenCreating) return offscreenCreating;
    offscreenCreating=(async()=>{
      if ((await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']})).length) return true;
      await chrome.offscreen.createDocument({url:'offscreen.html',reasons:['WORKERS','BLOBS'],justification:'Ink OCR image processing'});
      return true;
    })();
    try { return await offscreenCreating; } finally { offscreenCreating=null; }
  };
  const defaultsPromise = fetch(chrome.runtime.getURL('ink/defaults.json')).then(r => r.json());
  async function config() {
    const saved = await chrome.storage.local.get('inkOCR');
    return {...await defaultsPromise, ...saved.inkOCR};
  }
  function validate(value) {
    const url = new URL(value.baseUrl);
    const host=url.hostname;
    const ip=/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || (host.startsWith('[') && host.endsWith(']'));
    if (url.protocol !== 'http:' || !(host==='localhost' || ip) || ['0.0.0.0','[::]'].includes(host) ||
        url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('请填写 http://IP地址:端口；也支持 localhost 和 [IPv6]');
    }
    if (!['balanced', 'npu', 'accurate', 'wechat', 'manga'].includes(value.mode)) throw new Error('未知识别模式');
    if (typeof value.token !== 'string' || value.token.length < 32) throw new Error('请填写本地接口令牌');
    if (!['auto','solid'].includes(value.repairMode || 'auto') || !['auto','horizontal','vertical'].includes(value.textDirection || 'auto')) throw new Error('回填选项无效');
    return {...value, baseUrl: url.origin, translateWithInk: !!value.translateWithInk,
      repairMode:value.repairMode || 'auto', textDirection:value.textDirection || 'auto'};
  }
  async function request(path, body, cfg, timeout = 180000) {
    let response;
    try {
      response = await fetch(cfg.baseUrl + path, {
        method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(timeout),
        headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.token},
        ...(body ? {body: JSON.stringify(body)} : {}),
      });
    } catch (error) {
      throw new Error(error.name === 'TimeoutError' ? '墨识接口响应超时' : '无法连接墨识，请先启动“浏览器 OCR 服务”');
    }
    const value = await response.json();
    if (!response.ok) throw new Error(value.error?.message || `墨识 HTTP ${response.status}`);
    return value;
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message?.inkOCR || sender.id !== chrome.runtime.id) return;
    const {method, data} = message.inkOCR;
    // Configuration and health are extension-page-only. Never disclose the token to a webpage/content script.
    const ownPage = sender.url?.startsWith(chrome.runtime.getURL(''));
    if (!ownPage) { sendResponse({error: '仅扩展页面可访问配对设置'}); return; }
    (async () => {
      if (method === 'config') return await config();
      if (method === 'save') {
        const value = validate(data); await chrome.storage.local.set({inkOCR: value}); return value;
      }
      if (method === 'health') return await request('/v1/engines', null, await config(), 5000);
      throw new Error('未知墨识操作');
    })().then(value => sendResponse({value}), error => sendResponse({error: error.message}));
    return true;
  });

  const menuId='ink-select-translate';
  const installMenu=()=>chrome.contextMenus.create({id:menuId,title:'框选翻译 · 墨识',contexts:['image']},()=>void chrome.runtime.lastError);
  chrome.runtime.onInstalled.addListener(()=>setTimeout(installMenu,1000));
  chrome.runtime.onStartup.addListener(installMenu);
  chrome.contextMenus.onClicked.addListener((info,tab)=>{
    if(info.menuItemId!==menuId || !tab?.id)return;
    chrome.tabs.sendMessage(tab.id,{inkSelectImage:info.srcUrl},{frameId:info.frameId || 0}).catch(()=>{});
  });
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(!message?.inkEditor || sender.id!==chrome.runtime.id || !sender.tab)return;
    const {method,data,id}=message.inkEditor;
    (async()=>{
      if(method==='config') {
        const cfg=await config();
        const stored=await chrome.storage.local.get(['fullLocalUserConfig','inkEditorPreferences']);
        return {mode:cfg.mode,repairMode:cfg.repairMode || 'auto',textDirection:cfg.textDirection || 'auto',
          targetLanguage:stored.fullLocalUserConfig?.targetLanguage || 'zh-CN',autoApply:stored.inkEditorPreferences?.autoApply===true};
      }
      if(method==='preferences') {
        if(typeof data?.autoApply!=='boolean')throw new Error('框选设置无效');
        await chrome.storage.local.set({inkEditorPreferences:{autoApply:data.autoApply}});
        return {autoApply:data.autoApply};
      }
      if(method==='image') {
        const url=new URL(data.url);
        if(!['http:','https:','data:','file:'].includes(url.protocol))throw new Error('此图片地址暂不支持框选');
        const response=await fetch(url.href,{credentials:'include',signal:AbortSignal.timeout(25000)});
        if(!response.ok)throw new Error('读取图片失败，请刷新页面后重试');
        const blob=await response.blob();
        if(blob.size>24*1024*1024 || !blob.type.startsWith('image/'))throw new Error('图片格式不支持或超过 24 MiB');
        const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
        for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
        return 'data:'+blob.type+';base64,'+btoa(binary);
      }
      if(!['ocr','translate','render','typeset','cancel'].includes(method))throw new Error('未知框选操作');
      await globalThis.inkEnsureOffscreen();
      const reply=await chrome.runtime.sendMessage({inkOffscreen:{method,data,id:sender.tab.id+':'+sender.frameId+':'+id}});
      if(!reply || reply.error)throw new Error(reply?.error || '图片处理未响应');
      return reply.value;
    })().then(value=>respond({value}),error=>respond({error:error.message}));
    return true;
  });
})();
