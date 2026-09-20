import {recognizeWithInk, translateWithInk} from './bridge.js';
import {renderWithInk, renderImage} from './render.js';

const controllers=new Map();
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if (!message?.inkOffscreen || sender.id!==chrome.runtime.id) return;
  const {method,data,id}=message.inkOffscreen;
  if (method==='cancel') { controllers.get(id)?.abort(); respond({value:true}); return; }
  const controller=new AbortController(); controllers.set(id,controller);
  (async()=>{
    if(method==='ocr') {
      const bytes=await (await fetch(data.image)).arrayBuffer();
      const result=await recognizeWithInk('image/png',bytes,()=>{},controller.signal,{regions:data.regions,mode:data.mode});
      if(result.empty_regions?.length)throw new Error(`第 ${result.empty_regions.join('、')} 框未识别出文字，请调整范围`);
      return result;
    }
    if(method==='translate') {
      const result=await translateWithInk(data,controller.signal);
      if(!result.enabled)throw new Error('请在“漫画/图片”设置中启用墨识翻译服务');
      return result;
    }
    if(method==='render')return renderWithInk(data,controller.signal);
    if(method==='typeset')return {image:await renderImage(data.image,data.boxes,data.patches,data.direction,data.fontSize || 0)};
    throw new Error('未知框选操作');
  })().then(value=>respond({value}),error=>respond({error:error.message})).finally(()=>controllers.delete(id));
  return true;
});
