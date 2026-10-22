const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../extension/core.js');
const {setImmediate}=require('node:timers');
class Element {
  constructor(text='') { this.textContent=text;this.innerText=text;this.map={};this.classes=new Set();this.classList={contains:c=>this.classes.has(c),[Symbol.iterator]:()=>this.classes.values()};this.style={};this.isConnected=true;this.visible=true;this.clicks=0;this.hidden=false; }
  querySelectorAll(s) { return this.map[s]||[]; }
  querySelector(s) { return this.querySelectorAll(s)[0]||null; }
  getClientRects() { return this.visible?[{}]:[]; }
  getAttribute() { return null; }
  matches() { return false; }
  click() {this.clicks++;this.onClick?.();}
  animate() {}
  addEventListener(name,fn) { (this.events??={})[name]??=[];this.events[name].push(fn); }
  emit(name) {for(const fn of this.events?.[name]||[])fn();}
}
async function harness({bank=[],api=false,result,autoQuiz=true,autoNext=false,autoChapterFlow=false,sendMessage,runtimeId='test-extension',autoSpeed=false,playbackRate=1.5,acceptSpeed=true}={}) {
  const ids={}, timers=[], timeouts=[],cleared=[],windowEvents={}; let now=100000,disconnected=0;
  const doc=new Element(), root=new Element(), body=new Element();
  doc.documentElement=root;doc.body=body;doc.getElementById=()=>null;
  root.append=()=>{};
  doc.createElement=()=>{
    const host=new Element();host.attachShadow=()=>({
      set innerHTML(html){for(const match of html.matchAll(/id="([^"]+)"/g)) ids[match[1]]=new Element();},
      getElementById:id=>ids[id]
      ,querySelectorAll:()=>[]
    });return host;
  };
  const v=new Element();v.paused=false;v.ended=false;v.readyState=1;v.pause=()=>{v.paused=true;};v.play=async()=>{v.paused=false;v.plays=(v.plays||0)+1;};
  v.playbackRate=1;v.currentSrc='video-1';v.currentTime=15;
  const speedMenu=new Element(),speedChoices=[1,1.25,1.5].map(rate=>{const choice=new Element(`X ${rate}`);choice.getAttribute=name=>name==='rate'?String(rate):null;choice.onClick=()=>{if(acceptSpeed)v.playbackRate=rate;};return choice;});
  speedMenu.map['.speedTab']=speedChoices;doc.map['.speedBox']=[speedMenu];
  const dialog=new Element('AI随堂练习'), question=new Element(), stem=new Element('测试题'), type=new Element('[多选题]');
  const options=['正确一','干扰','正确二'].map(text=>{const o=new Element();o.map['.answer']=[new Element(text)];o.onClick=()=>o.classes.add('active');return o;});
  question.map['.question-info']=[stem];question.map['.type']=[type];question.map['.option']=options;
  dialog.map['.ques-list .item']=[question];
  const submit=new Element('提交作答');dialog.map['button']=[submit];dialog.map['.el-dialog__footer button']=[submit];
  doc.map['video']=[v];doc.map['.ai-class-exercise-dialog']=[dialog];doc.map['.el-dialog,[role="dialog"],.vjs-modal-dialog']=[dialog];doc.map['.chapter-item']=[];
  let calls=0,messageHandler;
  const store={zhsCourseHelper:{bank,autoApi:api,autoQuiz,autoNext,autoChapterFlow,autoSpeed,playbackRate,flowGuardVersion:2}};
  const context={globalThis:null,document:doc,location:{href:'https://wisdom-mooc.zhihuishu.com/study/index?recruitAndCourseId=test-course'},window:{addEventListener:(name,fn)=>windowEvents[name]=fn},getComputedStyle:()=>({visibility:'visible',display:'block'}),MutationObserver:class{observe(){}disconnect(){disconnected++;}},
    setInterval:fn=>{timers.push(fn);return 1;},clearInterval:id=>cleared.push(id),setTimeout:fn=>{timeouts.push(fn);return 1;},Date:class extends Date{static now(){return now;}},
    chrome:{storage:{local:{get:async()=>store,set:async data=>Object.assign(store,data)}},runtime:{id:runtimeId,onMessage:{addListener:fn=>messageHandler=fn},sendMessage:async(message)=>{
      calls++;if(sendMessage)return sendMessage(message);
      if(message.type==='zhsNextVideo'){
        const item=(doc.map['.chapter-item']||[]).find(e=>JSON.stringify([e.querySelector('.item-num')?.textContent||'',e.querySelector('.item-name')?.textContent||''])===message.to);
        item?.querySelector('.item-box')?.click();return {ok:true,target:message.to};
      }
      if(message.type==='zhsCancelNext')return {ok:true};
      return result||{ok:false,error:'mock unavailable'};
    }}},ZhsCourseCore:core};
  context.globalThis=context;
  for(const file of ['page-runtime.js','content.js'])vm.runInNewContext(fs.readFileSync(require.resolve('../extension/'+file),'utf8'),context);
  await new Promise(setImmediate);
  return {ids,v,dialog,submit,options,doc,speedMenu,speedChoices,store,runtime:context.chrome.runtime,cleared,timers,get disconnected(){return disconnected;},hide:()=>windowEvents.pagehide(),get calls(){return calls;},start:()=>ids.toggle.onclick(),tick:()=>timers[0]?.(),advance:ms=>now+=ms,flush:()=>{while(timeouts.length)timeouts.shift()();},
    receive:message=>new Promise(resolve=>messageHandler(message,{id:'test-extension'},resolve))};
}
test('unknown quiz pauses video and never selects or submits', async()=>{
  const h=await harness();await h.start();await h.tick();h.flush();
  assert.equal(h.v.paused,true);assert.equal(h.submit.clicks,0);assert.equal(h.options.reduce((s,o)=>s+o.clicks,0),0);
});
test('known multi-select submits once, continues once, then resumes', async()=>{
  const h=await harness({bank:[{question:'测试题',answers:['正确一','正确二']}]});
  await h.start();h.flush();await h.tick();h.flush();
  assert.deepEqual(h.options.map(o=>o.clicks),[1,0,1]);assert.equal(h.submit.clicks,1);
  const next=new Element('继续学习');next.onClick=()=>{h.dialog.visible=false;};h.dialog.map['.el-dialog__footer button']=[next];
  await h.tick();await h.tick();assert.equal(next.clicks,1);assert.equal(h.v.paused,false);
});
test('stopping before deferred submission prevents the click',async()=>{
  const h=await harness({bank:[{question:'测试题',answers:['正确一','正确二']}]});await h.start();await h.ids.toggle.onclick();h.flush();assert.equal(h.submit.clicks,0);
});
test('API failures do not automatically retry',async()=>{
  const h=await harness({api:true});await h.start();await h.tick();await h.tick();assert.equal(h.calls,1);assert.equal(h.submit.clicks,0);
});
test('API result uses validated full-option matching',async()=>{
  const h=await harness({api:true,result:{ok:true,bank:[{question:'测试题',answers:['正确二','正确一']}]}});await h.start();h.flush();await h.tick();assert.equal(h.calls,1);assert.deepEqual(h.options.map(o=>o.clicks),[1,0,1]);assert.equal(h.submit.clicks,1);
});
test('failed lesson load never skips another chapter',async()=>{
  const h=await harness({autoNext:true});h.dialog.visible=false;
  const items=[new Element(),new Element(),new Element()];items[0].classes.add('current');
  for(const [index,item] of items.entries()){const box=new Element();box.onClick=()=>{items.forEach(e=>e.classes.delete('current'));item.classes.add('current');};item.map['.item-box']=[box];item.map['.item-num']=[new Element(`1.${index+1}`)];item.map['.item-name']=[new Element(`课节${index+1}`)];}
  h.doc.map['.chapter-item']=items;await h.start();h.v.ended=true;h.v.emit('ended');await h.tick();h.advance(16000);await h.tick();h.advance(10000);await h.tick();
  assert.equal(items[1].querySelector('.item-box').clicks,1);assert.equal(items[2].querySelector('.item-box').clicks,0);
});
test('API-only mode works when local-bank mode is disabled',async()=>{
  const h=await harness({api:true,autoQuiz:false,result:{ok:true,bank:[{question:'测试题',answers:['正确二','正确一']}]}});
  await h.start();h.flush();assert.equal(h.calls,1);assert.equal(h.submit.clicks,1);
});
test('startup on an already ended video cannot switch any lesson',async()=>{
  const h=await harness({autoNext:true});h.dialog.visible=false;h.v.ended=true;
  const items=[new Element(),new Element()];items[0].classes.add('current');
  for(const item of items){item.map['.item-num']=[new Element('1')];item.map['.item-name']=[new Element('课节')];item.map['.item-box']=[new Element()];}
  h.doc.map['.chapter-item']=items;await h.start();h.advance(10000);await h.tick();assert.equal(items[1].querySelector('.item-box').clicks,0);
});
test('generic completion button is not automatically clicked',async()=>{
  const h=await harness({bank:[{question:'测试题',answers:['正确一']}]});await h.start();h.flush();
  const done=new Element('完成');h.dialog.map['.el-dialog__footer button']=[done];await h.tick();assert.equal(done.clicks,0);
});

test('synchronous invalidation while stopping is caught and cleans up the course loop',async()=>{
  const h=await harness();h.dialog.visible=false;await h.start();let attempts=0;
  h.runtime.sendMessage=()=>{attempts++;throw Error('Extension context invalidated.');};
  await h.ids.toggle.onclick();await new Promise(setImmediate);
  assert.equal(attempts,1);assert.equal(h.disconnected,1);assert.deepEqual(h.cleared,[1]);assert.equal(h.ids.toggle.disabled,true);
  await h.ids.apiSettings.onclick();h.hide();await h.tick();await new Promise(setImmediate);assert.equal(attempts,1);assert.match(h.ids.status.textContent,/请刷新当前页面/);
});

test('runtime loss cancels a scheduled quiz submission before it clicks',async()=>{
  const h=await harness({bank:[{question:'测试题',answers:['正确一','正确二']}]});await h.start();
  h.runtime.id=undefined;await h.tick();h.flush();assert.equal(h.submit.clicks,0);assert.equal(h.ids.toggle.disabled,true);assert.match(h.ids.status.textContent,/请刷新当前页面/);
});

test('a pending answer is discarded if the extension is reloaded before it resolves',async()=>{
  let resolve;const h=await harness({api:true,sendMessage:()=>new Promise(r=>resolve=r)});
  const pending=h.start();h.runtime.id=undefined;resolve({ok:true,bank:[{question:'测试题',answers:['正确一','正确二']}]});await pending;h.flush();
  assert.deepEqual(h.options.map(o=>o.clicks),[0,0,0]);assert.equal(h.submit.clicks,0);assert.match(h.ids.status.textContent,/请刷新当前页面/);
});

test('an already invalid context does not start observers or timers',async()=>{
  const h=await harness({runtimeId:null});assert.equal(h.timers.length,0);await h.start();assert.equal(h.calls,0);assert.equal(h.ids.toggle.disabled,true);assert.match(h.ids.status.textContent,/请刷新当前页面/);
});

test('automatic speed is opt-in and leaves manual playback alone by default',async()=>{
  const h=await harness();h.dialog.visible=false;await h.start();assert.equal(h.v.playbackRate,1);assert.equal(h.speedChoices.reduce((n,e)=>n+e.clicks,0),0);assert.equal(h.ids.autoSpeed.checked,false);
});

test('automatic speed uses the native rate option and verifies playback without seeking',async()=>{
  const h=await harness({autoSpeed:true});h.dialog.visible=false;await h.start();await h.tick();
  assert.equal(h.v.playbackRate,1.5);assert.equal(h.speedChoices[2].clicks,1);assert.equal(h.v.currentTime,15);assert.match(h.ids.status.textContent,/倍速：1.5×/);
});

test('loading another video reapplies the saved speed preference',async()=>{
  const h=await harness({autoSpeed:true});h.dialog.visible=false;await h.start();h.v.emit('loadstart');h.v.currentSrc='video-2';h.v.playbackRate=1;await h.tick();
  assert.equal(h.v.playbackRate,1.5);assert.equal(h.speedChoices[2].clicks,2);
});

test('replacement video elements receive their own speed setting',async()=>{
  const h=await harness({autoSpeed:true});h.dialog.visible=false;await h.start();
  const next=new Element();Object.assign(next,{paused:false,ended:false,readyState:1,currentSrc:'next',playbackRate:1});
  h.doc.map.video=[next];h.speedChoices[2].onClick=()=>{next.playbackRate=1.5;};await h.tick();
  assert.equal(next.playbackRate,1.5);assert.equal(h.speedChoices[2].clicks,2);
});

test('missing or ambiguous native speed controls never cause a forced rate change',async()=>{
  for(const type of ['missing','duplicate-menu','duplicate-option']){
    const h=await harness({autoSpeed:true});h.dialog.visible=false;
    if(type==='missing')h.doc.map['.speedBox']=[];
    if(type==='duplicate-menu')h.doc.map['.speedBox'].push(new Element());
    if(type==='duplicate-option')h.speedMenu.map['.speedTab'].push(h.speedChoices[2]);
    await h.start();assert.equal(h.v.playbackRate,1);assert.equal(h.speedChoices[2].clicks,0);assert.match(h.ids.status.textContent,/手动设置/);
  }
});

test('a refusing player receives at most two speed attempts',async()=>{
  const h=await harness({autoSpeed:true,acceptSpeed:false});h.dialog.visible=false;await h.start();await h.tick();assert.equal(h.speedChoices[2].clicks,1);
  for(let i=0;i<6;i++){h.advance(2500);await h.tick();}
  assert.equal(h.speedChoices[2].clicks,2);assert.equal(h.v.playbackRate,1);assert.match(h.ids.status.textContent,/播放器未确认倍速/);assert.equal(h.ids.toggle.textContent,'停止助手');
});

test('speed preferences and the opt-in switch are saved and applied while running',async()=>{
  const h=await harness({autoSpeed:true});h.dialog.visible=false;await h.start();
  h.ids.playbackRate.value='1.25';await h.ids.playbackRate.onchange();assert.equal(h.store.zhsCourseHelper.playbackRate,1.25);assert.equal(h.v.playbackRate,1.25);
  h.ids.autoSpeed.checked=false;await h.ids.autoSpeed.onchange();h.v.playbackRate=1;await h.tick();assert.equal(h.v.playbackRate,1);assert.equal(h.store.zhsCourseHelper.autoSpeed,false);
  h.ids.autoSpeed.checked=true;await h.ids.autoSpeed.onchange();assert.equal(h.v.playbackRate,1.25);assert.equal(h.store.zhsCourseHelper.autoSpeed,true);
});

test('unsupported stored and user-entered speeds cannot select arbitrary rates',async()=>{
  const h=await harness({autoSpeed:true,playbackRate:8});h.dialog.visible=false;await h.start();assert.equal(h.v.playbackRate,1.5);assert.equal(h.ids.playbackRate.value,'1.5');
  h.ids.playbackRate.value='4';await h.ids.playbackRate.onchange();assert.equal(h.v.playbackRate,1.5);assert.equal(h.speedChoices[2].clicks,1);assert.match(h.ids.status.textContent,/支持的倍速/);
});

test('speed selection waits for loaded video and an unblocked course page',async()=>{
  for(const type of ['quiz','ended','loading']){
    const h=await harness({autoSpeed:true});h.dialog.visible=type==='quiz';if(type==='ended')h.v.ended=true;if(type==='loading')h.v.readyState=0;
    await h.start();assert.equal(h.speedChoices[2].clicks,0);
  }
});

test('context loss also prevents later automatic speed clicks',async()=>{
  const h=await harness({autoSpeed:true});h.dialog.visible=false;await h.start();h.v.playbackRate=1;h.runtime.id=undefined;await h.tick();
  assert.equal(h.speedChoices[2].clicks,1);assert.equal(h.v.playbackRate,1);assert.match(h.ids.status.textContent,/请刷新当前页面/);
});
