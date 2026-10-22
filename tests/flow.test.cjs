const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../extension/core.js');
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
async function harness({bank=[],api=false,result,autoQuiz=true,autoNext=false,autoChapterFlow=false,sendMessage}={}) {
  const ids={}, timers=[], timeouts=[]; let now=100000;
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
  const dialog=new Element('AI随堂练习'), question=new Element(), stem=new Element('测试题'), type=new Element('[多选题]');
  const options=['正确一','干扰','正确二'].map(text=>{const o=new Element();o.map['.answer']=[new Element(text)];o.onClick=()=>o.classes.add('active');return o;});
  question.map['.question-info']=[stem];question.map['.type']=[type];question.map['.option']=options;
  dialog.map['.ques-list .item']=[question];
  const submit=new Element('提交作答');dialog.map['button']=[submit];dialog.map['.el-dialog__footer button']=[submit];
  doc.map['video']=[v];doc.map['.ai-class-exercise-dialog']=[dialog];doc.map['.el-dialog,[role="dialog"],.vjs-modal-dialog']=[dialog];doc.map['.chapter-item']=[];
  let calls=0,messageHandler;
  const context={globalThis:null,document:doc,location:{href:'https://wisdom-mooc.zhihuishu.com/study/index?recruitAndCourseId=test-course'},window:{addEventListener(){}},getComputedStyle:()=>({visibility:'visible',display:'block'}),MutationObserver:class{observe(){}disconnect(){}},
    setInterval:fn=>{timers.push(fn);return 1;},clearInterval(){},setTimeout:fn=>{timeouts.push(fn);return 1;},Date:class extends Date{static now(){return now;}},
    chrome:{storage:{local:{get:async()=>({zhsCourseHelper:{bank,autoApi:api,autoQuiz,autoNext,autoChapterFlow,flowGuardVersion:2}}),set:async()=>{}}},runtime:{id:'test-extension',onMessage:{addListener:fn=>messageHandler=fn},sendMessage:async(message)=>{
      calls++;if(sendMessage)return sendMessage(message);
      if(message.type==='zhsNextVideo'){
        const item=(doc.map['.chapter-item']||[]).find(e=>JSON.stringify([e.querySelector('.item-num')?.textContent||'',e.querySelector('.item-name')?.textContent||''])===message.to);
        item?.querySelector('.item-box')?.click();return {ok:true,target:message.to};
      }
      if(message.type==='zhsCancelNext')return {ok:true};
      return result||{ok:false,error:'mock unavailable'};
    }}},ZhsCourseCore:core};
  context.globalThis=context;vm.runInNewContext(fs.readFileSync(require.resolve('../extension/content.js'),'utf8'),context);
  await Promise.resolve();await Promise.resolve();
  return {ids,v,dialog,submit,options,doc,get calls(){return calls;},start:()=>ids.toggle.onclick(),tick:()=>timers[0](),advance:ms=>now+=ms,flush:()=>{while(timeouts.length)timeouts.shift()();},
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
