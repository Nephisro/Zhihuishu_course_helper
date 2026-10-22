(function(root) {
  'use strict';
  const core = typeof module === 'object' && module.exports ? require('./core.js') : root.ZhsCourseCore;
  const isChapter = title => !/(考试|期末|期中|结课|补考)/.test(title) &&
    /(?:章节|章末|单元|课后|阶段|第.{1,12}章).*(?:测试|测验|练习|作业)/.test(title);
  const fingerprint = q => JSON.stringify([q.id,q.number,q.type,q.question,q.options]);
  const sameIndices = (a,b) => a.length===b.length && [...a].sort((x,y)=>x-y).every((n,i)=>n===[...b].sort((x,y)=>x-y)[i]);
  const submissionPrompt = text => /提交|交卷/.test(text) && /确认|确定|是否|无法修改|不能修改/.test(text) &&
    !/未答|未完成|漏答|剩余.*题|验证码|安全验证/.test(text);
  const savingPrompt = text => /(?:确定|确认|是否).{0,20}(?:暂存|保存)作业/.test(core.normalize(text)) &&
    !/提交|交卷|删除|未答|未完成|漏答|验证码|安全验证/.test(text);

  function createRunner({page,solve,status=()=>{},now=Date.now}) {
    let running=false,busy=false,epoch=0,config={},phase='answer',exam=null,expected=1;
    let plan=null,mark='',deadline=0,retryAt=0,beforeNotice='',confirmed=false,saveConfirmed=false,completed=false;
    const saved=new Set();
    function stop(message) { running=false;epoch++;status(message); }
    function start(settings) {
      if(completed){status('本次章节测试处理已完成，不重复操作，请核对平台状态');return;}
      config={...settings};running=true;epoch++;retryAt=0;status('章节测试助手已启动');
    }
    async function tick() {
      if(!running||busy)return;
      busy=true;const run=epoch;
      const active=()=>running&&epoch===run;
      try {
        const s=page.read();
        if(s.captcha){status('请手动完成安全验证，完成后助手继续；不自动处理验证码');return;}
        if(phase==='submit'&&s.submitted){completed=true;stop('章节测试已提交成功，请核对平台成绩');return;}
        if(!isChapter(s.title)){stop('当前不是可识别的章节测试，请人工处理');return;}
        if(exam&&s.examKey!==exam.key){stop('测试页面已变化，已停止');return;}
        if(s.dialog){
          if(phase==='save'&&!saveConfirmed&&savingPrompt(s.dialog.text)&&s.dialog.confirmable&&s.atLastQuestion===true&&s.question&&fingerprint(s.question)===mark&&sameIndices(s.question.selected,plan)){
            saveConfirmed=true;page.confirm('save');deadline=now()+15000;status('已确认暂存，等待平台保存结果');return;
          }
          if(phase==='submit'&&!confirmed&&submissionPrompt(s.dialog.text)&&s.dialog.confirmable){
            confirmed=true;page.confirm('submit');deadline=now()+15000;status('已确认交卷，等待平台提交结果');return;
          }
          status('存在页面提示，请人工处理后继续');return;
        }
        if(phase==='submit'){
          if(now()>=deadline)stop('交卷结果未得到确认，请人工核对；不会重复提交');
          else status('等待平台确认提交结果，不重复交卷');
          return;
        }
        const q=s.question;
        if(!q?.question||!q.id){status('题干或题目标识尚未加载，等待页面；不提交空题干');return;}
        if(!exam){
          if(!Number.isInteger(s.total)||s.total<1||s.total>200||q.number!==1){stop('请从第 1 题启动，并确认题目总数已加载');return;}
          exam={key:s.examKey,total:s.total};
        }
        if(s.total!==exam.total){stop('题目总数已变化，请人工核对');return;}
        if(phase==='next'){
          if(q.number===expected+1){saved.add(expected);expected++;phase='answer';plan=null;mark='';}
          else if(q.number!==expected){stop('页面跳到了非预期题号，已停止');return;}
          else {if(now()>=deadline)stop('下一题未加载，已停止，不重复翻页');return;}
        }
        if(q.number!==expected){stop('当前题号已变化，请人工核对');return;}
        if(phase==='save'){
          if(fingerprint(q)!==mark||!sameIndices(q.selected,plan)){stop('末题答案发生变化，取消交卷');return;}
          if(s.savedNotice&&s.savedNotice!==beforeNotice&&s.atLastQuestion===true){
            saved.add(expected);
            if(saved.size!==exam.total){stop('尚未确认全部题目保存，取消交卷');return;}
            if(!config.autoSubmit){completed=true;stop('所有题目已暂存，请人工提交作业');return;}
            phase='submit';deadline=now()+15000;page.submit();status('所有题目已保存，已请求提交作业');return;
          }
          if(now()>=deadline)stop('暂存结果未得到确认，请人工核对');
          else status('正在等待暂存结果');
          return;
        }
        if(phase==='verify'){
          if(fingerprint(q)!==mark){stop('题目或选项发生变化，取消操作');return;}
          if(!sameIndices(q.selected,plan)){
            if(now()>=deadline)stop('页面未确认选项选中，已停止，不保存或翻页');
            return;
          }
          if(expected<exam.total){phase='next';deadline=now()+15000;page.next();status(`第 ${expected} 题已作答，保存并进入下一题`);}
          else {
            if(s.atLastQuestion!==true){if(now()>=deadline)stop('页面尚未就绪，请人工核对');else status('正在等待页面就绪');return;}
            if(saved.size!==exam.total-1){stop('尚未确认已依次处理全部题目，取消交卷');return;}
            if(config.autoSubmit){
              phase='submit';deadline=now()+15000;page.submit();status('全部题目已作答，已请求提交作业');
            } else {phase='save';saveConfirmed=false;beforeNotice=s.savedNotice||'';deadline=now()+15000;page.save();status('末题已作答，正在暂存整份测试');}
          }
          return;
        }
        if(!['single','multiple','boolean'].includes(q.type)||q.options.length<2||q.options.some(o=>!o.trim())||q.unsupportedMedia){stop(`第 ${expected} 题题型或内容不支持，请人工处理`);return;}
        if(now()<retryAt){status('等待 API 调用间隔，不重复发出网络请求');return;}
        let matched=core.matchQuestion(config.autoQuiz?config.bank:[],q.question,q.options,q.type==='multiple');
        mark=fingerprint(q);
        if(!matched.ok&&config.autoApi){
          status(`正在请求 API 解答第 ${expected} 题`);
          const result=await solve([{question:q.question,options:q.options,multiple:q.type==='multiple'}]);
          if(!active())return;
          const fresh=page.read();
          if(fresh.examKey!==exam.key||!fresh.question||fingerprint(fresh.question)!==mark){stop('API 返回前题目发生变化，未执行答案');return;}
          if(!result?.ok){
            if(Number.isFinite(result?.retryAfterMs)&&result.retryAfterMs>0&&result.retryAfterMs<=5000){retryAt=now()+result.retryAfterMs+100;status('等待 API 调用间隔');return;}
            stop(`API 已停止：${result?.error||'后台未响应'}；请人工处理或手动继续`);return;
          }
          matched=core.matchQuestion(core.validateBank(result.bank),q.question,q.options,q.type==='multiple');
        }
        if(!matched.ok){stop(`第 ${expected} 题${matched.reason}，请人工处理`);return;}
        const fresh=page.read();
        if(fresh.captcha||fresh.dialog){status('页面出现验证或提示，等待人工处理');return;}
        if(!fresh.question||fresh.examKey!==exam.key||fingerprint(fresh.question)!==mark){stop('执行前题目发生变化，已停止');return;}
        plan=matched.indices;
        if(fresh.question.selected.length&&!sameIndices(fresh.question.selected,plan)){stop('已有答案与匹配答案不同，保留现有选择，请人工核对');return;}
        phase='verify';deadline=now()+5000;
        if(!fresh.question.selected.length)page.select(plan);
        status(`第 ${expected} 题答案已选择，等待页面确认`);
      } catch(error){if(active())stop(`章节测试已停止：${error.message}`);}
      finally{busy=false;}
    }
    return {start,stop,tick,get running(){return running;},get completed(){return completed;}};
  }
  const api={createRunner,isChapter,submissionPrompt,savingPrompt};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ZhsChapterEngine=api;
})(globalThis);
