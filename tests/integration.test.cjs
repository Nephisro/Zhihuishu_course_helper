const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const core=require('../extension/core.js');
test('settings Base URL → worker API self-test → API-only quiz → selection and submit',async()=>{
  const store={};let listener,now=100000;const requests=[];
  const extensionId='test-extension',optionsUrl=`chrome-extension://${extensionId}/options.html`;
  const session={get:async keys=>Object.fromEntries(keys.map(k=>[k,store[k]])),set:async data=>Object.assign(store,data),remove:async key=>delete store[key]};
  const fields=Object.fromEntries(['endpoint','model','key','limit','status','save','test','clear','loadLog','switchLog'].map(id=>[id,{value:'',textContent:'',disabled:false}]));
  Object.assign(fields.endpoint,{value:'https://api.deepseek.com'});fields.model.value='test-model';fields.key.value='TEST_ONLY_NOT_A_REAL_KEY';fields.limit.value='30';
  const permissions={contains:async()=>true,request:async ({origins})=>{assert.deepEqual(Array.from(origins),['https://api.deepseek.com/*']);return true;}};
  const route=(message,sender)=>new Promise((resolve,reject)=>{now+=6000;try{const keep=listener(message,sender,resolve);if(keep===false)reject(new Error('Message not accepted'));}catch(e){reject(e);}});
  const runtime={id:extensionId,getURL:path=>`chrome-extension://${extensionId}/${path}`,onMessage:{addListener:fn=>listener=fn},sendMessage:message=>route(message,{id:extensionId,url:optionsUrl})};
  const worker={globalThis:null,ZhsCourseCore:core,URL,AbortController,setTimeout,clearTimeout,importScripts(){},Date:class extends Date{static now(){return now;}},chrome:{runtime,permissions,storage:{session}},
    fetch:async (url,options)=>{
      requests.push({url,body:JSON.parse(options.body)});
      const questions=JSON.parse(requests.at(-1).body.messages[1].content);
      const answers=questions.map(q=>({id:q.id,selected:q.question.includes('2 + 2')?[1]:[0,2]}));
      return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({answers})},finish_reason:'stop'}]})};
    }};
  worker.globalThis=worker;vm.runInNewContext(fs.readFileSync(require.resolve('../extension/background.js'),'utf8'),worker);
  const settings={globalThis:null,ZhsCourseCore:core,URL,document:{getElementById:id=>fields[id]},chrome:{runtime,permissions,storage:{session}}};
  settings.globalThis=settings;vm.runInNewContext(fs.readFileSync(require.resolve('../extension/options.js'),'utf8'),settings);
  await Promise.resolve();await fields.save.onclick();
  assert.equal(store.zhsApi.endpoint,'https://api.deepseek.com/chat/completions');
  await fields.test.onclick();assert.match(fields.status.textContent,/测试通过/);assert.equal(requests.length,1);
  const flowPath=require.resolve('./flow.test.cjs'),localRequire=createRequire(flowPath);
  const sandbox={require:Object.assign(name=>name==='node:test'?{test(){}}:localRequire(name),{resolve:localRequire.resolve})};
  vm.runInNewContext(fs.readFileSync(flowPath,'utf8'),sandbox);
  const page=await sandbox.harness({api:true,autoQuiz:false,sendMessage:message=>route(message,{id:extensionId,url:'https://wisdom-mooc.zhihuishu.com/study/index',tab:{id:1}})});
  await page.start();page.flush();
  assert.equal(requests.length,2);assert.equal(requests[1].url,'https://api.deepseek.com/chat/completions');
  assert.deepEqual(Array.from(page.options,o=>o.clicks),[1,0,1]);assert.equal(page.submit.clicks,1);
  assert.equal(store.zhsApiUsage.count,2);
});
