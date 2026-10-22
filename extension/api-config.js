(function(root) {
  'use strict';
  async function read(storage) {
    const {zhsApi: saved}=await storage.local.get('zhsApi');
    if(saved)return saved;
    const {zhsApi: legacy}=await storage.session.get('zhsApi');
    if(!legacy)return null;
    await storage.local.set({zhsApi:legacy});
    await storage.session.remove('zhsApi');
    return legacy;
  }
  async function save(storage,config) {
    await storage.local.set({zhsApi:config});
    await storage.session.remove('zhsApi');
  }
  async function clear(storage) {
    // Clear the legacy copy first so a later read cannot restore removed credentials.
    await storage.session.remove('zhsApi');
    await storage.local.remove('zhsApi');
  }
  const api={read,save,clear};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ZhsApiConfig=api;
})(globalThis);
