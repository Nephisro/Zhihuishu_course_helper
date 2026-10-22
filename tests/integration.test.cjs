const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const core=require('../extension/core.js');
const apiConfig=require('../extension/api-config.js');
test('settings → API quiz → browser restart → restored settings and requests → clear',async()=>{
  const store={},sessionStore={};let listener,now=100000;const requests=[];
  const extensionId='test-extension',optionsUrl=`chrome-extension://${extensionId}/options.html`;
  const area=data=>({get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,data[k]])),set:async value=>Object.assign(data,value),remove:async key=>delete data[key]});
  const local=area(store),session=area(sessionStore),storage={local,session};
  const fields=Object.fromEntries(['endpoint','model','key','limit','status','save','test','clear','loadLog','switchLog'].map(id=>[id,{value:'',textContent:'',disabled:false}]));
  Object.assign(fields.endpoint,{value:'https://api.deepseek.com'});fields.model.value='test-model';fields.key.value='TEST_ONLY_NOT_A_REAL_KEY';fields.limit.value='30';
  const permissions={contains:async()=>true,request:async ({origins})=>{assert.deepEqual(Array.from(origins),['https://api.deepseek.com/*']);return true;}};
  const route=(message,sender)=>new Promise((resolve,reject)=>{now+=6000;try{const keep=listener(message,sender,resolve);if(keep===false)reject(new Error('Message not accepted'));}catch(e){reject(e);}});
  const runtime={id:extensionId,getURL:path=>`chrome-extension://${extensionId}/${path}`,onMessage:{addListener:fn=>listener=fn},sendMessage:message=>route(message,{id:extensionId,url:optionsUrl})};
  const worker={globalThis:null,ZhsCourseCore:core,ZhsApiConfig:apiConfig,URL,AbortController,setTimeout,clearTimeout,importScripts(){},Date:class extends Date{static now(){return now;}},chrome:{runtime,permissions,storage},
    fetch:async (url,options)=>{
      requests.push({url,body:JSON.parse(options.body)});
      const questions=JSON.parse(requests.at(-1).body.messages[1].content);
      const answers=questions.map(q=>({id:q.id,selected:q.question.includes('2 + 2')?[1]:[0,2]}));
      return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({answers})},finish_reason:'stop'}]})};
    }};
  worker.globalThis=worker;vm.runInNewContext(fs.readFileSync(require.resolve('../extension/background.js'),'utf8'),worker);
  const settings={globalThis:null,ZhsCourseCore:core,ZhsApiConfig:apiConfig,URL,document:{getElementById:id=>fields[id]},chrome:{runtime,permissions,storage}};
  settings.globalThis=settings;vm.runInNewContext(fs.readFileSync(require.resolve('../extension/options.js'),'utf8'),settings);
  await new Promise(setImmediate);await fields.save.onclick();
  assert.equal(store.zhsApi.endpoint,'https://api.deepseek.com/chat/completions');
  assert.equal(sessionStore.zhsApi,undefined);
  await fields.test.onclick();assert.match(fields.status.textContent,/测试通过/);assert.equal(requests.length,1);
  const flowPath=require.resolve('./flow.test.cjs'),localRequire=createRequire(flowPath);
  const sandbox={require:Object.assign(name=>name==='node:test'?{test(){}}:localRequire(name),{resolve:localRequire.resolve})};
  vm.runInNewContext(fs.readFileSync(flowPath,'utf8'),sandbox);
  const page=await sandbox.harness({api:true,autoQuiz:false,sendMessage:message=>route(message,{id:extensionId,url:'https://wisdom-mooc.zhihuishu.com/study/index',tab:{id:1}})});
  await page.start();page.flush();
  assert.equal(requests.length,2);assert.equal(requests[1].url,'https://api.deepseek.com/chat/completions');
  assert.deepEqual(Array.from(page.options,o=>o.clicks),[1,0,1]);assert.equal(page.submit.clicks,1);
  assert.equal(sessionStore.zhsApiUsage.count,2);assert.equal(store.zhsApiUsage,undefined);
  // A browser restart discards session storage and both JavaScript contexts.
  for(const key of Object.keys(sessionStore))delete sessionStore[key];
  const restartedWorker={...worker};restartedWorker.globalThis=restartedWorker;
  vm.runInNewContext(fs.readFileSync(require.resolve('../extension/background.js'),'utf8'),restartedWorker);
  for(const id of ['endpoint','model','key','limit'])fields[id].value='';
  const reopenedSettings={...settings};reopenedSettings.globalThis=reopenedSettings;
  vm.runInNewContext(fs.readFileSync(require.resolve('../extension/options.js'),'utf8'),reopenedSettings);
  await new Promise(setImmediate);
  assert.equal(fields.endpoint.value,'https://api.deepseek.com/chat/completions');assert.equal(fields.model.value,'test-model');
  assert.equal(fields.key.value,'TEST_ONLY_NOT_A_REAL_KEY');assert.equal(fields.limit.value,30);assert.match(fields.status.textContent,/已调用 0 次/);
  await fields.test.onclick();assert.match(fields.status.textContent,/测试通过/);assert.equal(requests.length,3);assert.equal(sessionStore.zhsApiUsage.count,1);
  // Clear also removes any old session copy so migration cannot bring it back.
  sessionStore.zhsApi={...store.zhsApi};await fields.clear.onclick();
  assert.equal(store.zhsApi,undefined);assert.equal(sessionStore.zhsApi,undefined);assert.equal(fields.key.value,'');assert.equal(sessionStore.zhsApiUsage.count,1);
  await fields.test.onclick();assert.match(fields.status.textContent,/请先.*API 设置/);assert.equal(requests.length,3);
});
