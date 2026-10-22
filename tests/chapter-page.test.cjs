const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

class E {
  constructor(text=''){this.nodeType=1;this.tagName='DIV';this.textContent=text;this.innerText=text;this.map={};this.style={};this.childNodes=text?[{nodeType:3,textContent:text}]:[];this.checked=false;this.clicks=0;}
  querySelectorAll(s){return this.map[s]||[];}querySelector(s){return this.querySelectorAll(s)[0]||null;}
  getClientRects(){return this.hidden?[]:[{}];}getAttribute(){return null;}addEventListener(){}click(){this.clicks++;this.onClick?.();}
}
async function pageHarness({autoChapter=false,title='第一章单元测试',highlight=false,progress=100,navigation='last',managed=false,submitSuccess=true,api=false,feedback=null,preexistingFeedback=false,flowId='managed-flow',onComplete}={}){
  const ids={},requests=[],timers=[],shadow=new WeakMap(),store={zhsCourseHelper:{autoQuiz:false,autoApi:autoChapter||api,autoChapter,bank:[]}};
  const document=new E(),root=new E();document.documentElement=root;root.append=()=>{};document.getElementById=()=>null;
  document.createElement=()=>{
    const host=new E();host.attachShadow=()=>({set innerHTML(html){for(const m of html.matchAll(/id="([^"]+)"/g))ids[m[1]]=new E();ids.autoSubmit.checked=true;},getElementById:id=>ids[id]});return host;
  };
  const stem=new E(),closed={nodeType:11,childNodes:[new E('封闭题干示例')]};shadow.set(stem,closed);
  const subject=new E(),number=new E('1.'),anchor=new E();anchor.id='sample-question';
  const nodes=['选项一','选项二'].map(text=>{
    const node=new E(),answer=new E(text),input=new E(),label=new E();input.checked=false;
    label.onClick=()=>{nodes.forEach(n=>{n.querySelector('input').checked=false;n.map['.onChecked']=[];});if(highlight)node.map['.onChecked']=[answer];else input.checked=true;};
    node.map['.examquestions-answer']=[answer];node.map.input=[input];node.map['.label']=[label];return node;
  });
  subject.map['.subject_describe']=[stem];subject.map['.subject_type']=[new E('【单选题】')];subject.map['.subject_num']=[number];subject.map['.subject_num span']=[anchor];subject.map['.subject_node .nodeLab']=nodes;
  const metadata=new E();metadata.map.label=[new E('题目数')];metadata.map.span=[new E('1')];
  const heading=new E(title);document.map.h1=[heading];document.map['.examPaper_subject']=[subject];document.map['.answerCard_list li']=[new E('1')];document.map.li=[metadata];document.map['.percentage_tit em']=[new E('0%')];
  for(const node of nodes){const choose=node.querySelector('.label').onClick;node.querySelector('.label').onClick=()=>{choose();document.map['.percentage_tit em'][0].textContent=progress+'%';};}
  const nav=new E(),next=new E('下一题'),bottomSave=new E('保存'),outsideSave=new E('保存');
  nav.map.button=[next,bottomSave];next.hidden=navigation==='last';bottomSave.hidden=navigation==='next';
  document.map['.switch-btn-box']=navigation==='missing'?[]:navigation==='duplicate'?[nav,new E()]:[nav];
  const submit=new E('提交作业'),save=new E('暂存作业'),confirm=new E('\n  确定\n'),cancel=new E('取消'),dialog=new E('提示\n是否确认提交?提交后,批阅过的试卷不能再修改!\n取消确定');
  const resultDialog=new E('同学\n'+(feedback?.text||'恭喜你本章测试取得满分！')+'\n每日6点更新\n返回作业考试\n练一练');
  const returnButton=new E('返回作业考试'),practiceButton=new E('练一练');
  resultDialog.map['.userinfo .desc']=[new E(feedback?.text||'恭喜你本章测试取得满分！')];
  resultDialog.map['.btns button']=feedback?.missingActions?[]:[returnButton,practiceButton];
  resultDialog.hidden=!!feedback?.hidden;
  const showFeedback=()=>{
    document.map['.el-dialog,.el-message-box']=[resultDialog];
    document.map['.el-dialog.dialog-has-ai-training-btn']=feedback?.wrongClass?[]:[resultDialog];
  };
  dialog.map.button=[cancel,confirm];document.map.button=[submit,save,outsideSave,next,bottomSave];
  if(preexistingFeedback)showFeedback();
  submit.onClick=()=>{document.map['.el-dialog,.el-message-box']=[dialog];};
  confirm.onClick=()=>{document.map['.el-dialog,.el-message-box']=[];if(feedback)showFeedback();else if(submitSuccess){const notice=new E('提交成功');notice.id='submit-success';document.map['.el-message']=[notice];}};
  let messageHandler;const lifecycle=[];
  const sandbox={globalThis:null,document,location:new URL('https://onlineexamh5new.zhihuishu.com/stuExamWeb.html#/webExamList/dohomework/example'),window:{addEventListener(){}},
    getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'}),setInterval:fn=>{timers.push(fn);return 1;},clearInterval(){},
    chrome:{dom:{openOrClosedShadowRoot:e=>shadow.get(e)||null},storage:{onChanged:{addListener(){}},local:{get:async()=>store,set:async value=>Object.assign(store,value)}},
      runtime:{id:'test-extension',onMessage:{addListener:fn=>messageHandler=fn},sendMessage:async message=>{
        if(message.type==='zhsChapterFlowClaim')return {ok:true,managed,id:flowId};
        if(message.type==='zhsChapterFlowComplete'){lifecycle.push(message);return onComplete?onComplete(message):{ok:true};}
        requests.push(message);return {ok:true,bank:[{question:'封闭题干示例',answers:['选项二']}]};
      }}},
  };
  sandbox.globalThis=sandbox;
  for(const file of ['core.js','chapter-engine.js','chapter-dom.js','chapter.js'])vm.runInNewContext(fs.readFileSync(require.resolve('../extension/'+file),'utf8'),sandbox);
  await new Promise(setImmediate);
  return {ids,requests,nodes,store,heading,submit,save,confirm,cancel,nav,next,bottomSave,outsideSave,lifecycle,returnButton,practiceButton,
    cancelManaged:()=>messageHandler({type:'zhsChapterFlowCancelled'},{id:'test-extension'},()=>{}),poll:()=>timers[0]()};
}
test('chapter page reads closed question text and exposes API mode independently of local bank',async()=>{
  const h=await pageHarness();h.ids.inspect.onclick();assert.match(h.ids.status.textContent,/封闭题干示例/);assert.match(h.ids.status.textContent,/选项：2/);assert.match(h.ids.status.textContent,/可见验证码：无/);
  h.ids.autoApi.checked=true;await h.ids.autoApi.onchange();assert.equal(h.store.zhsCourseHelper.autoApi,true);assert.equal(h.store.zhsCourseHelper.autoQuiz,false);
  h.ids.toggle.onclick();await new Promise(setImmediate);
  assert.equal(h.requests.length,1);assert.equal(h.requests[0].type,'zhsChapterSolve');assert.equal(h.requests[0].questions[0].question,'封闭题干示例');
  assert.equal(h.nodes[0].querySelector('input').checked,false);assert.equal(h.nodes[1].querySelector('input').checked,true);
});
test('automatic chapter startup waits for SPA title and stays stopped after manual stop',async()=>{
  const h=await pageHarness({autoChapter:true,title:''});assert.equal(h.requests.length,0);
  h.heading.innerText='第一章单元测试';h.poll();await new Promise(setImmediate);assert.equal(h.requests.length,1);
  h.ids.toggle.onclick();h.poll();await new Promise(setImmediate);assert.equal(h.requests.length,1);assert.match(h.ids.status.textContent,/已停止/);
});
test('platform onChecked highlights count as selected even when hidden input.checked stays false',async()=>{
  const h=await pageHarness({highlight:true});h.ids.autoApi.checked=true;await h.ids.autoApi.onchange();h.ids.toggle.onclick();await new Promise(setImmediate);
  assert.equal(h.nodes[1].querySelector('input').checked,false);h.ids.inspect.onclick();assert.match(h.ids.status.textContent,/已选：1/);
});
test('actual submit-confirmation wording and its unique confirm button complete direct submission',async()=>{
  const h=await pageHarness({highlight:true,progress:80});h.ids.autoApi.checked=true;await h.ids.autoApi.onchange();h.ids.toggle.onclick();await new Promise(setImmediate);
  for(let i=0;i<4;i++){h.poll();await new Promise(setImmediate);}
  assert.equal(h.submit.clicks,1);assert.equal(h.save.clicks,0);assert.equal(h.confirm.clicks,1);assert.equal(h.cancel.clicks,0);assert.match(h.ids.status.textContent,/提交成功/);
  assert.equal(h.bottomSave.clicks,0);assert.equal(h.outsideSave.clicks,0);
});

test('only a unique terminal question navigation allows submission, regardless of 100 percent progress',async()=>{
  for(const navigation of ['next','both','missing','duplicate','disabled','duplicate-save','empty']){
    const h=await pageHarness({navigation});
    if(navigation==='disabled')h.bottomSave.disabled=true;
    if(navigation==='duplicate-save')h.nav.map.button.push(new E('保存'));
    if(navigation==='empty')h.nav.map.button=[];
    // These cases show no Next button but still do not provide a valid terminal control.
    if(['disabled','duplicate-save','empty'].includes(navigation))h.next.hidden=true;
    h.ids.autoApi.checked=true;await h.ids.autoApi.onchange();h.ids.toggle.onclick();await new Promise(setImmediate);
    for(let i=0;i<3;i++){
      h.poll();await new Promise(setImmediate);
      assert.doesNotMatch(h.ids.status.textContent,/完成率|100%|下一题.*消失|保存.*出现|检测/);
    }
    assert.equal(h.submit.clicks,0,navigation);assert.equal(h.save.clicks,0,navigation);assert.equal(h.confirm.clicks,0,navigation);
    h.ids.inspect.onclick();assert.doesNotMatch(h.ids.status.textContent,/完成率|100%|下一题|保存|检测/);
  }
});

test('a disabled visible Next still blocks submission until it disappears',async()=>{
  const h=await pageHarness({navigation:'both',progress:80});h.next.disabled=true;
  h.ids.autoApi.checked=true;await h.ids.autoApi.onchange();h.ids.toggle.onclick();await new Promise(setImmediate);
  h.poll();await new Promise(setImmediate);assert.equal(h.submit.clicks,0);
  h.next.hidden=true;
  for(let i=0;i<3;i++){h.poll();await new Promise(setImmediate);}
  assert.equal(h.submit.clicks,1);assert.equal(h.confirm.clicks,1);assert.match(h.ids.status.textContent,/提交成功/);
});

test('managed tests automatically answer and report verified submission once',async()=>{
  const h=await pageHarness({managed:true,api:true,highlight:true});assert.equal(h.requests.length,1);
  for(let i=0;i<7;i++){h.poll();await new Promise(setImmediate);}
  assert.equal(h.submit.clicks,1);assert.equal(h.confirm.clicks,1);assert.equal(h.lifecycle.length,1);assert.equal(h.lifecycle[0].id,'managed-flow');
});

test('unconfirmed submission and manual tests never request automatic closure',async()=>{
  for(const options of [{managed:true,submitSuccess:false},{managed:false,autoChapter:true}]){
    const h=await pageHarness({...options,api:true});
    for(let i=0;i<5;i++){h.poll();await new Promise(setImmediate);}
    assert.equal(h.confirm.clicks,1);assert.equal(h.lifecycle.length,0);
  }
});

test('course cancellation stops a managed child without auto restart or completion',async()=>{
  const h=await pageHarness({managed:true,api:true,autoChapter:true});h.cancelManaged();
  for(let i=0;i<4;i++){h.poll();await new Promise(setImmediate);}
  assert.equal(h.submit.clicks,0);assert.equal(h.lifecycle.length,0);assert.match(h.ids.status.textContent,/衔接已停止/);
});

test('actual full-mark feedback after confirmation completes the owned return once',async()=>{
  const h=await pageHarness({managed:true,api:true,feedback:{}});
  for(let i=0;i<7;i++){h.poll();await new Promise(setImmediate);}
  assert.equal(h.submit.clicks,1);assert.equal(h.confirm.clicks,1);assert.equal(h.lifecycle.length,1);
  assert.equal(h.returnButton.clicks,0);assert.equal(h.practiceButton.clicks,0);assert.match(h.ids.status.textContent,/正在返回课程/);
});

test('result feedback detection does not depend on full marks or completion percentage',async()=>{
  const h=await pageHarness({managed:true,api:true,progress:80,feedback:{text:'本章测试成绩：80分'}});
  for(let i=0;i<5;i++){h.poll();await new Promise(setImmediate);}
  assert.equal(h.lifecycle.length,1);assert.equal(h.confirm.clicks,1);
});

test('hidden, unrelated and structurally incomplete feedback never triggers closure',async()=>{
  for(const feedback of [{hidden:true},{wrongClass:true},{missingActions:true},{text:'请先完成本章练习'}]){
    const h=await pageHarness({managed:true,api:true,feedback});
    for(let i=0;i<5;i++){h.poll();await new Promise(setImmediate);}
    assert.equal(h.lifecycle.length,0);assert.equal(h.confirm.clicks,1);
  }
});

test('pre-existing feedback and manually opened result tabs never request closure',async()=>{
  for(const options of [{managed:true,preexistingFeedback:true},{managed:false,autoChapter:true}]){
    const h=await pageHarness({api:true,feedback:{},...options});
    for(let i=0;i<5;i++){h.poll();await new Promise(setImmediate);}
    assert.equal(h.lifecycle.length,0);
    if(options.preexistingFeedback)assert.equal(h.submit.clicks,0);
  }
});
