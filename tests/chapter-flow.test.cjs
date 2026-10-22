const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const engine=require('../extension/chapter-engine.js');
const sourceUrl='https://wisdom-mooc.zhihuishu.com/study/index?recruitAndCourseId=test-course';
const examUrl='https://onlineexamh5new.zhihuishu.com/stuExamWeb.html#/webExamList/dohomework/test';
const chapter=JSON.stringify(['第一章:','示例章节']),from=JSON.stringify(['1.4','末节']);
function harness(){
  const data={},tabs=new Map([[1,{id:1,url:sourceUrl,windowId:10}],[2,{id:2,url:examUrl,windowId:10}],[3,{id:3,url:examUrl,windowId:10}]]);
  const calls={closed:[],activated:[],focused:[],messages:[]};let handler,created,removed,updated,api,clock=100000,ready=true,seq=0,activateHook;
  const session={get:async key=>structuredClone({[key]:data[key]}),set:async value=>Object.assign(data,structuredClone(value))};
  function boot(){
    const context={globalThis:null,URL,ZhsChapterEngine:engine,crypto:{randomUUID:()=>`flow-${++seq}`},Date:class extends Date{static now(){return clock;}},
      chrome:{runtime:{id:'extension',onMessage:{addListener:fn=>handler=fn}},storage:{session},
        webNavigation:{onCreatedNavigationTarget:{addListener:fn=>created=fn}},
        windows:{update:async(id,options)=>{calls.focused.push({id,...options});}},
        tabs:{onRemoved:{addListener:fn=>removed=fn},onUpdated:{addListener:fn=>updated=fn},
          get:async id=>{if(!tabs.has(id))throw Error('Tab missing');return {...tabs.get(id)};},
          update:async(id,options)=>{calls.activated.push({id,...options});await activateHook?.();},
          remove:async id=>{calls.closed.push(id);tabs.delete(id);removed(id,{});},
          sendMessage:async(id,message)=>{calls.messages.push({id,...message});return {ok:ready};},
        }}};
    context.globalThis=context;vm.runInNewContext(fs.readFileSync(require.resolve('../extension/chapter-flow.js'),'utf8'),context);api=context.ZhsChapterFlow;
  }
  const parent={id:'extension',frameId:0,url:sourceUrl,tab:{id:1}},child={id:'extension',frameId:0,url:examUrl,tab:{id:2}};
  boot();
  const send=(message,sender=child)=>new Promise(resolve=>{if(handler(message,sender,resolve)===false)resolve({accepted:false});});
  return {data,tabs,calls,parent,child,send,boot,get api(){return api;},set ready(v){ready=v;},set onActivate(fn){activateHook=fn;},advance:ms=>clock+=ms,
    arm:()=>api.arm({sourceTabId:1,sourceUrl,from,chapter}),state:id=>api.state(1,id),
    target:async(overrides={})=>{created({sourceTabId:1,sourceFrameId:0,tabId:2,url:examUrl,...overrides});await new Promise(setImmediate);},
    close:async id=>{tabs.delete(id);removed(id,{});await new Promise(setImmediate);},
    navigate:async(id,url)=>{tabs.get(id).url=url;updated(id,{url});await new Promise(setImmediate);},
    claim:()=>send({type:'zhsChapterFlowClaim',title:'第一章单元测试'}),
  };
}
test('owned test closes only after verified completion and returns to its course',async()=>{
  const h=harness(),flow=await h.arm();assert.equal(h.calls.closed.length,0);
  await h.target();const claimed=await h.claim();assert.equal(claimed.managed,true);assert.equal(claimed.id,flow.id);
  assert.equal((await h.state(flow.id)).phase,'active');assert.equal(h.calls.closed.length,0);
  const result=await h.send({type:'zhsChapterFlowComplete',id:flow.id});assert.equal(result.ok,true);
  assert.deepEqual(h.calls.closed,[2]);assert.deepEqual(h.calls.activated,[{id:1,active:true}]);assert.deepEqual(h.calls.focused,[{id:10,focused:true}]);
  assert.equal((await h.state(flow.id)).phase,'done');assert.equal((await h.arm()).alreadyCompleted,true);
});
test('manual and unrelated test tabs cannot be claimed or closed',async()=>{
  const h=harness();assert.equal((await h.claim()).managed,false);const flow=await h.arm();
  await h.target({sourceTabId:99});assert.equal((await h.claim()).managed,false);
  await h.target();await h.claim();
  const result=await h.send({type:'zhsChapterFlowComplete',id:flow.id},{...h.child,tab:{id:3}});
  assert.equal(result.ok,false);assert.deepEqual(h.calls.closed,[]);assert.equal((await h.state(flow.id)).phase,'active');
});
test('untrusted senders, subframes, final exams and unrelated routes are not managed',async()=>{
  const h=harness();await h.arm();await h.target();
  for(const sender of [{...h.child,id:'other'},{...h.child,frameId:1},{...h.child,url:examUrl.replace('/dohomework/','/exam/')}]){
    assert.equal((await h.send({type:'zhsChapterFlowClaim',title:'第一章单元测试'},sender)).accepted,false);
  }
  assert.equal((await h.send({type:'zhsChapterFlowClaim',title:'期末考试'})).managed,false);assert.deepEqual(h.calls.closed,[]);
});
test('a stopped parent or changed lesson prevents closing or continuing',async()=>{
  const h=harness(),flow=await h.arm();await h.target();await h.claim();h.ready=false;
  assert.equal((await h.send({type:'zhsChapterFlowComplete',id:flow.id})).ok,false);
  assert.deepEqual(h.calls.closed,[]);assert.equal((await h.state(flow.id)).phase,'failed');
});
test('course navigation and child navigation invalidate the owned flow',async()=>{
  for(const [id,url] of [[1,sourceUrl.replace('test-course','another-course')],[2,'https://example.test/']]){
    const h=harness(),flow=await h.arm();await h.target();await h.claim();await h.navigate(id,url);
    assert.equal((await h.state(flow.id)).phase,'failed');assert.equal((await h.send({type:'zhsChapterFlowComplete',id:flow.id})).ok,false);
    assert.deepEqual(h.calls.closed,[]);
  }
});
test('manual test closure fails instead of marking the test completed',async()=>{
  const h=harness(),flow=await h.arm();await h.target();await h.claim();await h.close(2);
  assert.equal((await h.state(flow.id)).phase,'failed');assert.deepEqual(h.calls.activated,[]);assert.equal((await h.arm()).alreadyCompleted,undefined);
});
test('closing the parent or cancelling preserves the child and stops its runner',async()=>{
  for(const method of ['close','cancel']){
    const h=harness(),flow=await h.arm();await h.target();await h.claim();
    if(method==='close')await h.close(1);else await h.api.cancel(1);
    assert.equal((await h.state(flow.id)).phase,'failed');assert.deepEqual(h.calls.closed,[]);
    assert.ok(h.calls.messages.some(m=>m.id===2&&m.type==='zhsChapterFlowCancelled'));
  }
});
test('opening timeout and multiple created targets do not claim or close any tab',async()=>{
  const timeout=harness(),flow=await timeout.arm();timeout.advance(30001);await timeout.target();assert.equal((await timeout.claim()).managed,false);assert.equal((await timeout.state(flow.id)).phase,'failed');
  const multiple=harness(),other=await multiple.arm();await multiple.target();await multiple.target({tabId:3});assert.equal((await multiple.state(other.id)).phase,'failed');assert.deepEqual(multiple.calls.closed,[]);
});
test('service-worker restart preserves ownership and successful completion',async()=>{
  const h=harness(),flow=await h.arm();await h.target();await h.claim();h.boot();
  assert.equal((await h.claim()).id,flow.id);assert.equal((await h.send({type:'zhsChapterFlowComplete',id:flow.id})).ok,true);assert.deepEqual(h.calls.closed,[2]);
});
test('duplicate open requests do not replace an active flow',async()=>{
  const h=harness(),flow=await h.arm();await assert.rejects(h.arm(),/已有/);assert.equal((await h.state(flow.id)).id,flow.id);
});

