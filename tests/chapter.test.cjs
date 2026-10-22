const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createRunner,isChapter,submissionPrompt,savingPrompt}=require('../extension/chapter-engine.js');
const {rendered,visibleOverlay,readContent}=require('../extension/chapter-dom.js');

function fixture({autoApi=false,autoSubmit=true,solve,bank,questions}={}){
  let clock=100000,index=0,last='';const statuses=[];
  const qs=questions||[
    {id:'q1',number:1,type:'single',question:'单选示例',options:['一','二'],selected:[]},
    {id:'q2',number:2,type:'multiple',question:'多选示例',options:['一','二','三'],selected:[]},
    {id:'q3',number:3,type:'boolean',question:'判断示例',options:['对','错'],selected:[]},
  ];
  const state={examKey:'test-exam',title:'第一章单元测试',total:qs.length,progress:0,savedNotice:'',dialog:null,captcha:false,submitted:false};
  const calls={select:0,next:0,save:0,submit:0,confirm:0,api:0};
  const page={
    read:()=>structuredClone({...state,atLastQuestion:state.atLastQuestion??index===qs.length-1,question:qs[index]}),
    select:indices=>{calls.select++;qs[index].selected=[...indices];state.progress=Math.round(qs.filter(q=>q.selected.length).length/qs.length*100);},
    next:()=>{calls.next++;index++;},
    save:()=>{calls.save++;state.progress=100;state.savedNotice='saved-unique:暂存成功';},
    submit:()=>{calls.submit++;state.dialog={text:'确认提交作业？提交后无法修改。',confirmable:true};},
    confirm:()=>{calls.confirm++;state.dialog=null;state.submitted=true;},
  };
  const config={autoQuiz:!autoApi,autoApi,autoSubmit,bank:bank||[
    {question:'单选示例',answers:['二']},{question:'多选示例',answers:['三','一']},{question:'判断示例',answers:['对']},
  ]};
  const runner=createRunner({page,now:()=>clock,status:text=>{last=text;statuses.push(text);},solve:async questions=>{calls.api++;return solve?solve(questions):{ok:false,error:'mock failure'};}});
  runner.start(config);
  return {runner,page,state,calls,qs,config,statuses,get last(){return last;},get index(){return index;},set index(v){index=v;},advance:ms=>clock+=ms,
    tick:()=>runner.tick(),finish:async()=>{for(let i=0;i<20&&runner.running;i++){await runner.tick();clock+=1000;}}};
}

