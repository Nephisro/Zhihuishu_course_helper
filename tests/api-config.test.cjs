const {test}=require('node:test');
const assert=require('node:assert/strict');
const configStore=require('../extension/api-config.js');
const config={endpoint:'https://api.example.test/v1/chat/completions',model:'test-model',key:'TEST_ONLY_NOT_A_REAL_KEY',limit:30};
function fixture(localData={},sessionData={}){
  const area=data=>({get:async key=>structuredClone({[key]:data[key]}),set:async values=>Object.assign(data,structuredClone(values)),remove:async key=>delete data[key]});
  return {localData,sessionData,storage:{local:area(localData),session:area(sessionData)}};
}
test('API settings persist in local storage independently of session usage',async()=>{
  const h=fixture({}, {zhsApiUsage:{count:3,last:1000}});await configStore.save(h.storage,config);
  assert.deepEqual(h.localData.zhsApi,config);assert.equal(h.sessionData.zhsApi,undefined);
  assert.deepEqual(h.sessionData.zhsApiUsage,{count:3,last:1000});
  const restarted=fixture(h.localData);assert.deepEqual(await configStore.read(restarted.storage),config);
});
test('available legacy session credentials migrate without resetting the session counter',async()=>{
  const h=fixture({}, {zhsApi:config,zhsApiUsage:{count:7,last:2000}});
  assert.deepEqual(await configStore.read(h.storage),config);assert.deepEqual(h.localData.zhsApi,config);
  assert.equal(h.sessionData.zhsApi,undefined);assert.equal(h.sessionData.zhsApiUsage.count,7);
});
test('persistent settings take precedence over older session credentials',async()=>{
  const h=fixture({zhsApi:config},{zhsApi:{...config,model:'old-model'}});
  assert.deepEqual(await configStore.read(h.storage),config);
});
test('failed migration preserves the available legacy settings',async()=>{
  const h=fixture({}, {zhsApi:config});h.storage.local.set=async()=>{throw new Error('storage unavailable');};
  await assert.rejects(configStore.read(h.storage),/storage unavailable/);assert.deepEqual(h.sessionData.zhsApi,config);
});
test('clearing removes both copies without restoring credentials or clearing other settings',async()=>{
  const h=fixture({zhsApi:config,zhsCourseHelper:{autoApi:true}}, {zhsApi:config,zhsApiUsage:{count:2,last:1000}});
  await configStore.clear(h.storage);assert.equal(await configStore.read(h.storage),null);
  assert.deepEqual(h.localData.zhsCourseHelper,{autoApi:true});assert.equal(h.sessionData.zhsApiUsage.count,2);
});
