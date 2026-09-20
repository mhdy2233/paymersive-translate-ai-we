'use strict';
const imageTypesetting = (() => {
  const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
  const words=new Intl.Segmenter(undefined,{granularity:'word'});
  const chars=text=>[...segmenter.segment(text)].map(v=>v.segment);
  const closing=/^[、。，．！？：；）】」』》〉〕］｝!?.,:;\)\]\}]/u;
  const opening=/[（【「『《〈〔［｛\(\[\{]$/u;
  function balance(units,widths,capacity,maxLines){
    const n=units.length;if(!n)return [''];
    const prefix=[0];for(const width of widths)prefix.push(prefix.at(-1)+width);
    if(prefix[n]>capacity*maxLines+.01||widths.some(w=>w>capacity+.01))return null;
    const costs=new Float64Array(n+1).fill(Infinity),next=new Int32Array(n+1).fill(-1),counts=new Int32Array(n+1);costs[n]=0;
    for(let i=n-1;i>=0;i--){
      if(!units[i].trim()){costs[i]=costs[i+1];next[i]=i+1;counts[i]=counts[i+1];continue;}
      for(let j=i+1;j<=n;j++){
        const width=prefix[j]-prefix[i];if(width>capacity+.01)break;
        let after=j;while(after<n&&!units[after].trim())after++;
        if((after<n&&closing.test(units[after]))||opening.test(units[j-1]))continue;
        if(!Number.isFinite(costs[after])||counts[after]+1>maxLines)continue;
        const cost=costs[after]+10+((capacity-width)/capacity)**2;
        if(cost<=costs[i]){costs[i]=cost;next[i]=j;counts[i]=counts[after]+1;}
      }
    }
    if(next[0]<0)return null;
    const lines=[];let i=0;
    while(i<n){if(!units[i].trim()){i++;continue;}const end=next[i];if(end<=i)return null;lines.push(units.slice(i,end).join('').trim());i=end;}
    return lines;
  }
  function layout(ctx,text,size,rect,vertical,font,lineHeight=1.25){
    ctx.font=`${size}px ${font}`;
    const pitch=size*lineHeight,advance=size*1.12;
    const capacity=vertical?Math.floor(rect.h/advance):rect.w;
    const limit=vertical?Math.floor(rect.w/pitch):Math.floor(rect.h/pitch);
    if(capacity<=0||limit<1)return null;
    const all=[];
    for(const paragraph of text.split('\n')){
      const units=vertical?chars(paragraph):[...words.segment(paragraph)].flatMap(v=>/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(v.segment)||ctx.measureText(v.segment).width>capacity?chars(v.segment):[v.segment]);
      const widths=units.map(unit=>vertical?1:ctx.measureText(unit).width);
      const wrapped=balance(units,widths,capacity,limit-all.length);if(!wrapped)return null;
      all.push(...wrapped);if(all.length>limit)return null;
    }
    if(!vertical&&all.some(line=>ctx.measureText(line).width>rect.w+.01))return null;
    return vertical?{columns:all.map(chars),pitch,advance,size}:{lines:all,pitch,size};
  }
  function paint(ctx,arranged,rect,vertical,font,foreground,stroke){
    const {size,pitch}=arranged;ctx.font=`${size}px ${font}`;ctx.fillStyle=foreground;ctx.textAlign='left';ctx.textBaseline='alphabetic';
    const rgb=[1,3,5].map(i=>parseInt(foreground.slice(i,i+2),16));
    ctx.strokeStyle=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>140?'#151515':'#ffffff';ctx.lineWidth=stroke*2;ctx.lineJoin='round';
    const at=(value,x,y)=>{const metrics=ctx.measureText(value),left=x-metrics.width/2,baseline=y+(metrics.actualBoundingBoxAscent-metrics.actualBoundingBoxDescent)/2;if(stroke)ctx.strokeText(value,left,baseline);ctx.fillText(value,left,baseline);};
    if(vertical){
      const width=arranged.columns.length*pitch,left=rect.x+(rect.w-width)/2;
      const forms={'（':'︵','）':'︶','「':'﹁','」':'﹂','『':'﹃','』':'﹄','—':'︱','…':'︙','，':'︐','。':'︒','、':'︑','：':'︓','；':'︔','！':'！','？':'？'};
      arranged.columns.forEach((column,i)=>{const top=rect.y+(rect.h-column.length*arranged.advance)/2;column.forEach((char,j)=>at(forms[char]||char,left+width-pitch*(i+.5),top+arranged.advance*(j+.5)));});
    }else{
      const top=rect.y+(rect.h-arranged.lines.length*pitch)/2;
      arranged.lines.forEach((line,i)=>at(line,rect.x+rect.w/2,top+pitch*(i+.5)));
    }
  }
  return {layout,paint};
})();

export {imageTypesetting};
