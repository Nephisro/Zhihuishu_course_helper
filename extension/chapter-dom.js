(function(root){
  'use strict';
  function rendered(element,style=getComputedStyle){
    if(!element?.getClientRects().length)return false;
    for(let e=element;e;e=e.parentElement){const css=style(e);if(css.display==='none'||css.visibility==='hidden'||css.visibility==='collapse'||Number(css.opacity)===0)return false;}
    return true;
  }
  function visibleOverlay(element,{style=getComputedStyle,width=innerWidth,height=innerHeight,hit=(x,y)=>document.elementFromPoint(x,y)}={}){
    if(!rendered(element,style))return false;
    const r=element.getBoundingClientRect();
    const left=Math.max(0,r.left),right=Math.min(width,r.right),top=Math.max(0,r.top),bottom=Math.min(height,r.bottom);
    if(right-left<2||bottom-top<2)return false;
    const target=hit((left+right)/2,(top+bottom)/2);
    return !!target&&(target===element||element.contains(target));
  }
  function readContent(element,{shadow=e=>root.chrome?.dom?.openOrClosedShadowRoot(e)||e.shadowRoot,visible=e=>rendered(e)}={}){
    let count=0,hasMedia=false;
    function walk(node,depth=0){
      if(++count>3000||depth>50)throw new Error('题目结构过大，等待人工处理');
      if(node.nodeType===3)return node.textContent||'';
      if(node.nodeType===1){
        if(/^(SCRIPT|STYLE|NOSCRIPT)$/.test(node.tagName)||!visible(node))return '';
        if(/^(IMG|CANVAS|SVG|MATH|VIDEO|AUDIO)$/.test(node.tagName))hasMedia=true;
        const closed=shadow(node);
        if(closed)return walk(closed,depth+1);
      }
      return [...(node.childNodes||[])].map(child=>walk(child,depth+1)).join(' ');
    }
    return {text:element?walk(element).replace(/\s+/g,' ').trim():'',hasMedia};
  }
  const api={rendered,visibleOverlay,readContent};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ZhsChapterDom=api;
})(globalThis);
