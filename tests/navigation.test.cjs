const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const {catalogKind}=require('../extension/core.js');
const flowPath=require.resolve('./flow.test.cjs'),localRequire=createRequire(flowPath);
const sandbox={require:Object.assign(name=>name==='node:test'?{test(){}}:localRequire(name),{resolve:localRequire.resolve})};
vm.runInNewContext(fs.readFileSync(flowPath,'utf8')+'\nglobalThis.flowHarness=harness;globalThis.FlowElement=Element;',sandbox);
async function setup(specs,{load=true}={}) {
  const h=await sandbox.flowHarness({autoNext:true});h.dialog.visible=false;
  const E=sandbox.FlowElement;
  const entries=specs.map(({number='',title,kind='',hidden=false})=>{
    const item=new E(),box=new E();item.className=`chapter-item ${kind}`;
    item.map['.item-num']=number?[new E(number)]:[];item.map['.item-name']=[new E(title)];item.map['.item-box']=[box];box.visible=!hidden;
    box.onClick=()=>{entries.forEach(e=>e.item.classes.delete('current'));item.classes.add('current');if(load){h.v.emit('loadstart');h.v.ended=false;h.v.paused=true;h.v.readyState=1;}};
    return {item,box};
  });
  entries[0].item.classes.add('current');h.doc.map['.chapter-item']=entries.map(e=>e.item);
  await h.start();
  return {h,entries,finish:async()=>{h.v.ended=true;h.v.emit('ended');await h.tick();h.advance(15100);await h.tick();}};
}
test('classifies assessment labels and metadata without excluding lecture about software testing',()=>{
  for(const title of ['章节测试','章末测验','单元考试','测试','期末考试']) assert.equal(catalogKind({number:'1.2',title}),'assessment');
  assert.equal(catalogKind({number:'2.1',title:'国家安全',kind:'chapter-item exam'}),'assessment');
  assert.equal(catalogKind({number:'2.1',title:'软件测试方法介绍'}),'video');
  assert.equal(catalogKind({title:'第三章'}),'unknown');
});
test('clicks next video in left catalog while skipping chapter assessment',async()=>{
  const x=await setup([{number:'1.4',title:'本章视频'},{number:'1.5',title:'章节测试'},{number:'2.1',title:'下一章视频'}]);
  await x.finish();assert.equal(x.entries[1].box.clicks,0);assert.equal(x.entries[2].box.clicks,1);
  await x.h.tick();assert.equal(x.h.v.paused,false);
});
test('skips consecutive assessments and heading rows before next video',async()=>{
  const x=await setup([{number:'1.4',title:'本章视频'},{title:'测试'},{number:'1.6',title:'检查',kind:'quiz'},{title:'第二章'},{number:'2.1',title:'下一章视频'}]);
  await x.finish();assert.deepEqual(x.entries.map(e=>e.box.clicks),[0,0,0,0,1]);
});
test('does not click assessments at end of course',async()=>{
  const x=await setup([{number:'12.4',title:'最后视频'},{title:'章节测试'},{title:'期末考试'}]);await x.finish();assert.deepEqual(x.entries.map(e=>e.box.clicks),[0,0,0]);
});
test('collapsed next video is handed to browser controller without skipping to a later lesson',async()=>{
  const x=await setup([{number:'1.4',title:'本章视频'},{number:'2.1',title:'下一章视频',hidden:true},{number:'3.1',title:'后面的视频'}]);await x.finish();assert.deepEqual(x.entries.map(e=>e.box.clicks),[0,1,0]);
});
test('load timeout stops helper without repeated clicks',async()=>{
  const x=await setup([{number:'1.1',title:'第一节'},{number:'1.2',title:'第二节'},{number:'1.3',title:'第三节'}],{load:false});await x.finish();x.h.advance(16000);await x.h.tick();await x.h.tick();
  assert.deepEqual(x.entries.map(e=>e.box.clicks),[0,1,0]);assert.equal(x.h.ids.toggle.textContent,'启动助手');assert.match(x.h.ids.status.textContent,/15 秒/);
});
test('unexpected selected lesson is detected before further playback',async()=>{
  const x=await setup([{number:'1.1',title:'第一节'},{number:'1.2',title:'第二节'},{number:'1.3',title:'第三节'}],{load:false});await x.finish();x.entries[1].item.classes.delete('current');x.entries[2].item.classes.add('current');await x.h.tick();
  assert.equal(x.h.ids.toggle.textContent,'启动助手');assert.match(x.h.ids.status.textContent,/非预期课节/);assert.equal(x.entries[2].box.clicks,0);
});
test('browser input is not requested until the full 15-second end wait has elapsed',async()=>{
  const x=await setup([{number:'1.1',title:'第一节'},{number:'1.2',title:'第二节'}]);
  x.h.v.ended=true;x.h.v.emit('ended');await x.h.tick();x.h.advance(14900);await x.h.tick();assert.equal(x.entries[1].box.clicks,0);
  x.h.advance(500);await x.h.tick();assert.equal(x.entries[1].box.clicks,1);
});