test('chapter title guard accepts chapter tests and excludes final exams',()=>{
  for(const title of ['第一章单元测试','第二章测试','章节测验','第三单元练习'])assert.equal(isChapter(title),true,title);
  for(const title of ['期末考试','期中单元测试','结课测试','平时作业','第一章考试'])assert.equal(isChapter(title),false,title);
  assert.equal(submissionPrompt('确认提交作业，提交后无法修改'),true);
  assert.equal(submissionPrompt('还有未答题，是否提交作业？'),false);
  assert.equal(savingPrompt('提示\n你确定要暂存作业吗\n取消确定'),true);
  assert.equal(savingPrompt('你确定要提交作业吗'),false);
  assert.equal(submissionPrompt('你确定要暂存作业吗'),false);
});
test('single, multiple and boolean questions are saved in order before one submission',async()=>{
  const h=fixture();await h.finish();assert.deepEqual(h.qs.map(q=>q.selected),[[1],[2,0],[0]]);
  assert.deepEqual(h.calls,{select:3,next:2,save:0,submit:1,confirm:1,api:0});assert.equal(h.runner.completed,true);assert.match(h.last,/提交成功/);
  assert.equal(h.runner.outcome,'submitted');
  h.runner.start(h.config);await h.finish();assert.equal(h.calls.submit,1);
});
test('all questions can be saved with final submission disabled',async()=>{
  const h=fixture({autoSubmit:false});await h.finish();assert.equal(h.calls.save,1);assert.equal(h.calls.submit,0);assert.match(h.last,/人工提交/);
  assert.equal(h.runner.outcome,'saved');
});
test('missing local answer stops without guessing or flipping any options',async()=>{
  const h=fixture({bank:[]});await h.finish();assert.equal(h.calls.select,0);assert.equal(h.calls.next,0);assert.equal(h.calls.submit,0);
});
test('unsupported type and image content never reach API',async()=>{
  for(const extra of [{type:'essay'},{unsupportedMedia:true}]){
    const h=fixture({autoApi:true});Object.assign(h.qs[0],extra);await h.finish();assert.equal(h.calls.api,0);assert.equal(h.calls.select,0);
  }
});
test('pre-existing different selections are preserved and matching selections are not toggled',async()=>{
  const h=fixture();h.qs[0].selected=[0];await h.finish();assert.equal(h.calls.select,0);assert.deepEqual(h.qs[0].selected,[0]);
  const matching=fixture();matching.qs[0].selected=[1];await matching.finish();assert.equal(matching.calls.select,2);assert.equal(matching.calls.submit,1);
});
test('API failures stop after one request; explicit continue permits another attempt',async()=>{
  const h=fixture({autoApi:true});await h.finish();await h.tick();assert.equal(h.calls.api,1);assert.equal(h.calls.select,0);
  h.runner.start(h.config);await h.tick();assert.equal(h.calls.api,2);
});
test('API-only answers use option text and can finish the chapter',async()=>{
  const answers={'单选示例':['二'],'多选示例':['一','三'],'判断示例':['对']};
  const h=fixture({autoApi:true,solve:async qs=>({ok:true,bank:qs.map(q=>({question:q.question,answers:answers[q.question]}))})});
  await h.finish();assert.equal(h.calls.api,3);assert.equal(h.calls.submit,1);
});
test('rate-limit response waits before requesting again; actual failures are not retried',async()=>{
  let count=0;const h=fixture({autoApi:true,solve:async()=>++count===1?{ok:false,retryAfterMs:3000,error:'interval'}:{ok:false,error:'HTTP 401'}});
  await h.tick();h.advance(3000);await h.tick();assert.equal(h.calls.api,1);h.advance(101);await h.tick();assert.equal(h.calls.api,2);
  await h.tick();assert.equal(h.calls.api,2);assert.equal(h.runner.running,false);
});
test('stopping a pending API request prevents applying its result',async()=>{
  let resolve;const h=fixture({autoApi:true,solve:()=>new Promise(r=>resolve=r)});
  const pending=h.tick();h.runner.stop('manual stop');resolve({ok:true,bank:[{question:'单选示例',answers:['二']}]});await pending;assert.equal(h.calls.select,0);
});
test('changed question during an API request rejects the stale answer',async()=>{
  let resolve;const h=fixture({autoApi:true,solve:()=>new Promise(r=>resolve=r)});const pending=h.tick();h.qs[0].options.reverse();
  resolve({ok:true,bank:[{question:'单选示例',answers:['二']}]});await pending;assert.equal(h.calls.select,0);assert.equal(h.runner.running,false);
});
test('visible captcha pauses operations and resumes after manual clearance',async()=>{
  const h=fixture();h.state.captcha=true;await h.tick();assert.equal(h.calls.select,0);assert.equal(h.runner.running,true);
  h.state.captcha=false;await h.finish();assert.equal(h.calls.submit,1);
});
test('selection must be confirmed by the page before advancing',async()=>{
  const h=fixture();h.page.select=()=>h.calls.select++;await h.tick();h.advance(5001);await h.tick();assert.equal(h.calls.next,0);assert.equal(h.runner.running,false);
});
test('unexpected question jump or next-page timeout does not repeat navigation',async()=>{
  const jump=fixture();await jump.tick();await jump.tick();jump.index=2;await jump.tick();assert.equal(jump.calls.next,1);assert.equal(jump.calls.submit,0);assert.equal(jump.runner.running,false);
  const timeout=fixture();timeout.page.next=()=>timeout.calls.next++;await timeout.tick();await timeout.tick();timeout.advance(15001);await timeout.tick();assert.equal(timeout.calls.next,1);assert.equal(timeout.runner.running,false);
});
test('saving requires a new positive notice and a terminal page, independently of progress',async()=>{
  for(const saved of [{progress:100,savedNotice:''},{progress:100,savedNotice:'new:暂存成功',atLastQuestion:false}]){
    const h=fixture({autoSubmit:false});h.page.save=()=>{h.calls.save++;Object.assign(h.state,saved);};await h.finish();h.advance(16000);await h.tick();
    assert.equal(h.calls.submit,0);assert.equal(h.calls.save,1);assert.equal(h.runner.running,false);
  }
  const h=fixture({autoSubmit:false});h.page.save=()=>{h.calls.save++;h.state.progress=80;h.state.savedNotice='new:暂存成功';};
  await h.finish();assert.equal(h.runner.completed,true);assert.equal(h.calls.submit,0);
});
test('actual save-confirmation prompt is accepted once before waiting for saved success',async()=>{
  const h=fixture({autoSubmit:false});h.page.save=()=>{h.calls.save++;h.state.progress=80;h.state.dialog={text:'你确定要暂存作业吗',confirmable:true};};
  const confirmed=[];h.page.confirm=kind=>{h.calls.confirm++;confirmed.push(kind);h.state.dialog=null;if(kind==='save')h.state.savedNotice='actual-save-success:暂存成功';else h.state.submitted=true;};
  await h.finish();assert.deepEqual(confirmed,['save']);assert.equal(h.calls.save,1);assert.equal(h.calls.submit,0);assert.equal(h.runner.completed,true);
});
test('terminal navigation permits direct submission even with stale or missing progress',async()=>{
  for(const progress of [80,undefined]){
    const h=fixture();const select=h.page.select;h.page.select=indices=>{select(indices);h.state.progress=progress;};
    await h.finish();assert.equal(h.calls.submit,1);assert.equal(h.calls.save,0);assert.equal(h.runner.completed,true);
  }
});

