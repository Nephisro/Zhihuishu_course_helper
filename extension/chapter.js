(() => {
  'use strict';
  if(!location.hash.startsWith('#/webExamList/dohomework/')||document.getElementById('zhs-chapter-helper'))return;
  const {rendered,visibleOverlay,readContent}=globalThis.ZhsChapterDom;
  const shown=e=>rendered(e);
  const query=(selector,scope=document)=>[...scope.querySelectorAll(selector)];
  const enabled=e=>shown(e)&&!e.disabled&&e.getAttribute('aria-disabled')!=='true';
  const own=document.createElement('div');own.id='zhs-chapter-helper';
  own.style.cssText='position:fixed;right:18px;bottom:18px;z-index:2147483647';
  const ui=own.attachShadow({mode:'open'});
  ui.innerHTML=`<style>:host{font:14px/1.5 system-ui;color:#e8edf7}section{box-sizing:border-box;width:300px;padding:16px;background:#182333;border:1px solid #44546c;border-radius:14px}h3{margin:0 0 8px}p{white-space:pre-wrap;max-height:140px;overflow:auto}button{padding:7px 10px;margin:4px 4px 4px 0;border:0;border-radius:6px;cursor:pointer}label{display:block;margin:8px 0}small{display:block;color:#c3d1e4}</style><section><h3>章节测试助手</h3><p id="status" role="status">正在读取设置</p><button id="toggle" type="button">开始自动作答并提交</button><button id="api" type="button">API 设置</button><button id="inspect" type="button">查看读取状态</button><label><input id="autoQuiz" type="checkbox" checked> 使用本地题库</label><label><input id="autoApi" type="checkbox"> 新题调用 API</label><label><input id="autoSubmit" type="checkbox" checked> 全部保存后自动提交作业</label><small>从第 1 题启动；题库在课程面板保存。未知题型、已有不同答案和保存失败时暂停；验证码需人工完成。</small></section>`;
  document.documentElement.append(own);
  for(const name of ['click','dblclick','pointerdown','pointerup','keydown','keyup'])own.addEventListener(name,event=>event.stopPropagation());
  const $=id=>ui.getElementById(id);
  let config=null,ready=false,autoStarted=false;
  const syncSettings=()=>{for(const id of ['autoQuiz','autoApi'])$(id).checked=!!config[id];};
  const status=text=>{$('status').textContent=text;$('toggle').textContent=runner.running?'停止章节助手':'启动 / 继续章节助手';};
  function button(text,scope=document){
    const found=query('button',scope).filter(e=>enabled(e)&&e.textContent.trim()===text);
    if(found.length!==1)throw new Error(`无法唯一确认“${text}”按钮`);
    return found[0];
  }
  function read(){
    const title=document.querySelector('h1')?.innerText.trim()||'';
    const subjects=query('.examPaper_subject').filter(shown);
    const subject=subjects.length===1?subjects[0]:null;
    const stem=subject?.querySelector('.subject_describe');
    const stemContent=readContent(stem),text=stemContent.text;
    const typeLabel=subject?.querySelector('.subject_type')?.innerText||'';
    const type=/多选题/.test(typeLabel)?'multiple':/单选题/.test(typeLabel)?'single':/判断题/.test(typeLabel)?'boolean':'unsupported';
    const nodes=subject?query('.subject_node .nodeLab',subject):[];
    const contents=nodes.map(e=>readContent(e.querySelector('.examquestions-answer')));
    const options=contents.map(e=>e.text);
    const selected=nodes.flatMap((e,i)=>e.querySelector('input')?.checked?[i]:[]);
    const cards=query('.answerCard_list li');
    const metadata=query('li').filter(e=>e.querySelector('label')?.textContent.trim()==='题目数');
    const total=metadata.length===1?Number(metadata[0].querySelector('span')?.textContent.trim()):NaN;
    const validCards=cards.length===total&&cards.every((e,i)=>Number(e.textContent.trim())===i+1);
    const messages=query('.el-message').filter(shown);
    const saved=messages.find(e=>/(?:暂存|保存).*成功|成功.*(?:暂存|保存)/.test(e.innerText));
    const dialogs=query('.el-dialog,.el-message-box').filter(shown);
    const dialog=dialogs[0];
    const confirmations=dialog?query('button',dialog).filter(e=>enabled(e)&&/^(确定|确认|确认提交|确定提交|提交作业)$/.test(e.textContent.trim())):[];
    return {
      examKey:location.origin+location.pathname+location.hash,title,total:validCards?total:NaN,
      progress:Number((document.querySelector('.percentage_tit em')?.textContent||'').replace('%','').trim()),
      savedNotice:saved?`${saved.id}:${saved.innerText.trim()}`:'',
      submitted:messages.some(e=>/(?:提交|交卷)成功|作业已提交/.test(e.innerText))||dialogs.some(e=>/(?:提交|交卷)成功/.test(e.innerText)),
      captcha:query('iframe').some(e=>/captcha/i.test(e.id+' '+e.getAttribute('src'))&&visibleOverlay(e)),
      dialog:dialog?{text:dialog.innerText,confirmable:dialogs.length===1&&confirmations.length===1}:null,
      question:subject?{
        id:subject.querySelector('.subject_num span')?.id||'',number:parseInt(subject.querySelector('.subject_num')?.innerText,10),
        type,question:text,options,selected,
        unsupportedMedia:stemContent.hasMedia||contents.some(e=>e.hasMedia)||/[\uE000-\uF8FF]/.test(text+options.join('')),
      }:null,
    };
  }
  const page={read,
    select(indices){
      const before=read().question;
      for(const index of indices){
        const current=read();
        if(current.captcha||current.dialog||!current.question||JSON.stringify([current.question.id,current.question.question,current.question.options])!==JSON.stringify([before.id,before.question,before.options]))throw new Error('选择前题目或页面状态变化');
        const subject=query('.examPaper_subject').filter(shown)[0];
        const option=query('.subject_node .nodeLab',subject)[index];
        if(!option||!shown(option))throw new Error('选项不可见');
        (option.querySelector('.label')||option).click();
      }
    },
    next(){button('下一题').click();},save(){button('暂存作业').click();},submit(){button('提交作业').click();},
    confirm(){
      const s=read();
      if(s.captcha||!s.dialog?.confirmable||!globalThis.ZhsChapterEngine.submissionPrompt(s.dialog.text))throw new Error('交卷确认提示已变化');
      const dialog=query('.el-dialog,.el-message-box').filter(shown)[0];
      query('button',dialog).find(e=>enabled(e)&&/^(确定|确认|确认提交|确定提交|提交作业)$/.test(e.textContent.trim())).click();
    },
  };
  const runner=globalThis.ZhsChapterEngine.createRunner({page,status,solve:questions=>chrome.runtime.sendMessage({type:'zhsChapterSolve',questions})});
  function maybeAutoStart(){
    if(ready&&config.autoChapter&&!autoStarted&&globalThis.ZhsChapterEngine.isChapter(document.querySelector('h1')?.innerText.trim()||'')){
      autoStarted=true;runner.start({...config,autoSubmit:$('autoSubmit').checked});
    }
  }
  $('toggle').onclick=()=>{
    if(!ready){status('正在读取设置，请稍候');return;}
    autoStarted=true;
    if(runner.running)runner.stop('章节测试助手已停止，保留已有答案');
    else {runner.start({...config,autoSubmit:$('autoSubmit').checked});void runner.tick();}
  };
  $('autoSubmit').onchange=()=>{if(runner.running)runner.stop('交卷设置已更改，请点击继续应用新设置');};
  $('api').onclick=()=>chrome.runtime.sendMessage({type:'zhsOpenApi'}).catch(e=>status(e.message));
  $('inspect').onclick=()=>{
    try{const s=read(),q=s.question;status(`测试：${s.title}\n题号：${q?.number||'?'} / ${s.total||'?'}\n题干：${q?.question||'尚未读取'}\n选项：${q?.options.length||0}，已选：${q?.selected.length||0}\n可见验证码：${s.captcha?'有':'无'}`);}catch(e){status(`读取失败：${e.message}`);}
  };
  for(const id of ['autoQuiz','autoApi'])$(id).onchange=async()=>{
    if(!ready)return;
    runner.stop('答题来源已更改，请点击继续');config[id]=$(id).checked;
    try{await chrome.storage.local.set({zhsCourseHelper:config});}catch(e){status(`保存设置失败：${e.message}`);}
  };
  chrome.storage.local.get('zhsCourseHelper').then(data=>{
    config={autoQuiz:true,autoApi:false,autoChapter:false,bank:[],...data.zhsCourseHelper};
    config.bank=globalThis.ZhsCourseCore.validateBank(config.bank);ready=true;syncSettings();
    status('就绪：可从第 1 题开始自动作答并提交');
    maybeAutoStart();void runner.tick();
  }).catch(e=>status(`读取设置失败：${e.message}`));
  chrome.storage.onChanged?.addListener((changes,area)=>{
    if(area!=='local'||!changes.zhsCourseHelper)return;
    runner.stop('题库或答题设置已变化，请点击继续');
    try{config={...config,...changes.zhsCourseHelper.newValue};config.bank=globalThis.ZhsCourseCore.validateBank(config.bank);syncSettings();}catch(e){ready=false;status(e.message);}
  });
  const timer=setInterval(()=>{maybeAutoStart();void runner.tick();},1000);
  window.addEventListener('pagehide',()=>{clearInterval(timer);runner.stop('页面已关闭，章节助手停止');},{once:true});
})();