test('cancelling during return activation preserves the submitted test tab',async()=>{
  const h=harness(),flow=await h.arm();await h.target();await h.claim();h.onActivate=()=>h.api.cancel(1);
  assert.equal((await h.send({type:'zhsChapterFlowComplete',id:flow.id})).ok,false);assert.deepEqual(h.calls.closed,[]);assert.deepEqual(h.calls.focused,[]);
});

test('an interrupted return times out after worker restart instead of waiting forever',async()=>{
  const h=harness(),flow=await h.arm();await h.target();await h.claim();
  const job=h.data.zhsChapterFlows.jobs[1];job.phase='returning';job.returnUntil=100010;h.boot();h.advance(30000);
  assert.equal((await h.state(flow.id)).phase,'failed');assert.deepEqual(h.calls.closed,[]);
});

test('real grade-feedback page drives the owned close and course activation',async()=>{
  const {createRequire}=require('node:module');
  const pagePath=require.resolve('./chapter-page.test.cjs'),localRequire=createRequire(pagePath);
  const pageContext={require:Object.assign(name=>name==='node:test'?{test(){}}:localRequire(name),{resolve:localRequire.resolve}),setImmediate,URL};
  vm.runInNewContext(fs.readFileSync(pagePath,'utf8')+'\nglobalThis.makePage=pageHarness;',pageContext);
  const h=harness(),flow=await h.arm();await h.target();await h.claim();
  const page=await pageContext.makePage({managed:true,api:true,feedback:{},flowId:flow.id,onComplete:message=>h.send(message)});
  for(let i=0;i<7;i++){page.poll();await new Promise(setImmediate);}
  assert.equal(page.confirm.clicks,1);assert.equal(page.lifecycle.length,1);assert.deepEqual(h.calls.closed,[2]);
  assert.deepEqual(h.calls.activated,[{id:1,active:true}]);assert.equal((await h.state(flow.id)).phase,'done');
});
