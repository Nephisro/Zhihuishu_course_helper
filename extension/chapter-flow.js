// Own only test tabs created by an armed course-directory click.
(() => {
  'use strict';
  const key='zhsChapterFlows';
  const course=url=>{try{const u=new URL(url);return u.origin==='https://wisdom-mooc.zhihuishu.com'&&u.pathname.startsWith('/study/')&&u.searchParams.get('recruitAndCourseId')?u.href:null;}catch{return null;}};
  const exam=url=>{try{const u=new URL(url);return u.origin==='https://onlineexamh5new.zhihuishu.com'&&u.pathname==='/stuExamWeb.html'&&u.hash.startsWith('#/webExamList/dohomework/');}catch{return false;}};
  const trusted=sender=>sender.id===chrome.runtime.id&&Number.isInteger(sender.tab?.id)&&(sender.frameId===undefined||sender.frameId===0);
  let queue=Promise.resolve();
  function transaction(fn){
    const task=queue.then(async()=>{
      const data=(await chrome.storage.session.get(key))[key]||{jobs:{},completed:{}};
      const result=await fn(data);await chrome.storage.session.set({[key]:data});return result;
    });
    queue=task.catch(()=>{});return task;
  }
  function fail(job,error){job.phase='failed';job.error=error;}
  function finish(data,job){
    job.phase='done';
    const list=data.completed[job.sourceUrl]||[];
    data.completed[job.sourceUrl]=[...new Set([...list,job.chapter])].slice(-200);
  }
  async function cancel(sourceTabId,message='章节测试衔接已停止'){
    const child=await transaction(data=>{
      const job=data.jobs[sourceTabId];if(!job||['done','failed'].includes(job.phase))return null;
      fail(job,message);return job.childTabId;
    });
    if(Number.isInteger(child))await chrome.tabs.sendMessage(child,{type:'zhsChapterFlowCancelled'},{frameId:0}).catch(()=>{});
  }
  async function arm({sourceTabId,sourceUrl,from,chapter}){
    if(!course(sourceUrl))throw new Error('无法确认原课程地址');
    const tab=await chrome.tabs.get(sourceTabId);
    if(tab.url!==sourceUrl)throw new Error('原课程页面已变化');
    return transaction(data=>{
      if(data.completed[sourceUrl]?.includes(chapter))return {alreadyCompleted:true};
      const prior=data.jobs[sourceTabId];
      if(prior&&!['done','failed'].includes(prior.phase))throw new Error('已有章节测试正在处理');
      const id=crypto.randomUUID();
      data.jobs[sourceTabId]={id,sourceTabId,sourceUrl,from,chapter,phase:'opening',childTabId:null,openUntil:Date.now()+30000};
      return {id};
    });
  }
  async function state(sourceTabId,id){
    return transaction(data=>{
      const job=data.jobs[sourceTabId];
      if(!job||job.id!==id)throw new Error('章节测试衔接记录已失效');
      if(job.phase==='opening'&&Date.now()>job.openUntil)fail(job,'未确认新打开的章节测试页，请人工检查弹窗或登录状态');
      if(job.phase==='returning'&&Date.now()>job.returnUntil)fail(job,'返回课程超时，请人工核对测试页');
      return {...job};
    });
  }
  async function targetCreated(details){
    if(details.sourceFrameId!==0)return;
    await transaction(data=>{
      const job=data.jobs[details.sourceTabId];
      if(!job||!['opening','active'].includes(job.phase)||Date.now()>job.openUntil)return;
      if(Number.isInteger(job.childTabId)&&job.childTabId!==details.tabId){fail(job,'同时打开了多个标签页，无法确认章节测试');return;}
      job.childTabId=details.tabId;
    });
  }
  async function claim(sender,title){
    if(!exam(sender.url)||!globalThis.ZhsChapterEngine.isChapter(title))return {ok:true,managed:false};
    return transaction(async data=>{
      const job=Object.values(data.jobs).find(j=>j.childTabId===sender.tab.id&&['opening','active'].includes(j.phase));
      if(!job)return {ok:true,managed:false};
      if(job.phase==='opening'&&Date.now()>job.openUntil){fail(job,'章节测试打开超时，请人工处理');return {ok:true,managed:false};}
      const [parent,child]=await Promise.all([chrome.tabs.get(job.sourceTabId),chrome.tabs.get(sender.tab.id)]);
      if(parent.url!==job.sourceUrl||child.url!==sender.url)throw new Error('课程或测试页面已变化');
      if(job.examUrl&&job.examUrl!==sender.url)throw new Error('章节测试地址已变化');
      job.examUrl=sender.url;job.phase='active';
      return {ok:true,managed:true,id:job.id};
    });
  }
  async function complete(sender,id){
    const job=await transaction(async data=>{
      const current=Object.values(data.jobs).find(j=>j.id===id&&j.childTabId===sender.tab.id);
      if(!current||current.phase!=='active'||current.examUrl!==sender.url)throw new Error('当前测试不属于自动衔接任务，保留标签页');
      const [parent,child]=await Promise.all([chrome.tabs.get(current.sourceTabId),chrome.tabs.get(current.childTabId)]);
      if(parent.url!==current.sourceUrl||child.url!==current.examUrl)throw new Error('原课程或测试页面已变化，保留标签页');
      const ready=await chrome.tabs.sendMessage(current.sourceTabId,{type:'zhsChapterFlowCanReturn',id,from:current.from,chapter:current.chapter,sourceUrl:current.sourceUrl},{frameId:0});
      if(!ready?.ok)throw new Error('原课程助手已停止或课节已变化，保留测试页');
      current.phase='returning';current.returnUntil=Date.now()+30000;return {...current,windowId:parent.windowId};
    });
    try{
      const check=async()=>{if((await state(job.sourceTabId,id)).phase!=='returning')throw new Error('课程衔接已停止，保留测试页');};
      await check();
      await chrome.tabs.update(job.sourceTabId,{active:true});
      await check();
      await chrome.windows.update(job.windowId,{focused:true});
      await check();
      await chrome.tabs.remove(job.childTabId);
      await transaction(data=>{const current=data.jobs[job.sourceTabId];if(current?.id===id&&current.phase==='returning')finish(data,current);});
      return {ok:true};
    }catch(error){await cancel(job.sourceTabId,'测试已提交，但未能自动返回，请人工检查');throw error;}
  }
  chrome.webNavigation.onCreatedNavigationTarget.addListener(details=>{void targetCreated(details).catch(()=>{});});
  chrome.tabs.onRemoved.addListener(tabId=>{
    void transaction(data=>{
      const stopped=[];
      for(const job of Object.values(data.jobs)){
        if(['done','failed'].includes(job.phase))continue;
        if(job.sourceTabId===tabId){fail(job,'原课程标签页已关闭');if(Number.isInteger(job.childTabId))stopped.push(job.childTabId);}
        else if(job.childTabId===tabId){
          if(job.phase==='returning')finish(data,job);
          else fail(job,'章节测试页在提交成功前被关闭，请人工核对');
        }
      }
      return stopped;
    }).then(stopped=>Promise.all(stopped.map(id=>chrome.tabs.sendMessage(id,{type:'zhsChapterFlowCancelled'},{frameId:0}).catch(()=>{})))).catch(()=>{});
  });
  chrome.tabs.onUpdated.addListener((tabId,change)=>{
    if(!change.url)return;
    void transaction(data=>{
      const stopped=[];
      for(const job of Object.values(data.jobs)){
        if(['done','failed'].includes(job.phase))continue;
        if(job.sourceTabId===tabId&&change.url!==job.sourceUrl){fail(job,'原课程地址已变化');if(Number.isInteger(job.childTabId))stopped.push(job.childTabId);}
        if(job.childTabId===tabId&&job.examUrl&&change.url!==job.examUrl)fail(job,'章节测试地址已变化，请人工核对');
      }
      return stopped;
    }).then(stopped=>Promise.all(stopped.map(id=>chrome.tabs.sendMessage(id,{type:'zhsChapterFlowCancelled'},{frameId:0}).catch(()=>{})))).catch(()=>{});
  });
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(!trusted(sender))return false;
    let task;
    if(message?.type==='zhsChapterFlowClaim'&&exam(sender.url))task=claim(sender,message.title);
    else if(message?.type==='zhsChapterFlowComplete'&&exam(sender.url)&&typeof message.id==='string')task=complete(sender,message.id);
    else if(message?.type==='zhsChapterFlowStatus'&&course(sender.url)&&typeof message.id==='string'){
      task=state(sender.tab.id,message.id).then(job=>{
        if(job.sourceUrl!==sender.url)throw new Error('原课程地址已变化');
        return {ok:true,phase:job.phase,error:job.error,chapter:job.chapter};
      });
    }else return false;
    task.then(reply).catch(async error=>{
      if(message.type==='zhsChapterFlowComplete'){
        await transaction(data=>{
          const job=Object.values(data.jobs).find(j=>j.id===message.id&&j.childTabId===sender.tab.id);
          if(job&&job.phase!=='done')fail(job,error.message);
        }).catch(()=>{});
      }
      reply({ok:false,error:error.message});
    });return true;
  });
  globalThis.ZhsChapterFlow={arm,state,cancel};
})();
