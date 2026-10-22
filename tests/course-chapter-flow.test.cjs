const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const path=require.resolve('./flow.test.cjs'),localRequire=createRequire(path);
const sandbox={require:Object.assign(name=>name==='node:test'?{test(){}}:localRequire(name),{resolve:localRequire.resolve})};
vm.runInNewContext(fs.readFileSync(path,'utf8')+'\nglobalThis.flowHarness=harness;globalThis.FlowElement=Element;',sandbox);
const sourceUrl='https://wisdom-mooc.zhihuishu.com/study/index?recruitAndCourseId=test-course';
const chapterKey=JSON.stringify(['第一章:','示例章节']);
async function setup({enabled=true,last=true,final=false,alreadyCompleted=false}={}){
  const messages=[];let phase='active';const E=sandbox.FlowElement;let h;
  h=await sandbox.flowHarness({autoNext:true,autoChapterFlow:enabled,sendMessage:async message=>{
    messages.push(message);
    if(message.type==='zhsOpenChapterTest')return {ok:true,id:'flow-1',chapter:message.chapter,alreadyCompleted};
    if(message.type==='zhsChapterFlowStatus')return {ok:true,phase,error:phase==='failed'?'测试页已关闭':''};
    if(message.type==='zhsNextVideo'){
      const item=entries.find(e=>JSON.stringify([e.querySelector('.item-num').textContent,e.querySelector('.item-name').textContent])===message.to);
      entries.forEach(e=>e.classes.delete('current'));item.classes.add('current');h.v.emit('loadstart');h.v.ended=false;h.v.readyState=1;h.v.paused=true;
      return {ok:true,target:message.to};
    }
    return {ok:true};
  }});
  h.dialog.visible=false;
  const chapter=new E(),testBox=new E('测试'),nextChapter=new E();
  chapter.map['.chapter-title']=[new E('第一章:')];chapter.map['.chapter-name']=[new E('示例章节')];chapter.map['.test-box']=[testBox];
  const specs=[['1.3','当前视频',chapter],...(!last?[['1.4','本章末节',chapter]]:[]),...(!final?[['2.1','下一章视频',nextChapter]]:[])];
  const entries=specs.map(([number,title,owner])=>{const e=new E();e.closest=s=>s==='.el-collapse-item'?owner:null;e.map['.item-num']=[new E(number)];e.map['.item-name']=[new E(title)];e.map['.item-box']=[new E()];return e;});
  entries[0].classes.add('current');h.doc.map['.chapter-item']=entries;await h.start();
  return {h,messages,entries,set phase(v){phase=v;},finish:async()=>{h.v.ended=true;h.v.emit('ended');h.advance(3000);await h.tick();}};
}
test('chapter test is opened before the next chapter, then course playback resumes',async()=>{
  const x=await setup();await x.finish();assert.equal(x.messages.filter(m=>m.type==='zhsOpenChapterTest').length,1);
  for(let i=0;i<3;i++){x.h.advance(10000);await x.h.tick();}
  assert.equal(x.messages.filter(m=>m.type==='zhsNextVideo').length,0);
  const ready=await x.h.receive({type:'zhsChapterFlowCanReturn',id:'flow-1',from:JSON.stringify(['1.3','当前视频']),chapter:chapterKey,sourceUrl});assert.equal(ready.ok,true);
  x.phase='done';await x.h.tick();x.h.advance(3000);await x.h.tick();await x.h.tick();
  assert.equal(x.messages.filter(m=>m.type==='zhsOpenChapterTest').length,1);assert.equal(x.messages.filter(m=>m.type==='zhsNextVideo').length,1);assert.equal(x.h.v.paused,false);
});
test('disabled mode and non-final chapter video keep ordinary video navigation',async()=>{
  for(const options of [{enabled:false},{last:false}]){
    const x=await setup(options);await x.finish();assert.equal(x.messages.filter(m=>m.type==='zhsOpenChapterTest').length,0);assert.equal(x.messages.filter(m=>m.type==='zhsNextVideo').length,1);
  }
});
test('the final course chapter test is processed without reopening it after completion',async()=>{
  const x=await setup({final:true});await x.finish();x.phase='done';await x.h.tick();x.h.advance(3000);await x.h.tick();await x.h.tick();
  assert.equal(x.messages.filter(m=>m.type==='zhsOpenChapterTest').length,1);assert.equal(x.messages.filter(m=>m.type==='zhsNextVideo').length,0);assert.match(x.h.ids.status.textContent,/目录已结束/);
});
test('failed chapter flow stops the course and never advances to a video',async()=>{
  const x=await setup();await x.finish();x.phase='failed';await x.h.tick();x.h.advance(10000);await x.h.tick();
  assert.equal(x.h.ids.toggle.textContent,'启动助手');assert.equal(x.messages.filter(m=>m.type==='zhsNextVideo').length,0);assert.match(x.h.ids.status.textContent,/测试页已关闭/);
});
test('stopping or selecting another lesson rejects a managed return handshake',async()=>{
  for(const action of ['stop','change']){
    const x=await setup();await x.finish();
    if(action==='stop')await x.h.ids.toggle.onclick();else{x.entries[0].classes.delete('current');x.entries[1].classes.add('current');}
    const result=await x.h.receive({type:'zhsChapterFlowCanReturn',id:'flow-1',from:JSON.stringify(['1.3','当前视频']),chapter:chapterKey,sourceUrl});assert.equal(result.ok,false);
  }
});
test('completed session state skips reopening and continues to the next lesson',async()=>{
  const x=await setup({alreadyCompleted:true});await x.finish();await x.h.tick();await x.h.tick();
  assert.equal(x.messages.filter(m=>m.type==='zhsOpenChapterTest').length,1);assert.equal(x.messages.filter(m=>m.type==='zhsNextVideo').length,1);
});
