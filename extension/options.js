'use strict';
const $ = id => document.getElementById(id);
$('loadLog').onclick=async()=>{
  try{const {zhsSwitchLog=[]}=await chrome.storage.local.get('zhsSwitchLog');$('switchLog').value=zhsSwitchLog.length?JSON.stringify(zhsSwitchLog,null,2):'尚无切课记录';}
  catch(error){$('switchLog').value=`读取失败：${error.message}`;}
};
Promise.all([globalThis.ZhsApiConfig.read(chrome.storage),chrome.storage.session.get('zhsApiUsage')]).then(([config,{zhsApiUsage}]) => {
  if (config) for (const field of ['endpoint','model','key','limit']) $(field).value = config[field];
  $('status').textContent = `本次会话已调用 ${zhsApiUsage?.count || 0} 次`;
}).catch(error=>{$('status').textContent=`读取 API 设置失败：${error.message}`;});
$('save').onclick = async () => {
  try {
    const endpoint = new URL(globalThis.ZhsCourseCore.apiEndpoint($('endpoint').value));
    const model = $('model').value.trim(), key = $('key').value.trim(), limit = Number($('limit').value);
    if (!model || !key || !Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('请填写模型和 API Key，调用上限为 1–500 的整数');
    const granted = await chrome.permissions.request({origins:[`${endpoint.origin}/*`]});
    if (!granted) throw new Error('未授权 API 域名访问权限');
    await globalThis.ZhsApiConfig.save(chrome.storage,{endpoint:endpoint.href,model,key,limit});
    $('endpoint').value = endpoint.href;
    $('status').textContent = `已保存到本机，关闭浏览器后仍保留。实际请求地址：${endpoint.href}\n请先点击“测试 API 答题”，通过后回到课程页勾选“新题调用 API”。`;
  } catch (error) { $('status').textContent = error.message; }
};
$('test').onclick = async () => {
  $('test').disabled = true;
  $('status').textContent = '正在通过扩展后台测试真实答题请求，最多等待 25 秒；会消耗一次调用额度。';
  try {
    const result = await chrome.runtime.sendMessage({type:'zhsTestApi'});
    if (!result?.ok) throw new Error(result?.error || '扩展后台未响应，请重新加载扩展并刷新设置页');
    $('status').textContent = '测试通过：域名权限、后台请求、模型响应和答案解析均正常。回课程页开启“新题调用 API”即可。';
  } catch (error) { $('status').textContent = `测试失败：${error.message}`; }
  finally { $('test').disabled = false; }
};
$('clear').onclick = async () => {
  try {
    await globalThis.ZhsApiConfig.clear(chrome.storage);
    for (const field of ['endpoint','model','key']) $(field).value = '';
    $('status').textContent = '本机 API 配置和密钥已清除；本次会话调用计数保留。已发出的请求可能仍会完成。';
  } catch(error) { $('status').textContent=`清除 API 设置失败：${error.message}`; }
};
