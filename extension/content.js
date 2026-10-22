(() => {
  'use strict';
  if (document.getElementById('zhs-course-helper')) return;
  const {validateBank, matchQuestion, catalogKind} = globalThis.ZhsCourseCore;
  const defaults = {autoQuiz: true, autoNext: false, autoApi: false, autoChapter: false, autoChapterFlow:false, bank: []};
  const END_WAIT_MS = 3000;
  let config = {...defaults}, running = false, busy = false, currentVideo = null, ready = false;
  let resumeAfterQuiz = false, switchAt = 0, observedQuiz = false;
  let waitForSwitch = false, switchedFrom = null, switchTarget = null, lastScan = 0, endedSince = 0;
  const attempts = new WeakMap(), seenQuizzes = new WeakSet();
  const apiResults = new WeakMap();
  const boundVideos = new WeakSet();
  let playedVideos = new WeakSet(), finishedVideos = new WeakSet(), runEpoch = 0;
  let chapterPending=null;
  const completedChapters=new Set();
  const host = document.createElement('div');
  host.id = 'zhs-course-helper';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647';
  const ui = host.attachShadow({mode: 'open'});
  ui.innerHTML = `<style>
    :host{font:14px/1.5 system-ui;color:#e8edf7}*{box-sizing:border-box}
    section{width:300px;padding:16px;background:#182333;border:1px solid #44546c;border-radius:14px;box-shadow:0 8px 32px #0005}
    h3{margin:0 0 8px;font-size:16px}p{margin:8px 0;color:#c3d1e4}button{border:0;border-radius:7px;padding:7px 12px;cursor:pointer;background:#d9e7ff;color:#172333;margin:4px 3px 4px 0}
    label{display:block;margin:8px 0}textarea{width:100%;height:150px;background:#111b29;color:#fff;border:1px solid #53627a;padding:8px;border-radius:6px}
    details{margin-top:8px}small{display:block;color:#b0c1d8}#status{white-space:pre-wrap;max-height:120px;overflow:auto}#body[hidden]{display:none}
  </style><section><h3>智慧树课程助手 <button id="fold" title="收起">−</button></h3><div id="body">
    <p id="status" role="status">未启动</p><button id="toggle">启动助手</button><button id="resume">恢复播放</button>
    <label><input id="autoNext" type="checkbox"> 浏览器输入连播</label>
    <label><input id="autoQuiz" type="checkbox"> 使用本地题库自动作答</label>
    <label><input id="autoApi" type="checkbox"> 新题调用 API（需先配置）</label><button id="apiSettings">API 设置</button><button id="retryApi">手动重试 API</button>
    <label><input id="autoChapter" type="checkbox"> 打开的章节测试页自动作答并提交</label>
    <label><input id="autoChapterFlow" type="checkbox"> 连播时进入章节测试，完成后返回继续</label>
    <small>新题等待人工；不会自动关闭未知弹窗。</small>
    <details><summary>本地题库与诊断</summary><p>答案填写完整选项文字，不填 A/B。</p><textarea id="bank" spellcheck="false" aria-label="JSON题库"></textarea>
    <button id="save">保存题库</button><button id="capture">提取当前题目模板</button><button id="diagnose">查看状态</button><small>本地题库存于当前浏览器；API 按需另行启用。</small></details>
    </div></section>`;
  document.documentElement.append(host);
  // Keep assistant controls from triggering document-level click/keyboard handlers.
  for (const name of ['click','dblclick','pointerdown','pointerup','keydown','keyup']) host.addEventListener(name,event=>event.stopPropagation());
  for (const button of ui.querySelectorAll('button')) button.type = 'button';
  const $ = id => ui.getElementById(id);
  const status = text => { if ($('status').textContent !== text) $('status').textContent = text; };
  const visible = element => !!element && element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).display !== 'none';
  const query = (selector, root = document) => [...root.querySelectorAll(selector)];
  const video = () => query('video').find(visible) || null;
  const quiz = () => query('.ai-class-exercise-dialog').find(visible) || null;
  const blockers = () => query('.el-dialog,[role="dialog"],.vjs-modal-dialog').filter(e => visible(e) && e.textContent.trim());
  function catalogEntry(item) {
    const number = item.querySelector('.item-num')?.textContent.trim() || '';
    const title = item.querySelector('.item-name')?.textContent.trim() || '';
    const kind = [item.className,item.getAttribute('data-type'),item.getAttribute('data-content-type')].filter(Boolean).join(' ');
    const target = item.querySelector('.item-box');
    return {item,number,title,target,key:JSON.stringify([number,title]),kind:catalogKind({number,title,kind})};
  }
  function stopSwitch(message) {
    running=false;runEpoch++;waitForSwitch=false;switchTarget=null;
    void chrome.runtime.sendMessage({type:'zhsCancelNext'}).catch(()=>{});
    $('toggle').textContent='启动助手';status(message);
  }
  function observeVideo(v) {
    if (!v) return;
    if (!boundVideos.has(v)) {
      boundVideos.add(v);
      v.addEventListener('playing',()=>{if(running){playedVideos.add(v);finishedVideos.delete(v);}});
      v.addEventListener('ended',()=>{if(running && currentVideo===v && playedVideos.has(v)){finishedVideos.add(v);endedSince=Date.now();}});
      v.addEventListener('loadstart',()=>{playedVideos.delete(v);finishedVideos.delete(v);if(currentVideo===v)endedSince=0;});
    }
    if (!v.paused && !v.ended) playedVideos.add(v);
  }
  function questions(dialog) {
    return query('.ques-list .item', dialog).filter(e => e.querySelector('.question-info')).map(element => ({
      element, question: element.querySelector('.question-info').innerText.trim(),
      multiple: /多选/.test(element.querySelector('.type')?.textContent || ''),
      type: element.querySelector('.type')?.textContent.trim() || '',
      options: query('.option', element).map(option => ({element: option, text: option.querySelector('.answer')?.innerText.trim() || ''}))
    }));
  }
  function selected(element) {
    return [element, ...query('*', element)].some(e => e.matches('[aria-checked="true"],input:checked') ||
      [...e.classList].some(c => /^(active|selected|checked|is-checked|is-selected|option-selected|class-question-selected)$/.test(c)));
  }
  async function save() { await chrome.storage.local.set({zhsCourseHelper: config}); }
  async function playVideo(v) {
    if (!v || v.ended || !v.paused) return;
    try { await v.play(); status('正在播放'); }
    catch { status('浏览器阻止自动播放，请点击播放器播放按钮'); }
  }
  function notify() {
    status('检测到随堂练习，正在检查本地题库');
    // Only signal through our panel: do not change site titles or request notification permission.
    host.animate([{transform:'translateY(0)'},{transform:'translateY(-12px)'},{transform:'translateY(0)'}], {duration:600, iterations:2});
  }
  async function processQuiz(dialog) {
    const epoch = runEpoch;
    if (!config.autoQuiz && !config.autoApi) { status('随堂练习等待人工作答；本地题库和 API 均未启用'); return; }
    const prior = attempts.get(dialog);
    if (prior?.submitted && !prior.continued) {
      const continueButton = query('.el-dialog__footer button', dialog).find(e => visible(e) && !e.disabled &&
        e.getAttribute('aria-disabled') !== 'true' && /^(继续学习|继续播放)$/.test(e.textContent.trim()));
      if (continueButton) { prior.continued = true; continueButton.click(); status('练习已完成，等待恢复播放'); return; }
    }
    const qs = questions(dialog);
    const fingerprint = JSON.stringify(qs.map(q => [q.question, q.options.map(o => o.text)]));
    if (!qs.length) { status('练习页面状态变化，请人工处理'); return; }
    if (prior?.fingerprint === fingerprint) { status('已尝试本组题目，请检查结果并手动继续'); return; }
    const localBank = config.autoQuiz ? config.bank : [];
    let usedApi = false;
    let plans = qs.map(q => ({q, match: matchQuestion(localBank, q.question, q.options.map(o => o.text), q.multiple)}));
    let missing = plans.find(p => !p.match.ok);
    if (missing && config.autoApi) {
      usedApi = true;
      let cached = apiResults.get(dialog);
      if (!cached || cached.fingerprint !== fingerprint) {
        cached = {fingerprint,bank:[],error:null}; apiResults.set(dialog,cached);
        status('正在请求 API 答题，最多等待 25 秒');
        try {
          const missingQuestions = plans.filter(p=>!p.match.ok).map(({q})=>({question:q.question,multiple:q.multiple,options:q.options.map(o=>o.text)}));
          const result = await chrome.runtime.sendMessage({type:'zhsSolve',questions:missingQuestions});
          if (!result?.ok) throw new Error(result?.error || 'API 后台未响应');
          cached.bank = validateBank(result.bank);
        } catch (error) { cached.error = error.message; }
      }
      if (!running || runEpoch!==epoch || !config.autoApi || !dialog.isConnected || !visible(dialog)) return;
      if (JSON.stringify(questions(dialog).map(q=>[q.question,q.options.map(o=>o.text)])) !== fingerprint) return;
      if (cached.error) { status(`API 已停止：${cached.error}\n请人工处理，或点击“手动重试 API”`); return; }
      plans = qs.map(q=>({q,match:matchQuestion([...localBank,...cached.bank],q.question,q.options.map(o=>o.text),q.multiple)}));
      missing = plans.find(p=>!p.match.ok);
    }
    if (missing) { status(`${missing.match.reason}，等待人工作答\n${missing.q.question}`); return; }
    // Never toggle a pre-existing user selection or repeatedly submit the same question set.
    if (qs.some(q => q.options.some(o => selected(o.element)))) { status('检测到已有选择，请人工完成本组作答'); return; }
    const submit = query('button', dialog).find(e => visible(e) && e.textContent.trim() === '提交作答');
    if (!submit || submit.disabled || submit.getAttribute('aria-disabled') === 'true') { status('等待可用的提交作答按钮'); return; }
    attempts.set(dialog, {fingerprint});
    for (const {q, match} of plans) for (const index of match.indices) q.options[index].element.click();
    // Vue updates selected classes asynchronously. Submit once on the following tick.
    setTimeout(() => {
      if (!running || runEpoch!==epoch || !dialog.isConnected || !visible(dialog) || (usedApi ? !config.autoApi : !config.autoQuiz)) return;
      if (JSON.stringify(questions(dialog).map(q => [q.question,q.options.map(o=>o.text)])) !== fingerprint) return;
      if (!submit.isConnected || !visible(submit) || submit.disabled || submit.getAttribute('aria-disabled') === 'true') return;
      submit.click();
      const attempt = attempts.get(dialog);
      if (attempt) attempt.submitted = true;
      status('已提交匹配答案，请检查结果；关闭练习后恢复播放');
    }, 400);
  }
  async function nextLesson(v) {
    if (!config.autoNext || !v.ended || Date.now() - switchAt < 5000) return;
    if (!finishedVideos.has(v) || !playedVideos.has(v)) { status('播放器已结束，但未观察到本次运行的播放→结束事件；不会自动切课'); return; }
    if (!endedSince || Date.now() - endedSince < END_WAIT_MS) { status('视频结束，等待 3 秒处理进度与可能出现的随堂练习'); return; }
    if (waitForSwitch) { status('已请求切换课节；若未切换，请人工点击目录'); return; }
    const entries = query('.chapter-item').map(catalogEntry);
    const selected = entries.filter(e=>e.item.classList.contains('current'));
    if (selected.length!==1 || selected[0].kind!=='video') { status('无法唯一确认当前视频课节，请人工选择目录'); return; }
    if(config.autoChapterFlow){
      const chapter=selected[0].item.closest?.('.el-collapse-item');
      if(chapter){
        const videos=entries.filter(e=>e.kind==='video'&&e.item.closest?.('.el-collapse-item')===chapter);
        const tests=query('.test-box',chapter);
        if(videos.at(-1)===selected[0]&&tests.length){
          const title=chapter.querySelector('.chapter-title')?.textContent.trim()||'',name=chapter.querySelector('.chapter-name')?.textContent.trim()||'';
          const key=JSON.stringify([title,name]);
          if(!completedChapters.has(key)){
            if(!title||!/第.{1,12}章/.test(title)||tests.length!==1||!/^(?:测试|章节测试|单元测试)$/.test(tests[0].textContent.trim())){stopSwitch('本章测试入口无法确认，请人工处理');return;}
            const epoch=runEpoch;chapterPending={chapter:key,from:selected[0].key,sourceUrl:location.href,id:null};
            status('正在打开本章测试，课程播放已暂停');
            try{
              const result=await chrome.runtime.sendMessage({type:'zhsOpenChapterTest',from:selected[0].key,chapter:key});
              if(!running||runEpoch!==epoch)return;
              if(!result?.ok||result.chapter!==key)throw new Error(result?.error||'章节测试后台未响应');
              if(result.alreadyCompleted){completedChapters.add(key);chapterPending=null;status('本章测试已完成，准备继续课程');}
              else if(typeof result.id==='string'){chapterPending.id=result.id;status('章节测试进行中，完成后继续课程');}
              else throw new Error('未确认章节测试任务');
            }catch(error){if(running&&runEpoch===epoch)stopSwitch(`章节测试衔接已停止：${error.message}`);}
            return;
          }
        }
      }
    }
    const current = entries.indexOf(selected[0]);
    const remaining=entries.slice(current+1);
    const next=remaining.find(e=>e.kind==='video');
    if (!next || !next.target) { status('课程目录已结束，没有后续视频课节'); return; }
    const target=next.target;
    if (entries.filter(e=>e.key===next.key).length!==1) { status('下一视频课节标识重复，请人工选择'); return; }
    if (target.matches('[disabled],[aria-disabled="true"]') || next.item.getAttribute('aria-disabled')==='true') { status('下一视频课节不可用，请人工确认目录'); return; }
    // The browser controller expands the correct chapter and scrolls only the catalog.
    const skipped=remaining.slice(0,remaining.indexOf(next)).filter(e=>e.kind==='assessment').length;
    const epoch=runEpoch;
    switchedFrom = selected[0].item; switchTarget=next; waitForSwitch = true; switchAt = Date.now();
    status(`浏览器输入切课：${next.number} ${next.title}${skipped?`；跳过 ${skipped} 个测试条目`:''}；自动展开/滚动目录并核对新视频源`);
    try {
      const result=await chrome.runtime.sendMessage({type:'zhsNextVideo',from:selected[0].key,to:next.key});
      if(!running||runEpoch!==epoch)return;
      if(!result?.ok)throw new Error(result?.error||'浏览器输入后台无响应');
      if(result.target!==next.key)throw new Error('浏览器输入返回的课节不一致');
      switchAt=Date.now();status('浏览器已确认新课节及视频源，准备继续播放');
    } catch(error) {if(running&&runEpoch===epoch)stopSwitch(`切课已停止：${error.message}`);}
  }
  async function tick() {
    if (!running || busy || !ready) return;
    busy = true;
    const epoch=runEpoch;
    try {
      if(chapterPending){
        if(!config.autoNext||!config.autoChapterFlow){stopSwitch('章节测试衔接已停止，请人工检查测试页');return;}
        if(!chapterPending.id)return;
        const result=await chrome.runtime.sendMessage({type:'zhsChapterFlowStatus',id:chapterPending.id});
        if(!running||runEpoch!==epoch)return;
        if(!result?.ok||result.phase==='failed'){stopSwitch(result?.error||'章节测试任务已失效，请人工核对');return;}
        if(result.phase==='done'){
          completedChapters.add(chapterPending.chapter);chapterPending=null;endedSince=Date.now();status('章节测试已完成，准备继续课程');
        }else{status('章节测试进行中，完成后继续课程');return;}
      }
      const v = video();
      observeVideo(v);
      const dialog = quiz();
      if (dialog) {
        endedSince = 0;
        if (!observedQuiz) { resumeAfterQuiz = !!v && !v.ended; observedQuiz = true; }
        if (v && !v.paused) v.pause();
        if (!seenQuizzes.has(dialog)) { seenQuizzes.add(dialog); notify(); }
        await processQuiz(dialog); return;
      }
      if (blockers().length) { endedSince = 0; status('检测到其他弹窗，请人工处理'); return; }
      if (observedQuiz) {
        observedQuiz = false;
        if (resumeAfterQuiz) { resumeAfterQuiz = false; await playVideo(v); }
      }
      if (waitForSwitch) {
        const selected=query('.chapter-item').filter(e=>e.classList.contains('current')).map(catalogEntry);
        if (selected.length===1 && selected[0].key===switchTarget?.key && v && !v.ended && v.readyState>=1) {
          waitForSwitch=false;switchedFrom=null;switchTarget=null;currentVideo=null;endedSince=0;
        } else {
          if (selected.length===1 && selected[0].item!==switchedFrom && selected[0].key!==switchTarget?.key) { stopSwitch('目录切到了非预期课节，助手已停止，请人工确认');return; }
          if (Date.now()-switchAt>=15000) { stopSwitch('切课后 15 秒内未确认目标课节与播放器就绪，助手已停止；不会重复点击或跳过下一课');return; }
          status('等待已点击的视频课节加载，不重复切课');return;
        }
      }
      if (v && currentVideo !== v) { currentVideo = v; if (!waitForSwitch) await playVideo(v); }
      if (v && !waitForSwitch && !v.ended && Date.now() - switchAt < 6000 && switchAt) await playVideo(v);
      if (v?.ended) { if (!endedSince) endedSince = Date.now(); } else endedSince = 0;
      if (!v) status('未找到可见视频播放器');
      else if (v.ended) await nextLesson(v);
      else if (!v.paused) status('正在播放；监测随堂练习中');
    } catch (error) { stopSwitch(`助手已暂停：${error.message}`); }
    finally { busy = false; }
  }
  $('toggle').onclick = async () => {
    if (!ready) { status('正在读取设置，请稍候'); return; }
    running = !running; runEpoch++; $('toggle').textContent = running ? '停止助手' : '启动助手';
    if(!running)void chrome.runtime.sendMessage({type:'zhsCancelNext'}).catch(()=>{});
    status(running ? '已启动' : '助手已停止，视频保持当前状态');
    if (running) { chapterPending=null;waitForSwitch = false;switchTarget=null;currentVideo = null; endedSince=0; playedVideos=new WeakSet();finishedVideos=new WeakSet();await tick(); }
  };
  $('resume').onclick = async () => {
    if (quiz() || blockers().length) { status('请先完成并关闭页面弹窗'); return; }
    await playVideo(video());
  };
  $('fold').onclick = () => { $('body').hidden = !$('body').hidden; $('fold').textContent = $('body').hidden ? '+' : '−'; };
  for (const id of ['autoNext','autoQuiz','autoApi','autoChapter','autoChapterFlow']) $(id).onchange = async () => {
    config[id] = $(id).checked;
    if(chapterPending&&['autoNext','autoChapterFlow'].includes(id)&&!config[id])stopSwitch('章节测试衔接设置已关闭，保留测试页');
    try { await save(); status('设置已保存'); } catch (e) { status(`保存失败：${e.message}`); }
  };
  $('apiSettings').onclick = () => chrome.runtime.sendMessage({type:'zhsOpenApi'}).catch(e=>status(`无法打开设置：${e.message}`));
  $('retryApi').onclick = () => {
    const dialog = quiz();
    if (!dialog || busy) { status('请等待当前请求完成，并确认题目弹窗仍在'); return; }
    apiResults.delete(dialog); status('已允许本题重新请求 API'); void tick();
  };
  $('save').onclick = async () => {
    try { const bank = validateBank(JSON.parse($('bank').value)); config.bank = bank; await save(); status(`已保存 ${bank.length} 道题`); }
    catch (error) { status(`题库未保存：${error.message}`); }
  };
  $('capture').onclick = () => {
    const dialog = quiz();
    if (!dialog) { status('当前没有随堂练习弹窗'); return; }
    const qs = questions(dialog);
    const template = qs.map(q => ({question:q.question, answers:[], availableOptions:q.options.map(o=>o.text)}));
    // Put a template in the editor, avoiding clipboard permission and preserving the saved bank.
    $('bank').value = JSON.stringify(template, null, 2);
    status('当前题目模板已放入编辑框；填写 answers 后保存。注意：保存会替换原题库');
  };
  $('diagnose').onclick = () => status(JSON.stringify({running, video:!!video(), paused:video()?.paused, quiz:!!quiz(), dialogs:blockers().length, bank:config.bank.length},null,2));
  chrome.storage.local.get('zhsCourseHelper').then(async data => {
    try { config = {...defaults, ...data.zhsCourseHelper}; config.bank = validateBank(config.bank); }
    catch { config = {...defaults}; status('已重置无效题库'); }
    if (config.flowGuardVersion !== 2) { config.autoNext=false;config.flowGuardVersion=2;await save(); }
    for (const id of ['autoNext','autoQuiz','autoApi','autoChapter','autoChapterFlow']) $(id).checked = config[id];
    $('bank').value = JSON.stringify(config.bank, null, 2);
    ready = true;
  }).catch(e => status(`读取设置失败：${e.message}`));
  // MutationObserver catches dialogs; interval also covers video ended, without patching site APIs.
  const observer = new MutationObserver(() => { if (Date.now() - lastScan > 350) { lastScan = Date.now(); void tick(); } });
  observer.observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['class','style']});
  const timer = setInterval(tick, 1200);
  chrome.runtime.onMessage?.addListener((message,sender,reply)=>{
    if(sender.id!==chrome.runtime.id||message?.type!=='zhsChapterFlowCanReturn')return false;
    const selected=query('.chapter-item').filter(e=>e.classList.contains('current')).map(catalogEntry);
    const ok=running&&config.autoNext&&config.autoChapterFlow&&!!chapterPending&&
      message.chapter===chapterPending.chapter&&message.from===chapterPending.from&&
      (!chapterPending.id||message.id===chapterPending.id)&&message.sourceUrl===location.href&&
      selected.length===1&&selected[0].key===chapterPending.from&&video()?.ended;
    reply({ok:!!ok});return false;
  });
  window.addEventListener('pagehide', () => { observer.disconnect(); clearInterval(timer);void chrome.runtime.sendMessage({type:'zhsCancelNext'}).catch(()=>{}); }, {once:true});
})();
