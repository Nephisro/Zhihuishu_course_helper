(function(root){
  'use strict';
  const refreshMessage='扩展已更新或重新加载，请刷新当前页面后继续';
  const isInvalidation=error=>/extension context invalidated/i.test(String(error?.message||error));
  function create({onInvalidated=()=>{}}={}){
    let invalidated=false;
    function expire(){if(!invalidated){invalidated=true;onInvalidated();}}
    function valid(){
      if(invalidated)return false;
      try{if(root.chrome?.runtime?.id)return true;}catch{}
      expire();return false;
    }
    async function call(operation){
      if(!valid())throw new Error(refreshMessage);
      try{const result=await operation();if(!valid())throw new Error(refreshMessage);return result;}
      catch(error){if(isInvalidation(error)||!valid())expire();throw error;}
    }
    function listen(event,callback){
      if(!valid())return;
      try{event()?.addListener((...args)=>{
        if(!valid())return false;
        try{return callback(...args);}catch(error){if(isInvalidation(error)||!valid()){expire();return false;}throw error;}
      });}
      catch(error){if(isInvalidation(error)||!valid())expire();else throw error;}
    }
    return {
      valid,listen,
      send:message=>call(()=>root.chrome.runtime.sendMessage(message)),
      getLocal:key=>call(()=>root.chrome.storage.local.get(key)),
      setLocal:data=>call(()=>root.chrome.storage.local.set(data)),
      get invalidated(){return invalidated;},
    };
  }
  root.ZhsPageRuntime={create,refreshMessage,isInvalidation};
})(globalThis);
