import {settingsMessage} from './bridge.js';
import {imageTypesetting} from './typesetting.js';

export function encodeBytes(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(Object.values(bytes));
  let binary = '';
  for (let i = 0; i < data.length; i += 32768) binary += String.fromCharCode(...data.subarray(i, i + 32768));
  return btoa(binary);
}

async function bitmap(data) { return createImageBitmap(await (await fetch(data)).blob()); }

export async function repairWithInk(image, boxes, maskMode = 'auto', signal) {
  const cfg = await settingsMessage('config');
  const response = await fetch(cfg.baseUrl + '/v1/images/repair', {
    method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+cfg.token},
    signal:signal ? AbortSignal.any([signal, AbortSignal.timeout(600000)]) : AbortSignal.timeout(600000),
    body:JSON.stringify({image, boxes, mask_mode:maskMode}),
  }).catch(error => { throw new Error(signal?.aborted ? '已取消' : error.name === 'TimeoutError' ? '背景修复超时' : '无法连接背景修复接口'); });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || '背景修复失败');
  return result.patches;
}

export async function renderImage(image, boxes, patches, direction = 'auto', fontSize = 0) {
  if(!Number.isFinite(fontSize) || fontSize<0 || fontSize>160)throw new Error('字号需要为 0–160，0 为自动');
  const source = await bitmap(image);
  const canvas = document.createElement('canvas'); canvas.width=source.width; canvas.height=source.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true}); ctx.drawImage(source,0,0); source.close();
  const font='"Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
  for (let index=0; index<boxes.length; index++) {
    const box=boxes[index], patch=patches?.[index];
    const [x,y,w,h]=patch?.bounds || box.bounding;
    if (![x,y,w,h].every(Number.isFinite) || x<0 || y<0 || w<2 || h<2 || x+w>canvas.width+.01 || y+h>canvas.height+.01) throw new Error('回填坐标无效');
    const text=String(box.translatedText || '').trim();
    if (!text) throw new Error(`第 ${index+1} 框没有译文`);
    let foreground=patch?.foreground || '#000000';
    if (patch) {
      const background=await bitmap(patch.background_png);
      if (background.width!==w || background.height!==h) { background.close(); throw new Error('修复图块尺寸不匹配'); }
      ctx.drawImage(background,x,y); background.close();
    } else {
      const pixels=ctx.getImageData(x,y,w,h).data, colors=new Map();
      for(let p=0;p<pixels.length;p+=4) { const key=[pixels[p],pixels[p+1],pixels[p+2]].map(v=>Math.min(255,Math.round(v/16)*16)); const id=key.join(','); colors.set(id,(colors.get(id)||0)+1); }
      const rgb=[...colors].sort((a,b)=>b[1]-a[1])[0][0].split(',').map(Number);
      ctx.fillStyle=`rgb(${rgb})`;ctx.fillRect(x,y,w,h);
      foreground=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>140?'#151515':'#ffffff';
    }
    const vertical=direction==='vertical' || (direction==='auto' && h>w*1.4 && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text));
    const pad=Math.min(4,Math.max(1,Math.min(w,h)*.04)),rect={x:pad,y:pad,w:w-pad*2,h:h-pad*2};
    let arranged;
    for(let size=fontSize || Math.min(48,Math.floor(Math.min(w,h)));size>=6;size--) {
      arranged=imageTypesetting.layout(ctx,text,size,rect,vertical,font,1.2);
      if(arranged || fontSize)break;
    }
    if(!arranged)throw new Error(`第 ${index+1} 框译文放不下，请扩大框选或缩短译文`);
    const layer=document.createElement('canvas');layer.width=Math.ceil(w*2);layer.height=Math.ceil(h*2);
    const pen=layer.getContext('2d');pen.scale(2,2);
    imageTypesetting.paint(pen,arranged,rect,vertical,font,foreground,0);
    ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.drawImage(layer,x,y,w,h);ctx.restore();
  }
  return canvas.toDataURL('image/png');
}

export async function renderWithInk(data, signal) {
  const cfg=await settingsMessage('config');
  const image=data.image || 'data:image/png;base64,'+encodeBytes(data.bytes);
  const boxes=data.boxes;
  if (!Array.isArray(boxes) || boxes.length>200) throw new Error('回填区域数量无效');
  const mode=data.repairMode || cfg.repairMode || 'auto';
  const patches=mode==='solid' || !boxes.length ? null : await repairWithInk(image,boxes,data.maskMode || 'auto',signal);
  return {image:await renderImage(image,boxes,patches,data.direction || cfg.textDirection || 'auto',data.fontSize || 0),patches,device:mode==='solid'?'Canvas':'CPU'};
}
