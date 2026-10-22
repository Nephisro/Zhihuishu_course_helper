// Browser-level catalog expansion, scoped scrolling and one validated entry click.
(() => {
  'use strict';
  const jobs=new Map();
  let logQueue=Promise.resolve();
  const route=url=>{try{const u=new URL(url);return u.origin+u.pathname;}catch{return 'unknown';}};
  const courseUrl=url=>{try{const u=new URL(url);return u.origin==='https://wisdom-mooc.zhihuishu.com'&&u.pathname.startsWith('/study/');}catch{return false;}};
  const sameCourse=(a,b)=>{try{const x=new URL(a),y=new URL(b);return courseUrl(a)&&courseUrl(b)&&x.searchParams.get('recruitAndCourseId')===y.searchParams.get('recruitAndCourseId');}catch{return false;}};
  function record(event,details={}) {
    logQueue=logQueue.catch(()=>{}).then(async()=>{
      const {zhsSwitchLog=[]}=await chrome.storage.local.get('zhsSwitchLog');
      await chrome.storage.local.set({zhsSwitchLog:[...zhsSwitchLog,{time:new Date().toISOString(),event,...details}].slice(-200)});
    });
    return logQueue;
  }
  function allowed(sender) {return sender.id===chrome.runtime.id&&Number.isInteger(sender.tab?.id)&&courseUrl(sender.url||sender.tab?.url);}
  function snapshot() {
    const shown=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
    const current=[...document.querySelectorAll('.chapter-item.current')];
    const key=e=>JSON.stringify([e.querySelector('.item-num')?.textContent.trim()||'',e.querySelector('.item-name')?.textContent.trim()||'']);
    const v=[...document.querySelectorAll('video')].find(shown);
    return {url:location.href,current:current.length===1?key(current[0]):null,video:v?{src:v.currentSrc,ended:v.ended,ready:v.readyState,time:v.currentTime}:null};
  }
  function clickPoint(payload,classify) {
    const shown=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
    const entries=[...document.querySelectorAll('.chapter-item')].map(item=>{
      const number=item.querySelector('.item-num')?.textContent.trim()||'',title=item.querySelector('.item-name')?.textContent.trim()||'';
      const kind=[item.className,item.getAttribute('data-type'),item.getAttribute('data-content-type')].filter(Boolean).join(' ');
      return {item,key:JSON.stringify([number,title]),kind:classify({number,title,kind}),target:item.querySelector('.item-box')};
    });
    const selected=entries.filter(e=>e.item.classList.contains('current'));
    if(selected.length!==1||selected[0].key!==payload.from)throw new Error('当前课节已变化，取消点击');
    let next;
    if(payload.chapter){
      const chapter=selected[0].item.closest('.el-collapse-item');
      const chapterKey=chapter?JSON.stringify([chapter.querySelector('.chapter-title')?.textContent.trim()||'',chapter.querySelector('.chapter-name')?.textContent.trim()||'']):'';
      const videos=entries.filter(e=>e.kind==='video'&&e.item.closest('.el-collapse-item')===chapter);
      const tests=chapter?[...chapter.querySelectorAll('.test-box')]:[];
      if(chapterKey!==payload.chapter||videos.at(-1)!==selected[0]||tests.length!==1||!/^(?:测试|章节测试|单元测试)$/.test(tests[0].textContent.trim()))throw new Error('无法确认本章末节及测试入口');
      next={item:tests[0],target:tests[0]};
    }else{
      next=entries.slice(entries.indexOf(selected[0])+1).find(e=>e.kind==='video');
      if(!next||next.key!==payload.to||entries.filter(e=>e.key===payload.to).length!==1)throw new Error('下一视频条目已变化或不唯一，取消点击');
    }
    const lesson=next.target;
    if(!lesson||lesson.matches('[disabled],[aria-disabled="true"]')||next.item.getAttribute('aria-disabled')==='true')throw new Error('下一视频不可用');
    if([...document.querySelectorAll('[role="dialog"],.el-dialog')].some(e=>shown(e)&&e.textContent.trim()))throw new Error('存在弹窗，取消切课');
    const v=[...document.querySelectorAll('video')].find(shown);
    if(!v?.ended)throw new Error('当前视频尚未结束，取消切课');
    const chapter=next.item.closest('.el-collapse-item');
    const header=chapter?.querySelector('.el-collapse-item__header');
    let target=lesson,action='lesson',chapterId='';
    if(header?.getAttribute('aria-expanded')==='false') {
      const region=document.getElementById(header.getAttribute('aria-controls')||'');
      if(!region?.contains(next.item)||header.getAttribute('aria-disabled')==='true')throw new Error('无法核对下一视频所属章节，取消展开');
      target=header;action='expand';chapterId=header.id;
    }
    const wrap=next.item.closest('.el-collapse-item__wrap');
    if(action==='lesson'&&wrap&&wrap.clientHeight+1<wrap.scrollHeight&&getComputedStyle(wrap).overflowY==='hidden')return {action:'wait',url:location.href};
    if(!shown(target)) {
      if(action==='lesson'&&header?.getAttribute('aria-expanded')==='true')return {action:'wait',url:location.href};
      throw new Error('目标目录条目未显示，无法准备切课');
    }
    const pane=next.item.closest('.chapter-wrapper');
    const rect=target.getBoundingClientRect();
    const paneRect=pane?.getBoundingClientRect();
    const left=Math.max(0,rect.left??rect.x,paneRect?.left??0),right=Math.min(innerWidth,rect.right??rect.x+rect.width,paneRect?.right??innerWidth);
    const top=Math.max(0,rect.top??rect.y,paneRect?.top??0),bottom=Math.min(innerHeight,rect.bottom??rect.y+rect.height,paneRect?.bottom??innerHeight);
    if(right-left<4||bottom-top<4) {
      if(!pane||!shown(pane)||pane.scrollHeight<=pane.clientHeight||!/auto|scroll/.test(getComputedStyle(pane).overflowY))throw new Error('目标不在可见区域且未找到可滚动的左侧目录');
      const px=Math.max(0,paneRect.left),pr=Math.min(innerWidth,paneRect.right),pt=Math.max(0,paneRect.top),pb=Math.min(innerHeight,paneRect.bottom);
      if(pr-px<20||pb-pt<20)throw new Error('左侧目录本身不在可见区域');
      const x=(px+pr)/2,y=(pt+pb)/2,hit=document.elementFromPoint(x,y);
      if(!hit||!(hit===pane||pane.contains(hit)))throw new Error('左侧目录被遮挡，取消滚动');
      const difference=(rect.top+rect.bottom-pt-pb)/2;
      return {action:'scroll',x,y,deltaY:Math.sign(difference)*Math.min(600,Math.max(80,Math.abs(difference))),scrollTop:pane.scrollTop,paneId:pane.className,url:location.href};
    }
    const x=(left+right)/2,y=(top+bottom)/2;
    const hit=document.elementFromPoint(x,y);
    if(!hit||!(hit===target||target.contains(hit)))throw new Error('目标课节被遮挡，取消点击');
    return {action,x,y,chapterId,src:v.currentSrc,url:location.href};
  }
  async function read(target,expression) {
    const result=await chrome.debugger.sendCommand(target,'Runtime.evaluate',{expression,returnByValue:true});
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description?.split('\n')[0]||'无法读取课程状态');
    if(!result.result||!('value' in result.result))throw new Error('课程状态读取失败');
    return result.result.value;
  }
  async function switchVideo(payload,sender) {
    const tabId=sender.tab.id,originUrl=sender.url||sender.tab.url,target={tabId};
    const opening=payload.type==='zhsOpenChapterTest',destination=opening?payload.chapter:payload.to;
    if(typeof payload.from!=='string'||typeof destination!=='string'||!destination||payload.from.length>800||destination.length>800)throw new Error('课节参数无效');
    if(jobs.has(tabId))throw new Error('此标签页已有切课请求，不重复点击');
    const job={cancelled:false};jobs.set(tabId,job);let attached=false,flow=null;
    const check=()=>{if(job.cancelled)throw new Error('切课已由用户停止');};
    try {
      await record(opening?'chapter_test_requested':'switch_requested',{from:payload.from,...(opening?{chapter:payload.chapter}:{to:payload.to})});
      try{await chrome.debugger.attach(target,'1.3');attached=true;}catch{throw new Error('无法连接浏览器输入：请关闭此标签页开发者工具或结束其他浏览器控制任务，并确认已批准新版 debugger 权限');}
      await chrome.debugger.sendCommand(target,'Page.enable');check();
      const before=await read(target,`(${snapshot.toString()})()`);
      if(!sameCourse(before.url,originUrl))throw new Error('已离开原课程，取消切课');
      const expression=`(()=>{const normalize=${globalThis.ZhsCourseCore.normalize.toString()};const classify=${globalThis.ZhsCourseCore.catalogKind.toString()};return (${clickPoint.toString()})(${JSON.stringify({from:payload.from,...(opening?{chapter:payload.chapter}:{to:payload.to})})},classify);})()`;
      let point=null,scrollSteps=0,lastScroll=null,stalledScroll=0;
      const expanded=new Map(),prepareUntil=Date.now()+20000;
      while(Date.now()<prepareUntil) {
        check();const plan=await read(target,expression);
        if(!sameCourse(plan.url,originUrl))throw new Error('准备目录时已离开原课程');
        if(plan.action==='lesson'){point=plan;break;}
        if(plan.action==='scroll') {
          if(++scrollSteps>24)throw new Error('目录滚动达到次数上限，已停止');
          if(lastScroll!==null&&Math.abs(lastScroll-plan.scrollTop)<1)stalledScroll++;else stalledScroll=0;
          if(stalledScroll>=3)throw new Error('左侧目录滚动没有进展，已停止');
          lastScroll=plan.scrollTop;
          await record('catalog_scroll',{to:payload.to,deltaY:plan.deltaY});
          await chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type:'mouseMoved',x:plan.x,y:plan.y,buttons:0});check();
          await chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type:'mouseWheel',x:plan.x,y:plan.y,deltaX:0,deltaY:plan.deltaY,buttons:0});
        } else if(plan.action==='expand') {
          if(!plan.chapterId)throw new Error('待展开章节没有唯一标识');
          if(expanded.has(plan.chapterId)) {
            if(Date.now()-expanded.get(plan.chapterId)>4000)throw new Error('章节展开没有生效，已停止，不反复点击');
          } else {
            expanded.set(plan.chapterId,Date.now());
            await record('chapter_expand',{to:payload.to,chapter:plan.chapterId});
            await chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type:'mouseMoved',x:plan.x,y:plan.y,buttons:0});check();
            await chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type:'mousePressed',x:plan.x,y:plan.y,button:'left',buttons:1,clickCount:1});
            await chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type:'mouseReleased',x:plan.x,y:plan.y,button:'left',buttons:0,clickCount:1});
          }
        } else if(plan.action!=='wait')throw new Error('未知的目录准备动作');
        await new Promise(resolve=>setTimeout(resolve,300));
      }
      if(!point)throw new Error('20 秒内未能完成目录展开与定位，已停止');
      check();if(!sameCourse(point.url,originUrl))throw new Error('点击前课程地址已变化');
      if(opening){
        flow=await globalThis.ZhsChapterFlow.arm({sourceTabId:tabId,sourceUrl:originUrl,from:payload.from,chapter:payload.chapter});
        check();if(flow.alreadyCompleted)return {ok:true,alreadyCompleted:true,chapter:payload.chapter};
      }
      await record('input_dispatch',{from:payload.from,to:payload.to});
      await chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y,buttons:0});check();
      await chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',buttons:1,clickCount:1});
      // Always release the button once a press was sent, even when Stop arrives during it.
      await chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',buttons:0,clickCount:1});check();
      const until=Date.now()+20000;
      while(Date.now()<until) {
        check();
        const state=await read(target,`(${snapshot.toString()})()`);
        if(!sameCourse(state.url,originUrl)){await record('navigation_away',{route:route(state.url)});throw new Error('浏览器点击后离开课程页，已停止；请查看切课日志');}
        if(opening){
          if(state.current!==payload.from)throw new Error('打开测试时原课节已变化，请人工核对');
          const current=await globalThis.ZhsChapterFlow.state(tabId,flow.id);
          if(current.phase==='failed')throw new Error(current.error);
          if(['active','returning','done'].includes(current.phase)){await record('chapter_test_opened',{chapter:payload.chapter});return {ok:true,id:flow.id,chapter:payload.chapter};}
          await new Promise(resolve=>setTimeout(resolve,500));continue;
        }
        if(state.current===payload.to&&state.video&&!state.video.ended&&state.video.ready>=1&&state.video.src&&state.video.src!==point.src){await record('switch_confirmed',{to:payload.to});return {ok:true,target:payload.to};}
        if(state.current&&state.current!==payload.from&&state.current!==payload.to)throw new Error('切到了非预期课节，已停止');
        await new Promise(resolve=>setTimeout(resolve,500));
      }
      throw new Error('20 秒内未确认目标课节及新视频源；不会重复点击');
    } catch(error) {
      if(flow?.id)await globalThis.ZhsChapterFlow.cancel(tabId,error.message);
      if(attached){try{const tree=await chrome.debugger.sendCommand(target,'Page.getFrameTree');const url=tree.frameTree?.frame?.url;if(url&&!sameCourse(url,originUrl))await record('navigation_away',{route:route(url)});}catch{}}
      await record('switch_failed',{error:error.message});throw error;
    }
    finally {if(attached){try{await chrome.debugger.detach(target);}catch{}}jobs.delete(tabId);}
  }
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(!allowed(sender))return false;
    if(message?.type==='zhsCancelNext'){const job=jobs.get(sender.tab.id);if(job)job.cancelled=true;void globalThis.ZhsChapterFlow?.cancel(sender.tab.id).catch(()=>{});reply({ok:true});return false;}
    if(!['zhsNextVideo','zhsOpenChapterTest'].includes(message?.type))return false;
    switchVideo(message,sender).then(reply).catch(error=>reply({ok:false,error:error.message}));return true;
  });
})();