test('terminal navigation is required for both submission and optional saving',async()=>{
  for(const autoSubmit of [true,false]){
    for(const marker of [false,undefined]){
      const h=fixture({autoSubmit});const read=h.page.read;h.page.read=()=>({...read(),atLastQuestion:marker});await h.finish();
      assert.equal(h.state.progress,100);assert.equal(h.calls.submit,0);assert.equal(h.calls.save,0);assert.equal(h.runner.running,false);
      assert.doesNotMatch(h.statuses.join('\n'),/完成率|100%|下一题.*消失|保存.*出现|检测/);
    }
  }
});

test('terminal marker still requires the final answer selection to be confirmed',async()=>{
  const h=fixture({questions:[{id:'q1',number:1,type:'single',question:'单选示例',options:['一','二'],selected:[]}]});
  h.page.select=()=>h.calls.select++;await h.finish();assert.equal(h.calls.submit,0);assert.equal(h.calls.save,0);
});

test('terminal marker on an earlier question does not skip ordered answering',async()=>{
  const h=fixture();h.state.atLastQuestion=true;await h.finish();assert.equal(h.calls.next,2);assert.equal(h.calls.select,3);assert.equal(h.calls.submit,1);
});
test('an incomplete-answer confirmation is never automatically accepted',async()=>{
  const h=fixture();h.page.submit=()=>{h.calls.submit++;h.state.dialog={text:'还有未答题，是否提交作业？',confirmable:true};};await h.finish();
  assert.equal(h.calls.submit,1);assert.equal(h.calls.confirm,0);
});
test('unconfirmed submission times out without repeated submit clicks',async()=>{
  const h=fixture();h.page.submit=()=>h.calls.submit++;await h.finish();h.advance(16000);await h.tick();assert.equal(h.calls.submit,1);assert.equal(h.runner.completed,false);assert.equal(h.runner.running,false);
});

test('grade feedback cannot complete submission before our confirmation',async()=>{
  const h=fixture();h.page.submit=()=>{h.calls.submit++;h.state.resultFeedback=true;h.state.dialog={text:'恭喜你本章测试取得满分！',confirmable:false};};
  await h.finish();assert.equal(h.calls.submit,1);assert.equal(h.calls.confirm,0);assert.equal(h.runner.outcome,null);assert.equal(h.runner.completed,false);
});

test('a success result from a different exam is rejected after confirmation',async()=>{
  const h=fixture();h.page.confirm=()=>{h.calls.confirm++;h.state.dialog=null;h.state.resultFeedback=true;h.state.submitted=true;h.state.examKey='different-exam';};
  await h.finish();assert.equal(h.calls.confirm,1);assert.equal(h.runner.completed,false);assert.equal(h.runner.outcome,null);assert.match(h.last,/页面已变化/);
});
test('invalid initial question number, changed exam and empty stem do not cause answers',async()=>{
  const h=fixture();h.index=1;await h.tick();assert.equal(h.calls.select,0);assert.equal(h.runner.running,false);
  const changed=fixture();await changed.tick();changed.state.examKey='another-exam';await changed.tick();assert.equal(changed.calls.next,0);
  const empty=fixture();empty.qs[0].question='';await empty.tick();assert.equal(empty.calls.select,0);assert.equal(empty.runner.running,true);
});

const style=e=>({display:'block',visibility:'visible',opacity:'1',...e.css});
function rectNode(rect={left:0,top:0,right:300,bottom:150}){
  return {parentElement:null,css:{},getClientRects:()=>[rect],getBoundingClientRect:()=>rect,contains:()=>false};
}
test('preloaded captcha offscreen or under a transparent ancestor is not visible',()=>{
  const offscreen=rectNode({left:0,right:300,top:-1000000,bottom:-999850});offscreen.parentElement=rectNode();offscreen.parentElement.css.opacity='0';
  assert.equal(rendered(offscreen,style),false);assert.equal(visibleOverlay(offscreen,{style,width:1200,height:800,hit:()=>offscreen}),false);
  offscreen.parentElement.css.opacity='1';assert.equal(visibleOverlay(offscreen,{style,width:1200,height:800,hit:()=>offscreen}),false);
  const visible=rectNode();assert.equal(visibleOverlay(visible,{style,width:1200,height:800,hit:()=>visible}),true);
});
test('closed shadow DOM text is read with the extension DOM API while hidden text is ignored',()=>{
  const text=value=>({nodeType:3,textContent:value});
  const node=(children=[],tagName='DIV')=>({nodeType:1,tagName,childNodes:children});
  const host=node(),closed={nodeType:11,childNodes:[node([text('可见题干')])]};
  const hidden=node([text('隐藏内容')]);hidden.hidden=true;
  const root=node([host,hidden]);const result=readContent(root,{shadow:e=>e===host?closed:null,visible:e=>!e.hidden});
  assert.deepEqual(result,{text:'可见题干',hasMedia:false});
  closed.childNodes.push(node([],'IMG'));assert.equal(readContent(root,{shadow:e=>e===host?closed:null,visible:e=>!e.hidden}).hasMedia,true);
});
