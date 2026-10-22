const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function fixture(){
  let expired=0,calls=0;
  const chrome={runtime:{id:'extension',sendMessage:()=>{calls++;return Promise.resolve({ok:true});}},storage:{local:{get:async()=>({}),set:async()=>{}}}};
  const context={globalThis:null,chrome};context.globalThis=context;
  vm.runInNewContext(fs.readFileSync(require.resolve('../extension/page-runtime.js'),'utf8'),context);
  const bridge=context.ZhsPageRuntime.create({onInvalidated:()=>expired++});
  return {chrome,bridge,get expired(){return expired;},get calls(){return calls;}};
}
test('synchronous context invalidation is converted to one handled rejection',async()=>{
  const h=fixture();let attempts=0;h.chrome.runtime.sendMessage=()=>{attempts++;throw Error('Extension context invalidated.');};
  await assert.rejects(h.bridge.send({}),/context invalidated/);await assert.rejects(h.bridge.send({}),/请刷新/);
  assert.equal(attempts,1);assert.equal(h.expired,1);assert.equal(h.bridge.invalidated,true);
});
test('asynchronous context rejection expires the bridge without further native calls',async()=>{
  const h=fixture();let attempts=0;h.chrome.runtime.sendMessage=()=>{attempts++;return Promise.reject(Error('Extension context invalidated.'));};
  await assert.rejects(h.bridge.send({}),/context invalidated/);assert.equal(h.bridge.valid(),false);assert.equal(h.expired,1);assert.equal(attempts,1);
});
test('a missing runtime identity is detected before sending any message',async()=>{
  const h=fixture();h.chrome.runtime.id=undefined;await assert.rejects(h.bridge.send({}),/请刷新/);assert.equal(h.calls,0);assert.equal(h.expired,1);
});
test('a response arriving after context invalidation is discarded',async()=>{
  const h=fixture();let resolve;h.chrome.runtime.sendMessage=()=>new Promise(r=>resolve=r);
  const pending=h.bridge.send({});h.chrome.runtime.id=undefined;resolve({ok:true});await assert.rejects(pending,/请刷新/);assert.equal(h.expired,1);
});
test('storage calls handle synchronous and asynchronous invalidation',async()=>{
  for(const mode of ['sync','async']){
    const h=fixture();const failure=()=>{if(mode==='sync')throw Error('Extension context invalidated.');return Promise.reject(Error('Extension context invalidated.'));};
    h.chrome.storage.local.get=failure;h.chrome.storage.local.set=failure;
    await assert.rejects(h.bridge.getLocal('settings'),/context invalidated/);await assert.rejects(h.bridge.setLocal({}),/请刷新/);assert.equal(h.expired,1);
  }
});
test('ordinary transport errors do not invalidate a healthy extension',async()=>{
  const h=fixture();h.chrome.runtime.sendMessage=()=>Promise.reject(Error('Receiving end does not exist.'));
  await assert.rejects(h.bridge.send({}),/Receiving end/);assert.equal(h.bridge.valid(),true);assert.equal(h.expired,0);
});
test('listener registration and stale callbacks handle context loss without throwing',()=>{
  const h=fixture();let callback,called=0;h.bridge.listen(()=>({addListener:fn=>callback=fn}),()=>called++);
  h.chrome.runtime.id=undefined;assert.equal(callback(),false);assert.equal(called,0);assert.equal(h.expired,1);
  const registration=fixture();assert.doesNotThrow(()=>registration.bridge.listen(()=>{throw Error('Extension context invalidated.');},()=>{}));assert.equal(registration.expired,1);
  const duringCallback=fixture();let late;duringCallback.bridge.listen(()=>({addListener:fn=>late=fn}),()=>{throw Error('Extension context invalidated.');});assert.doesNotThrow(()=>late());assert.equal(duringCallback.expired,1);
});
