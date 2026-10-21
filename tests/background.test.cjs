const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const core=require('../extension/core.js');
const qs=[{question:'题目',options:['正确','错误'],multiple:false}];
function harness({limit=30,count=0,status=200,content='{"answers":[{"id":0,"answers":["正确"]}]}',permission=true,abort=false,endpoint='https://api.example.test/v1/chat/completions'}={}) {
  let listener,request,calls=0;
  const data={zhsApi:{endpoint,model:'test-model',key:'TEST_ONLY_NOT_A_REAL_KEY',limit},zhsApiUsage:{count,last:0}};
  const context={globalThis:null,ZhsCourseCore:core,URL,AbortController,setTimeout:()=>1,clearTimeout(){},importScripts(){},
    chrome:{runtime:{id:'test-extension',onMessage:{addListener:fn=>listener=fn}},storage:{session:{get:async()=>data,set:async value=>Object.assign(data,value)}},permissions:{contains:async()=>permission}},
    fetch:async(url,options)=>{calls++;request={url,options};if(abort)throw Object.assign(new Error(),{name:'AbortError'});return {ok:status===200,status,json:async()=>({choices:[{message:{content}}]})};}};
  context.globalThis=context;vm.runInNewContext(fs.readFileSync(require.resolve('../extension/background.js'),'utf8'),context);
  const sender={id:'test-extension',tab:{url:'https://wisdom-mooc.zhihuishu.com/study/index'}};
  return {data,get request(){return request;},get calls(){return calls;},send:questions=>new Promise(resolve=>listener({type:'zhsSolve',questions},sender,resolve)),unauthorized:()=>listener({type:'zhsSolve',questions:qs},{id:'other',tab:sender.tab},()=>{throw Error('unexpected reply');})};
}
test('background sends only question data with bearer auth and validates response',async()=>{
  const h=harness();const result=await h.send(qs);assert.equal(result.ok,true);assert.equal(h.calls,1);
  const req=h.request.options;assert.equal(req.credentials,'omit');assert.equal(req.redirect,'error');assert.equal(req.headers.Authorization,'Bearer TEST_ONLY_NOT_A_REAL_KEY');
  assert.equal(JSON.stringify(result).includes('TEST_ONLY'),false);assert.equal(JSON.parse(req.body).messages.length,2);
});
test('session request limit blocks network calls',async()=>{const h=harness({limit:2,count:2});assert.equal((await h.send(qs)).ok,false);assert.equal(h.calls,0);});
test('optional API domain permission is required',async()=>{const h=harness({permission:false});assert.equal((await h.send(qs)).ok,false);assert.equal(h.calls,0);});
test('API HTTP error is reported without leaking secret or provider body',async()=>{const h=harness({status:401});const r=await h.send(qs);assert.equal(r.ok,false);assert.match(r.error,/401/);assert.equal(JSON.stringify(r).includes('TEST_ONLY'),false);});
test('malformed or invented model answer is rejected',async()=>{for(const content of ['not json','{"answers":[{"id":0,"answers":["不存在"]}]}']){const h=harness({content});assert.equal((await h.send(qs)).ok,false);}});
test('aborted network call returns timeout message',async()=>{const h=harness({abort:true});const r=await h.send(qs);assert.equal(r.ok,false);assert.match(r.error,/25/);});
test('untrusted sender cannot invoke API',()=>{const h=harness();assert.equal(h.unauthorized(),false);assert.equal(h.calls,0);});
test('DeepSeek root URL requests actual completions endpoint in non-thinking JSON mode',async()=>{
  const h=harness({endpoint:'https://api.deepseek.com',content:'{"answers":[{"id":0,"selected":[0]}]}'});
  assert.equal((await h.send(qs)).ok,true);assert.equal(h.request.url,'https://api.deepseek.com/chat/completions');
  const body=JSON.parse(h.request.options.body);assert.deepEqual(body.thinking,{type:'disabled'});assert.deepEqual(body.response_format,{type:'json_object'});
});
